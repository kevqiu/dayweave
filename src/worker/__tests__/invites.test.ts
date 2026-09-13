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
import { TOKEN_ENDPOINT } from "../../lib/oauth.ts";

// --- the D1 binding, over SQLite --------------------------------------------

type Row = Record<string, unknown>;

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

  async all<T>(): Promise<{ results: T[] }> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[])) as Row[];
    return { results: rows.map((r) => ({ ...r })) as T[] };
  }

  async run() {
    this.db.prepare(this.sql).run(...(this.params as never[]));
    return { success: true };
  }
}

function testDatabase() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../../db/migrations/", import.meta.url);
  for (const file of readdirSync(dir).sort()) {
    db.exec(readFileSync(new URL(file, dir), "utf8"));
  }

  return {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (statements: { run: () => Promise<unknown> }[]) => {
      for (const statement of statements) await statement.run();
      return [];
    },
  };
}

/** KV, for sessions and for the ten minutes a sign-in is in flight. */
function testKv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
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
      scope: "openid email profile",
      id_token: `${encode({ alg: "RS256" })}.${encode(who)}.signature`,
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
  invite: { tripId: string; sentence: string; when: string; from: { initials: string } } | null;
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
  };
});

/**
 * Signing in, the whole way round: the button, Google, and the callback.
 *
 * Walking it rather than shortcutting to the callback is the point — the state
 * cookie and the KV entry holding the verifier are the two halves of the CSRF
 * check, and only the round trip exercises both.
 */
async function signIn(who: ReturnType<typeof browser>, person: GoogleUser) {
  const started = await who.get("/auth/google");
  const state = new URL(started.headers.get("location") ?? "").searchParams.get("state");
  return await who.get(`/auth/google/callback?code=${codeFor(person)}&state=${state}`);
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
  it("starts signed out, with no trips and nothing waiting", async () => {
    const session = await browser(env).json<Session>("/api/session");
    expect(session.me).toBeNull();
    expect(session.invite).toBeNull();
    expect(session.trips).toEqual([]);
  });

  it("sends the button to Google, asking for a name and an email and no more", async () => {
    const started = await browser(env).get("/auth/google");
    expect(started.status).toBe(302);

    const sent = new URL(started.headers.get("location") ?? "");
    expect(sent.origin + sent.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(sent.searchParams.get("scope")).toBe("openid email profile");
    expect(sent.searchParams.get("code_challenge_method")).toBe("S256");
    expect(sent.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/auth/google/callback`);
  });

  it("comes back from Google as the person the id token names", async () => {
    const me = browser(env);
    await signIn(me, MIKA);

    const session = await me.json<Session>("/api/session");
    expect(session.me?.name).toBe("Mika Tanaka");
    expect(session.me?.initials).toBe("MT");
  });

  it("hands back a session token, never the user's own id", async () => {
    const me = browser(env);
    await signIn(me, MIKA);

    const session = await me.json<Session>("/api/session");
    const cookie = me.jar.get("yvr_sid") ?? "";
    expect(cookie).not.toBe(session.me?.id);
    expect(cookie.length).toBeGreaterThan(20);
  });

  it("is the same person on the second sign-in, not a second one", async () => {
    const first = browser(env);
    await signIn(first, MIKA);
    const before = await first.json<Session>("/api/session");

    const later = browser(env);
    await signIn(later, MIKA);
    expect((await later.json<Session>("/api/session")).me?.id).toBe(before.me?.id);
  });

  it("refuses a callback whose state is not the one this browser was given", async () => {
    const me = browser(env);
    await me.get("/auth/google");
    const forged = await me.get(`/auth/google/callback?code=${codeFor(MIKA)}&state=not-the-state`);

    expect(forged.headers.get("location")).toBe("/?auth=failed");
    expect((await me.json<Session>("/api/session")).me).toBeNull();
  });

  it("refuses a state that has already been spent", async () => {
    const me = browser(env);
    const started = await me.get("/auth/google");
    const state = new URL(started.headers.get("location") ?? "").searchParams.get("state");
    const callback = `/auth/google/callback?code=${codeFor(MIKA)}&state=${state}`;
    await me.get(callback);

    // Replayed by a browser carrying the same state cookie, so it is the KV
    // entry being spent rather than the cookie check that has to refuse this.
    const replay = browser(env);
    replay.jar.set("yvr_oauth", state as string);
    expect((await replay.get(callback)).headers.get("location")).toBe("/?auth=expired");
    expect((await replay.json<Session>("/api/session")).me).toBeNull();
  });

  it("says so rather than pretending when somebody declines on Google's screen", async () => {
    const me = browser(env);
    await me.get("/auth/google");
    const declined = await me.get("/auth/google/callback?error=access_denied&state=x");
    expect(declined.headers.get("location")).toBe("/?auth=cancelled");
  });

  it("has no button to offer when no OAuth client is configured", async () => {
    const unset = { ...env, GOOGLE_CLIENT_ID: "" };
    const me = browser(unset);
    expect((await me.get("/auth/google")).headers.get("location")).toBe("/?auth=unconfigured");
    expect((await me.json<{ google: boolean }>("/api/session")).google).toBe(false);
  });

  it("signs out by dropping the session, not by trusting the browser to forget", async () => {
    const me = browser(env);
    await signIn(me, MIKA);
    const token = me.jar.get("yvr_sid") as string;

    await me.post("/api/session/out");
    expect((await me.json<Session>("/api/session")).me).toBeNull();

    // The cookie is gone from this browser; the session is gone from KV too,
    // so a copy of it taken beforehand is worth nothing either.
    const copied = browser(env);
    copied.jar.set("yvr_sid", token);
    expect((await copied.json<Session>("/api/session")).me).toBeNull();
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

    const session = await old.json<Session>("/api/session");
    expect(session.me?.id).toBe("dev_old");
    expect(session.trips.map((t) => t.name)).toEqual(["Taipei"]);
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
    expect((await forged.json<Session>("/api/session")).me).toBeNull();
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
    expect((await thief.json<Session>("/api/session")).trips).toEqual([]);
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
    expect((await stranger.post(`/api/trips/${tripId}/invite`)).status).toBe(403);
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

    // Holding an invitation is not being on the trip.
    expect((await jordan.get(`/api/trips/${tripId}`)).status).toBe(403);
  });

  it("says who invited you, to what, and roughly when — while signed out", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const jordan = browser(env);
    await jordan.get(await inviteLink(mika, tripId));

    const session = await jordan.json<Session>("/api/session");
    expect(session.me).toBeNull();
    expect(session.invite?.sentence).toBe("Mika invited you to Korea");
    expect(session.invite?.when).toBe("Mar 2026");
    expect(session.invite?.from.initials).toBe("MT");
    expect(session.invite?.tripId).toBe(tripId);
  });

  it("keeps the invite across signing in, and only then offers to join", async () => {
    const { mika, tripId } = await mikaWithATrip();
    const jordan = browser(env);
    await jordan.get(await inviteLink(mika, tripId));

    await signIn(jordan, JORDAN);
    const after = await jordan.json<Session>("/api/session");
    expect(after.me?.name).toBe("Jordan Lee");
    // Still pending: signing in accepts nothing on its own.
    expect(after.invite?.sentence).toBe("Mika invited you to Korea");
    expect(after.trips).toEqual([]);

    const joined = (await (await jordan.post("/api/invite/accept")).json()) as { tripId: string };
    expect(joined.tripId).toBe(tripId);

    const now = await jordan.json<Session>("/api/session");
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
    expect((await jordan.json<Session>("/api/session")).invite).toBeNull();
  });

  it("is nothing to show to someone already on the trip", async () => {
    const { mika, tripId } = await mikaWithATrip();
    await mika.get(await inviteLink(mika, tripId));
    expect((await mika.json<Session>("/api/session")).invite).toBeNull();
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
      people: { name: string; initials: string; tag: string; line: string }[];
    };

    expect(screen.subtitle).toBe("Korea · 2 people");
    expect(screen.people[0]).toMatchObject({
      name: "Mika Tanaka",
      initials: "MT",
      tag: "you, started this trip",
      line: "nothing added yet",
    });
    expect(screen.people[1]).toMatchObject({ name: "Jordan Lee", initials: "JL", tag: "" });
  });

  it("is not readable by someone who was never invited", async () => {
    const { tripId } = await mikaWithATrip();
    const stranger = browser(env);
    await signIn(stranger, { sub: "g-sam", name: "Sam Reyes", email: "sam@example.com" });
    expect((await stranger.get(`/api/trips/${tripId}/people`)).status).toBe(403);
  });
});

describe("membership is the permission", () => {
  it("keeps a stranger out of the trip, its search and its stops", async () => {
    const { tripId } = await mikaWithATrip();
    const stranger = browser(env);
    await signIn(stranger, { sub: "g-sam", name: "Sam Reyes", email: "sam@example.com" });

    expect((await stranger.get(`/api/trips/${tripId}`)).status).toBe(403);
    expect((await stranger.get(`/api/trips/${tripId}/place-search?q=ramen`)).status).toBe(403);
    expect((await stranger.post(`/api/trips/${tripId}/stops`, { placeId: "x" })).status).toBe(403);
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
