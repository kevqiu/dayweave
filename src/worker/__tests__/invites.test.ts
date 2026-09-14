/**
 * The invite flow, driven end to end against the real routes.
 *
 * There is no way to deploy from a session with no Cloudflare token, and this
 * is the part of the app where being wrong is expensive — a membership check
 * that does not check, or a link that joins somebody the moment they open it.
 * So the Worker is run here over SQLite with the actual migrations applied,
 * and the flow is walked the way a person walks it: Mika makes a trip, copies
 * a link, Jordan opens it in a browser that has never been here before.
 *
 * `node:sqlite` stands in for D1. The subset of the binding this app uses is
 * small — prepare, bind, first, all, run, batch — and it is the same SQL.
 */

import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../index.ts";
import { createTrip } from "../store.ts";

/**
 * Better Auth exchanges the code here, and this is the only network call a
 * sign-in makes: its Google provider reads the profile by decoding the
 * `id_token` it gets back rather than fetching userinfo, and verifies the
 * signature only on the id-token path this app does not use. So stubbing one
 * endpoint is the whole of the stand-in.
 */
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// --- the D1 binding, over SQLite --------------------------------------------

type Row = Record<string, unknown>;

/**
 * One prepared statement.
 *
 * `all()` carries a `meta` alongside the rows because Better Auth's Kysely
 * adapter reads `changes` and `last_row_id` off it to report what a write did,
 * and D1 puts them there. The app's own code only ever reads `results`.
 */
class Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params);
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[])) as Row | undefined;
    return (row === undefined ? null : ({ ...row } as T)) as T | null;
  }

  async all<T>() {
    const prepared = this.db.prepare(this.sql);
    // A statement that returns no rows — an INSERT, an UPDATE, a PRAGMA that
    // writes — throws from `all()` on node:sqlite, where D1 answers with an
    // empty list and a populated `meta`.
    try {
      const rows = prepared.all(...(this.params as never[])) as Row[];
      return { results: rows.map((r) => ({ ...r })) as T[], success: true, meta: EMPTY_META };
    } catch {
      const info = prepared.run(...(this.params as never[]));
      return {
        results: [] as T[],
        success: true,
        meta: { changes: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0) },
      };
    }
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...(this.params as never[]));
    return {
      success: true,
      meta: { changes: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0) },
    };
  }
}

const EMPTY_META = { changes: 0, last_row_id: 0 };

function testDatabase() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../../db/migrations/", import.meta.url);
  for (const file of readdirSync(dir).sort()) {
    db.exec(readFileSync(new URL(file, dir), "utf8"));
  }

  /**
   * `exec` is not used by this app, and it is the reason it is here: Better
   * Auth's Kysely adapter decides a binding is D1 by finding `batch`, `exec`
   * and `prepare` on it, and without the third it refuses to initialise at all.
   */
  return {
    prepare: (sql: string) => new Statement(db, sql),
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
    // D1 hands back one result per statement, in order. Better Auth's
    // introspector reads the rows off each, so they cannot be dropped.
    batch: async (statements: Statement[]) =>
      await Promise.all(statements.map((statement) => statement.all())),
  };
}

/** KV, for sessions and for the ten minutes a sign-in is in flight. */
function testKv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    // Better Auth passes an expirationTtl. Nothing here runs long enough for it
    // to matter, so it is accepted and dropped.
    put: async (key: string, value: string, _options?: unknown) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
  };
}

/**
 * Google, stood in for.
 *
 * The Worker makes exactly one network call during a sign-in — the code for
 * the tokens — so that is the only thing stubbed. Who is signing in rides in
 * the code itself, so the stub needs no state of its own and two browsers can
 * be signing in at once.
 */
const encode = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

interface GoogleUser {
  sub: string;
  name: string;
  email: string;
}

const codeFor = (who: GoogleUser) => encode(who);

const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== TOKEN_ENDPOINT) return realFetch(input as never, init);

    const sent = new URLSearchParams(String(init?.body ?? ""));
    const who = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob((sent.get("code") ?? "").replace(/-/g, "+").replace(/_/g, "/")), (ch) =>
          ch.charCodeAt(0),
        ),
      ),
    ) as GoogleUser;

    return Response.json({
      access_token: "at-" + who.sub,
      refresh_token: "rt-" + who.sub,
      expires_in: 3599,
      token_type: "Bearer",
      scope: "openid email profile",
      id_token: `${encode({ alg: "RS256", kid: "test" })}.${encode({
        ...who,
        email_verified: true,
        // Better Auth reads these off the token like any OIDC client would.
        iss: "https://accounts.google.com",
        aud: "client.apps.googleusercontent.com",
        exp: Math.floor(Date.now() / 1000) + 3599,
        iat: Math.floor(Date.now() / 1000),
      })}.signature`,
    });
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

// --- a browser --------------------------------------------------------------

const ORIGIN = "https://yvr.kocho.sh";

/** One browser: it keeps its cookies, and it forgets them when it is new. */
function browser(env: Record<string, unknown>) {
  const jar = new Map<string, string>();

  const request = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (jar.size) {
      headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    if (init.body) headers.set("content-type", "application/json");

    const response = await app.request(
      `${ORIGIN}${path}`,
      { ...init, headers, redirect: "manual" },
      env as never,
    );

    // Workers types describe the workerd Headers, which has no getSetCookie.
    // This runs on Node, where it does, and it is the only way to read two
    // set-cookie headers off one response.
    const sent = response.headers as unknown as { getSetCookie(): string[] };
    for (const cookie of sent.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      if (/Max-Age=0/i.test(cookie) || value === "") jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  };

  return {
    jar,
    request,
    get: (path: string) => request(path),
    post: async (path: string, body: unknown = {}) =>
      request(path, { method: "POST", body: JSON.stringify(body) }),
    json: async <T>(path: string): Promise<T> => (await request(path)).json() as Promise<T>,
  };
}

interface Session {
  me: { id: string; name: string; initials: string } | null;
  invite: {
    tripId: string;
    sentence: string;
    when: string;
    from: { initials: string; color: string };
  } | null;
  trips: { id: string; name: string }[];
}

let env: Record<string, unknown>;

beforeEach(() => {
  env = {
    DB: testDatabase(),
    SESSIONS: testKv(),
    GOOGLE_MAPS_BROWSER_KEY: "",
    GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "secret",
    // Better Auth signs the session cookie with this, so a test that does not
    // set it signs everybody in as nobody.
    BETTER_AUTH_SECRET: "test-secret-not-a-real-one",
    DEPLOY_COMMIT: "0123456789abcdef0123456789abcdef01234567",
  };
});

/**
 * Signing in, the whole way round: the button, Google, and the callback.
 *
 * Walking it rather than reaching into the database is the point — Better Auth
 * owns the state, the PKCE verifier and the cookie, and only the round trip
 * exercises what it actually does with them. `sign-in/social` hands back the
 * URL it wants the browser to visit; the callback is that URL's `redirect_uri`
 * with the code Google would have put on it.
 */
async function signIn(who: ReturnType<typeof browser>, person: GoogleUser) {
  const started = await who.post("/api/auth/sign-in/social", {
    provider: "google",
    callbackURL: "/",
  });
  const { url } = (await started.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");

  return await who.get(
    `/api/auth/callback/google?code=${codeFor(person)}&state=${encodeURIComponent(state ?? "")}`,
  );
}

/**
 * The session cookie Better Auth sets: opaque, signed, and `__Secure-` prefixed
 * because the test origin is https, exactly as it is in production.
 */
const SESSION_COOKIE = "__Secure-better-auth.session_token";

/**
 * What the Trips screen is handed: who you are, what is waiting, what you have.
 *
 * Signed out this is a 401 and the client shows the sign-in screen, so the
 * signed-out shape is read off `/api/invite/pending` instead — the one route
 * under `/api` that answers without a person, because the sign-in screen has
 * to be able to name the inviter.
 */
async function session(who: ReturnType<typeof browser>): Promise<Session> {
  const response = await who.get("/api/trips");
  if (response.status === 401) {
    const { invite } = (await (await who.get("/api/invite/pending")).json()) as Pick<
      Session,
      "invite"
    >;
    return { me: null, invite, trips: [] };
  }
  return (await response.json()) as Session;
}

const MIKA: GoogleUser = { sub: "g-mika", name: "Mika Tanaka", email: "mika@example.com" };
const JORDAN: GoogleUser = { sub: "g-jordan", name: "Jordan Lee", email: "jordan@example.com" };

/** Mika, signed in, with a trip to Korea in March. */
async function mikaWithATrip() {
  const mika = browser(env);
  await signIn(mika, MIKA);
  const made = (await (await mika.post("/api/trips", {
    name: "Korea",
    startDate: "2026-03-04",
    endDate: "2026-03-14",
  })).json()) as { trip: { id: string } };
  return { mika, tripId: made.trip.id };
}

async function inviteLink(who: ReturnType<typeof browser>, tripId: string) {
  const made = (await (await who.post(`/api/trips/${tripId}/invite`)).json()) as {
    invite: { url: string };
  };
  return made.invite.url.slice(ORIGIN.length);
}

describe("signing in", () => {
  it("reports the deployed commit without requiring a session", async () => {
    const who = browser(env);
    const version = await who.get("/version");
    expect(version.status).toBe(200);
    expect(await version.json()).toEqual({ commit: env.DEPLOY_COMMIT });
    expect((await who.get("/")).headers.get("x-deploy-commit")).toBe(env.DEPLOY_COMMIT);
  });
  it("starts signed out, with no trips and nothing waiting", async () => {
    const who = browser(env);
    expect((await who.get("/api/trips")).status).toBe(401);

    const state = await session(who);
    expect(state.me).toBeNull();
    expect(state.invite).toBeNull();
    expect(state.trips).toEqual([]);
  });

  it("sends the button to Google, asking for a name and an email and no more", async () => {
    const started = await browser(env).post("/api/auth/sign-in/social", {
      provider: "google",
      callbackURL: "/",
    });
    const { url } = (await started.json()) as { url: string };

    const sent = new URL(url);
    expect(sent.origin + sent.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    // design/SignIn.dc.html promises a name and an email and nothing else, and
    // this is the assertion that keeps the promise from drifting.
    expect(sent.searchParams.get("scope")?.split(/[+ ]/).sort()).toEqual([
      "email",
      "openid",
      "profile",
    ]);
    expect(sent.searchParams.get("code_challenge_method")).toBe("S256");
    // The one path registered with Google (INFRA.md item 4). Changing it here
    // without changing it there is a redirect_uri_mismatch in production.
    expect(sent.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`);
  });

  it("comes back from Google as the person the id token names", async () => {
    const me = browser(env);
    await signIn(me, MIKA);

    const state = await session(me);
    expect(state.me?.name).toBe("Mika Tanaka");
    expect(state.me?.initials).toBe("MT");
  });

  it("hands back a session token, never the user's own id", async () => {
    const me = browser(env);
    await signIn(me, MIKA);

    const cookie = me.jar.get(SESSION_COOKIE) ?? "";
    expect(cookie.length).toBeGreaterThan(20);
    // The payload of /api/trips carries initials and a colour, and no id at
    // all — so there is nothing in it to match the cookie against.
    expect(JSON.stringify(await session(me))).not.toContain(cookie);
  });

  it("is the same person on the second sign-in, not a second one", async () => {
    const first = browser(env);
    await signIn(first, MIKA);
    await first.post("/api/trips", { name: "Korea", startDate: "2026-03-04", endDate: "2026-03-14" });

    // A second browser, the same Google account: the trips come with it, which
    // is the only way from out here to see that it is one person and not two.
    const later = browser(env);
    await signIn(later, MIKA);
    expect((await session(later)).trips.map((t) => t.name)).toEqual(["Korea"]);
  });

  it("refuses a callback whose state is not the one this browser was given", async () => {
    const me = browser(env);
    await me.post("/api/auth/sign-in/social", { provider: "google", callbackURL: "/" });
    await me.get(`/api/auth/callback/google?code=${codeFor(MIKA)}&state=not-the-state`);

    expect((await session(me)).me).toBeNull();
  });

  it("signs out by dropping the session, not by trusting the browser to forget", async () => {
    const me = browser(env);
    await signIn(me, MIKA);
    const token = me.jar.get(SESSION_COOKIE) as string;

    await me.post("/api/auth/sign-out");
    expect((await session(me)).me).toBeNull();

    // The cookie is gone from this browser; the session is gone from the store
    // too, so a copy of it taken beforehand is worth nothing either.
    const copied = browser(env);
    copied.jar.set(SESSION_COOKIE, token);
    expect((await session(copied)).me).toBeNull();
  });

  it("keeps the trips a browser made before there was a door", async () => {
    // A trip from before sign-in existed, owned by the id that cookie minted.
    await createTrip(env.DB as never, {
      name: "Taipei",
      startDate: "2025-05-03",
      endDate: "2025-05-09",
      ownerId: "dev_old",
    });

    const old = browser(env);
    old.jar.set("yvr_dev_uid", "dev_old");
    await signIn(old, { sub: "g-kevin", name: "Kevin Qiu", email: "kevin@example.com" });

    const state = await session(old);
    expect(state.trips.map((t) => t.name)).toEqual(["Taipei"]);
  });

  it("does not let that old cookie sign anybody in on its own", async () => {
    await createTrip(env.DB as never, {
      name: "Taipei",
      startDate: "2025-05-03",
      endDate: "2025-05-09",
      ownerId: "dev_old",
    });

    const forged = browser(env);
    forged.jar.set("yvr_dev_uid", "dev_old");
    expect((await session(forged)).me).toBeNull();
    expect((await forged.get("/api/trips")).status).toBe(401);
  });

  it("will not hand somebody else's trips to a second Google account", async () => {
    // Adoption is for an id nobody has ever signed in as. Once Kevin owns it,
    // a browser waving the same old cookie gets nothing.
    await createTrip(env.DB as never, {
      name: "Taipei",
      startDate: "2025-05-03",
      endDate: "2025-05-09",
      ownerId: "dev_old",
    });

    const kevin = browser(env);
    kevin.jar.set("yvr_dev_uid", "dev_old");
    await signIn(kevin, { sub: "g-kevin", name: "Kevin Qiu", email: "kevin@example.com" });

    const thief = browser(env);
    thief.jar.set("yvr_dev_uid", "dev_old");
    await signIn(thief, JORDAN);
    expect((await session(thief)).trips).toEqual([]);
  });
});

describe("the invite link", () => {
  it("is off until someone turns it on", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const people = (await mika.json(`/api/trips/${tripId}/people`)) as { invite: unknown };
    expect(people.invite).toBeNull();
  });

  it("is one link, handed back again rather than minted twice", async () => {
    const { mika, tripId } = await mikaWithATrip();
    expect(await inviteLink(mika, tripId)).toBe(await inviteLink(mika, tripId));
  });

  it("is built on the host that served the request", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const made = (await (await mika.post(`/api/trips/${tripId}/invite`)).json()) as {
      invite: { url: string };
    };
    expect(made.invite.url).toMatch(new RegExp(`^${ORIGIN}/i/[0-9a-f]{32}$`));
  });

  it("cannot be made by someone who is not on the trip", async () => {
    const { mika, tripId } = await mikaWithATrip();
    void mika;
    const stranger = browser(env);
    await signIn(stranger, { sub: "g-sam", name: "Sam Reyes", email: "sam@example.com" });
    // 404, not 403: a trip you are not on answers exactly as a trip that does
    // not exist does, because a 403 would confirm that the id names a real one.
    expect((await stranger.post(`/api/trips/${tripId}/invite`)).status).toBe(404);
  });
});

describe("following a link", () => {
  it("does not join anybody — it holds the invite and hands over the app", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const link = await inviteLink(mika, tripId);

    const jordan = browser(env);
    const followed = await jordan.get(link);
    expect(followed.status).toBe(302);
    expect(followed.headers.get("location")).toBe("/");
    expect(jordan.jar.has("yvr_invite")).toBe(true);

    // Holding an invitation is not being on the trip, and Jordan has not even
    // signed in yet — so this is the guard answering, not the membership check.
    expect((await jordan.get(`/api/trips/${tripId}`)).status).toBe(401);
  });

  it("says who invited you, to what, and roughly when — while signed out", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const jordan = browser(env);
    await jordan.get(await inviteLink(mika, tripId));

    const state = await session(jordan);
    expect(state.me).toBeNull();
    expect(state.invite?.sentence).toBe("Mika invited you to Korea");
    expect(state.invite?.when).toBe("Mar 2026");
    expect(state.invite?.from.initials).toBe("MT");
    // design/Trips.dc.html draws this circle #6E8CA8, not the terracotta Mika
    // wears on her own trip: terracotta is the account avatar in the bar above,
    // and two people in one colour on one screen is the thing to avoid.
    expect(state.invite?.from.color).toBe("#6E8CA8");
    expect(state.invite?.tripId).toBe(tripId);
  });

  it("keeps the invite across signing in, and only then offers to join", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const jordan = browser(env);
    await jordan.get(await inviteLink(mika, tripId));

    await signIn(jordan, JORDAN);
    const after = await session(jordan);
    expect(after.me?.name).toBe("Jordan Lee");
    // Still pending: signing in accepts nothing on its own.
    expect(after.invite?.sentence).toBe("Mika invited you to Korea");
    expect(after.trips).toEqual([]);

    const joined = (await (await jordan.post("/api/invite/accept")).json()) as { tripId: string };
    expect(joined.tripId).toBe(tripId);

    const now = await session(jordan);
    expect(now.invite).toBeNull();
    expect(now.trips.map((t) => t.name)).toEqual(["Korea"]);
    expect((await jordan.get(`/api/trips/${tripId}`)).status).toBe(200);
  });

  it("will not join somebody who has not signed in", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const jordan = browser(env);
    await jordan.get(await inviteLink(mika, tripId));
    expect((await jordan.post("/api/invite/accept")).status).toBe(401);
  });

  it("joins once, however many times the link is followed", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const link = await inviteLink(mika, tripId);

    const jordan = browser(env);
    await jordan.get(link);
    await signIn(jordan, JORDAN);
    await jordan.post("/api/invite/accept");
    await jordan.get(link);
    await jordan.post("/api/invite/accept");

    const people = (await mika.json(`/api/trips/${tripId}/people`)) as { people: unknown[] };
    expect(people.people).toHaveLength(2);
  });

  it("stops working once it is turned off, and says so", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const link = await inviteLink(mika, tripId);
    await mika.post(`/api/trips/${tripId}/invite/revoke`);

    const jordan = browser(env);
    const followed = await jordan.get(link);
    expect(followed.headers.get("location")).toBe("/?invite=gone");
    expect(jordan.jar.has("yvr_invite")).toBe(false);
  });

  it("cannot be spent after it is turned off, even by someone already holding it", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const jordan = browser(env);
    await jordan.get(await inviteLink(mika, tripId));
    await signIn(jordan, JORDAN);
    await mika.post(`/api/trips/${tripId}/invite/revoke`);

    expect((await jordan.post("/api/invite/accept")).status).toBe(404);
    expect((await session(jordan)).invite).toBeNull();
  });

  it("is nothing to show to someone already on the trip", async () => {
    const { mika, tripId } = await mikaWithATrip();
    await mika.get(await inviteLink(mika, tripId));
    expect((await session(mika)).invite).toBeNull();
  });
});

describe("who is on this trip", () => {
  it("names everyone, marks you, and says who started it", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const jordan = browser(env);
    await jordan.get(await inviteLink(mika, tripId));
    await signIn(jordan, JORDAN);
    await jordan.post("/api/invite/accept");

    const screen = (await mika.json(`/api/trips/${tripId}/people`)) as {
      subtitle: string;
      people: { name: string; initials: string; tag: string; line: string; color: string }[];
    };

    expect(screen.subtitle).toBe("Korea · 2 people");
    // design/Members.dc.html: your own row says which account you are signed in
    // as, and everybody else's counts what they have added.
    expect(screen.people[0]).toMatchObject({
      name: "Mika Tanaka",
      initials: "MT",
      tag: "you, started this trip",
      line: "mika@example.com",
    });
    expect(screen.people[1]).toMatchObject({
      name: "Jordan Lee",
      initials: "JL",
      tag: "",
      line: "nothing added yet",
    });

    // Two people, two circles, and never the same one: the trip deals them in
    // the order they joined rather than hashing an id (see peopleOfTrip).
    const colours = (screen.people as { color: string }[]).map((p) => p.color);
    expect(new Set(colours).size).toBe(2);
  });

  it("is not readable by someone who was never invited", async () => {
    const { tripId } = await mikaWithATrip();
    const stranger = browser(env);
    await signIn(stranger, { sub: "g-sam", name: "Sam Reyes", email: "sam@example.com" });
    expect((await stranger.get(`/api/trips/${tripId}/people`)).status).toBe(404);
  });
});

describe("membership is the permission", () => {
  it("serves trip routes as the app shell while keeping trip data authenticated", async () => {
    const signedOut = browser(env);
    for (const path of ["/trips/private-trip", "/trips/private-trip/plan"]) {
      const response = await signedOut.get(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('id="frame"');
    }
    expect((await signedOut.get("/api/trips/private-trip")).status).toBe(401);
  });

  async function plannerFixture() {
    const { mika, tripId } = await mikaWithATrip();
    const trip = await (await mika.get(`/api/trips/${tripId}`)).json() as {
      days: { id: string; date: string }[];
    };
    const response = await mika.post(`/api/trips/${tripId}/lodging`, {
      name: "Seoul stay", checkIn: "2026-03-04", checkOut: "2026-03-08", note: "Keep this note",
    });
    expect(response.status).toBe(201);
    const { lodging } = await response.json() as { lodging: { id: string } };
    return { mika, tripId, dayId: trip.days[0]!.id, stayId: lodging.id };
  }

  it.each(["stranger", "signed out"])("blocks every planner write from a %s without changing data", async (identity) => {
    const { mika, tripId, dayId, stayId } = await plannerFixture();
    const outsider = browser(env);
    if (identity === "stranger") await signIn(outsider, JORDAN);
    const before = await (await mika.get(`/api/trips/${tripId}`)).json();
    const writes: [string, object][] = [
      [`/api/trips/${tripId}`, { name: "Changed", startDate: "2026-03-06" }],
      [`/api/days/${dayId}`, { name: "Changed", hue: "#FFFFFF" }],
      [`/api/trips/${tripId}/lodging`, { name: "Another", checkIn: "2026-03-06" }],
      [`/api/lodging/${stayId}`, { name: "Changed" }],
      [`/api/lodging/${stayId}/delete`, {}],
    ];
    for (const [path, body] of writes) {
      expect((await outsider.post(path, body)).status).toBe(identity === "stranger" ? 404 : 401);
    }
    expect(await (await mika.get(`/api/trips/${tripId}`)).json()).toEqual(before);
  });

  it.each(["owner", "member"])("allows an invited %s to edit trips, days and stays", async (role) => {
    const { mika, tripId, dayId, stayId } = await plannerFixture();
    const editor = role === "owner" ? mika : browser(env);
    if (role === "member") {
      await editor.get(await inviteLink(mika, tripId));
      await signIn(editor, JORDAN);
      expect((await editor.post("/api/invite/accept")).status).toBe(200);
    }
    expect((await editor.post(`/api/trips/${tripId}`, { name: "Japan" })).status).toBe(200);
    expect((await editor.post(`/api/days/${dayId}`, { name: "Arrival", hue: "#FFFFFF" })).status).toBe(200);
    expect((await editor.post(`/api/lodging/${stayId}`, { name: "New name", checkOut: "2026-03-09" })).status).toBe(200);
    const trip = await (await editor.get(`/api/trips/${tripId}`)).json() as {
      trip: { name: string }; days: { id: string; name: string; hue: string }[];
      lodging: { name: string; check_out: string }[];
    };
    expect(trip.trip.name).toBe("Japan");
    expect(trip.days.find((day) => day.id === dayId)).toMatchObject({ name: "Arrival", hue: "#FFFFFF" });
    expect(trip.lodging[0]).toMatchObject({ name: "New name", check_out: "2026-03-09" });
    expect((await editor.post(`/api/trips/${tripId}/lodging`, { name: "Another", checkIn: "2026-03-10" })).status).toBe(201);
    expect((await editor.post(`/api/lodging/${stayId}/delete`)).status).toBe(200);
  });

  it("validates partial lodging date edits against the stored range", async () => {
    const { mika, stayId, tripId } = await plannerFixture();
    for (const body of [{ checkIn: "2026-03-09" }, { checkOut: "2026-03-03" }, { name: " " }, { checkIn: "2026-02-30" }]) {
      expect((await mika.post(`/api/lodging/${stayId}`, body)).status).toBe(400);
    }
    const trip = await (await mika.get(`/api/trips/${tripId}`)).json() as { lodging: object[] };
    expect(trip.lodging[0]).toMatchObject({ name: "Seoul stay", check_in: "2026-03-04", check_out: "2026-03-08" });
  });

  it("preserves retained days and unplans removed-day stops when trip dates change", async () => {
    const { mika, tripId, dayId } = await plannerFixture();
    const before = await (await mika.get(`/api/trips/${tripId}`)).json() as { days: { id: string; date: string }[] };
    const retained = before.days[1]!;
    expect((await mika.post(`/api/days/${retained.id}`, { name: "Keep me", hue: "#123456" })).status).toBe(200);
    await (env.DB as D1Database).prepare(`INSERT INTO stops (id, trip_id, day_id, title, note, order_key, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind("removed-day-note", tripId, dayId, "Keep this stop", "Keep its note", "a0", "test-user", 1, 1).run();
    expect((await mika.post(`/api/trips/${tripId}`, { startDate: retained.date, endDate: "2026-03-15" })).status).toBe(200);
    const after = await (await mika.get(`/api/trips/${tripId}`)).json() as {
      days: { id: string; date: string; name: string; hue: string }[]; unplanned: { id: string; note: string }[];
    };
    expect(after.days.find((day) => day.id === retained.id)).toMatchObject({ name: "Keep me", hue: "#123456" });
    expect(after.days.some((day) => day.id === dayId)).toBe(false);
    expect(after.days.at(-1)?.date).toBe("2026-03-15");
    expect(after.unplanned.find((stop) => stop.id === "removed-day-note")).toMatchObject({ note: "Keep its note" });
  });

  it("keeps a stranger out of the trip, its search and its stops", async () => {
    const { tripId } = await mikaWithATrip();
    const stranger = browser(env);
    await signIn(stranger, { sub: "g-sam", name: "Sam Reyes", email: "sam@example.com" });

    // All 404 rather than 403: membership is the whole of the permission, so
    // there is no "you may not" to report, and a 403 would tell a stranger
    // holding a trip id that it names a real trip.
    expect((await stranger.get(`/api/trips/${tripId}`)).status).toBe(404);
    expect((await stranger.get(`/api/trips/${tripId}/place-search?q=ramen`)).status).toBe(404);
    expect((await stranger.post(`/api/trips/${tripId}/stops`, { placeId: "x" })).status).toBe(404);
  });

  it("keeps a signed-out browser out of everything that writes", async () => {
    const nobody = browser(env);
    expect(
      (await nobody.post("/api/trips", { name: "x", startDate: "2026-03-04", endDate: "2026-03-05" }))
        .status,
    ).toBe(401);
    expect((await nobody.get("/api/trips")).status).toBe(401);
  });
});
