import { smartPlan } from "../lib/smart-plan.ts";
import { orderKeyAppend } from "../lib/order.ts";
import { Hono, type Context } from "hono";
import { fetchMyMap } from "../lib/kml.ts";
import {
  autocomplete,
  placeDetails,
  PlacesError,
  textSearch,
  type PlaceDetails,
} from "../lib/places.ts";
import { haversineMetres, resolveBias, roundedCentre, type Bias } from "../lib/geo.ts";
import {
  agoLabel,
  contributionLine,
  inviteSentence,
  inviteUrl,
  monthLabel,
} from "../lib/invite.ts";
import { previewNodes } from "../lib/preview.ts";
import { suggestDays, type CandidateDay } from "../lib/suggest.ts";
import { formatClock, minutesOf } from "../lib/plan.ts";
import {
  addLodging,
  addNoteAsStop,
  addPlaceAsStop,
  adoptDevIdentity,
  citiesForTrip,
  cityOfDay,
  cleanHex,
  createTrip,
  dateRangeLabel,
  dayLabel,
  ensureInvite,
  deleteLodging,
  getTrip,
  getStop,
  initialsFor,
  initialsForName,
  inviteByToken,
  isMember,
  joinTrip,
  listDays,
  listLodging,
  listStops,
  liveInvite,
  moveStopToDay,
  peopleOfTrip,
  personOf,
  placeCounts,
  placesOnTrip,
  revokeInvites,
  stopsForDay,
  toDayGeo,
  usersById,
  updateDay,
  updateLodging,
  updateTrip,
  type DayRow,
  type InviteRow,
  type Person,
  type StopRow,
  type UserRow,
} from "./store.ts";
import { avatarColor, guestAvatarColor } from "./ui/tokens.ts";
import { authFor, localDevEnabled } from "./auth.ts";
import { page } from "./ui/page.ts";
import type { worker } from "../../alchemy.run.ts";

type Env = typeof worker.Env;

/** The signed-in person, resolved once per request by the guard below. */
interface Viewer {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

const app = new Hono<{ Bindings: Env; Variables: { viewer: Viewer } }>();

app.get("/health", (c) => c.json({ ok: true }));

/* -------------------------------------------------------------- sign-in */

/**
 * Better Auth's own routes: sign in, the Google callback, the session, sign
 * out. PLAN.md section 5, and `src/worker/auth.ts` for the configuration.
 *
 * Mounted before the guard below, because a person who cannot sign in yet is
 * exactly who these are for.
 */
app.all("/api/auth/*", async (c) => {
  const auth = authFor(c.env, new URL(c.req.url));
  const response = await auth.handler(c.req.raw);

  const dev = devCookie(c);
  if (!dev) return response;

  /*
   * The adoption happens here, on the way out of the callback, and not on the
   * next `/api` call.
   *
   * The difference is a window. If it waited for the first API request, a
   * browser could sign in, stop, and leave the cookie's trips still owned by
   * `dev_…` — and a second Google account waving the same cookie would take
   * them. Doing it as the session is created closes that: the cookie is spent
   * by the sign-in that proves the browser, and never by a later one.
   *
   * The session Better Auth has just made is in this response's own cookies,
   * so the only way to ask who it belongs to is to hand them back to it.
   */
  const sent = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
  if (!sent?.length) return response;

  const headers = new Headers();
  headers.set("cookie", sent.map((cookie) => cookie.split(";")[0]).join("; "));
  const session = await auth.api.getSession({ headers });
  if (!session) return response;

  await adoptDevIdentity(c.env.DB, dev, session.user.id);

  const out = new Response(response.body, response);
  out.headers.append("set-cookie", CLEAR_DEV_COOKIE);
  return out;
});

/**
 * The last of the per-browser cookie, and where its trips go.
 *
 * Until now a visitor was a `dev_…` id in `yvr_dev_uid`, minted on first sight
 * and owning everything they made. That cookie is not issued any more, but
 * browsers are still carrying one, and the trips it owns are real to whoever
 * made them. So the first request that arrives with both a session and one of
 * these cookies hands the cookie's trips to the account (see
 * `adoptDevIdentity`), and then clears the cookie so it can never do it twice.
 *
 * It is deliberately not a route anyone can call. There is nothing to press,
 * nothing to confirm, and no window in which it can be aimed at somebody
 * else's id: the cookie *is* the proof, and it is spent on use.
 */
const DEV_COOKIE = "yvr_dev_uid";
const CLEAR_DEV_COOKIE = `${DEV_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;

const devCookie = (c: { req: { header: (k: string) => string | undefined } }): string | null =>
  /(?:^|;\s*)yvr_dev_uid=([^;]+)/.exec(c.req.header("cookie") ?? "")?.[1] ?? null;

/**
 * Everything under `/api` needs a person, and this is the only place that
 * decides who they are.
 *
 * There used to be two answers to that question — a stub row in `app_user` and
 * the cookie above — and neither was a sign-in. There is one now, and it comes
 * from the session Better Auth resolves off the request.
 */
app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth/")) return next();
  // The sign-in screen names the inviter and the trip, so the invite it is
  // showing has to be readable before there is anybody to read it for.
  if (c.req.path === "/api/invite/pending") return next();

  const auth = authFor(c.env, new URL(c.req.url));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "sign in first" }, 401);

  const dev = devCookie(c);
  if (dev) {
    await adoptDevIdentity(c.env.DB, dev, session.user.id);
    c.header("set-cookie", CLEAR_DEV_COOKIE);
  }

  c.set("viewer", {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  });
  return next();
});

/**
 * An invite a signed-out visitor is holding, until they are through the door.
 *
 * Following `/i/<token>` does not join anybody (PLAN.md section 5): it puts the
 * token here and hands over the app. A visitor with no account then signs in,
 * comes back through Better Auth's callback, and the invite is still on the
 * browser — which is the whole reason it is a cookie rather than a query
 * string that the OAuth round trip would drop.
 */
const INVITE_COOKIE = "yvr_invite";

type Req = { req: { header: (k: string) => string | undefined } };

function readCookie(c: Req, name: string): string | null {
  const cookies = c.req.header("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const at = part.indexOf("=");
    if (at === -1) continue;
    if (part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return null;
}

/**
 * Cookies are Secure everywhere but localhost, where a browser refuses to keep
 * a Secure cookie sent over http and the whole thing silently fails to work.
 */
const cookieOptions = (c: Ctx, maxAge: number | null) => {
  const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
  const age = maxAge === null ? "" : `; Max-Age=${maxAge}`;
  return `; Path=/${age}; SameSite=Lax; HttpOnly${secure}`;
};

/**
 * The invite rides in a session cookie rather than a row, because a visitor
 * holding one is not yet a person we can write anything against. It lasts as
 * long as the browser is open, which is as long as "I clicked Mika's link and
 * then signed in with Google" takes.
 */
const inviteCookie = (c: Ctx, token: string) =>
  `${INVITE_COOKIE}=${encodeURIComponent(token)}${cookieOptions(c, null)}`;

const clearCookie = (c: Ctx, name: string) => `${name}=${cookieOptions(c, 0)}`;

type Ctx = Context<{ Bindings: Env; Variables: { viewer: Viewer } }>;

const placesConfig = (env: Env) => ({
  apiKey: env.GOOGLE_PLACES_KEY,
});

/**
 * The avatar on a row: two letters and a colour, and no name or email.
 *
 * `design/Trips.dc.html` and `design/Main.dc.html` draw people as initials in
 * a circle and never as a name, so that is all this sends. It also means one
 * member of a trip does not learn another's email address from the payload of
 * a screen that was only ever going to draw two letters.
 */
const person = (user: Pick<UserRow, "id" | "name">) => ({
  initials: user.name ? initialsForName(user.name) : initialsFor(user.id),
  color: avatarColor(user.id),
});

/**
 * You, which is not the same shape as anyone else.
 *
 * `person` withholds the name and the email on purpose. Your own are not a
 * leak to you, and the account menu behind the avatar needs the email to say
 * which account it is about to sign out of.
 */
const me = (viewer: Viewer) => ({ ...person(viewer), name: viewer.name, email: viewer.email });

/** A member whose account is gone, but whose id is still on the trip. */
const strangerPerson = (userId: string) => ({
  initials: initialsFor(userId),
  color: avatarColor(userId),
});

/* --------------------------------------------------------- who may look */

/**
 * Membership is the permission, and this is where it is spent.
 *
 * PLAN.md section 5: there are no roles, because inviting someone to a trip
 * means you want them editing it. So every trip-scoped route reads its trip
 * through one of these two, and a trip you are not in answers exactly as a
 * trip that does not exist does — a 403 would confirm the id.
 *
 * Nothing enforced this before, because there was nobody to enforce it
 * against: the owner of a trip was a cookie, and every request carried a
 * different one. The ids are real now, so the check is worth making.
 */
async function tripForViewer(db: D1Database, tripId: string, userId: string) {
  const trip = await getTrip(db, tripId);
  if (!trip) return null;
  return (await isMember(db, tripId, userId)) ? trip : null;
}

async function stopForViewer(db: D1Database, stopId: string, userId: string) {
  const stop = await getStop(db, stopId);
  if (!stop) return null;
  return (await isMember(db, stop.trip_id, userId)) ? stop : null;
}

/**
 * The same rule as a `WHERE` clause, for the writes that never load the row.
 *
 * Saving a note or a time is one statement against a stop id, and adding a
 * read in front of it to check membership would put a round trip on the path
 * PLAN.md section 2 works hardest to keep short. This says the same thing to
 * the database instead: update the row only if it belongs to a trip the person
 * is on. A write that matches nothing is a stop that is gone or was never
 * theirs, and `meta.changes` tells the two apart from neither.
 */
const ON_A_TRIP_OF_MINE = `trip_id IN (SELECT trip_id FROM trip_members WHERE user_id = ?)`;

/**
 * A trip you are not on answers exactly as a trip that does not exist does.
 *
 * PLAN.md section 5 makes membership the whole of the permission, so there is
 * no "you may not" to report: a 403 would confirm that the id names a real
 * trip, which is the one thing a stranger holding it should not learn.
 */
const NO_SUCH_TRIP = { error: "no such trip" } as const;

const todayIso = () => new Date().toISOString().slice(0, 10);

app.on("GET", ["/", "/settings", "/trips/:tripId", "/trips/:tripId/plan"], (c) => {
  c.header("X-Deploy-Commit", c.env.DEPLOY_COMMIT);
  // The browser key is public by design; the Places key stays server-side.
  return c.html(page(c.env.GOOGLE_MAPS_BROWSER_KEY, localDevEnabled(c.env, new URL(c.req.url))));
});

app.get("/version", (c) => c.json({ commit: c.env.DEPLOY_COMMIT }));

/**
 * A followed invite link.
 *
 * It does not join anybody. All it does is put the invite in the visitor's
 * session and hand them the app, because the person who opens Mika's link may
 * well have no account at all — and being added to a trip by clicking a URL,
 * before you have even seen what it is, is not an invitation, it is an
 * enrolment. Joining is the Join button on the card, which is a person saying
 * yes (`design/Trips.dc.html`).
 *
 * A link that has been revoked says so rather than failing silently.
 */
app.get("/i/:token", async (c) => {
  const invite = await inviteByToken(c.env.DB, c.req.param("token"));
  if (!invite) return c.redirect("/?invite=gone", 302);

  c.header("set-cookie", inviteCookie(c, invite.token), { append: true });
  return c.redirect("/", 302);
});

// --- the invite a signed-out visitor is carrying ---------------------------

/**
 * The pending invite, for a browser that may not have an account yet.
 *
 * This is the one route under `/api` that the guard lets through signed out,
 * and it is why: `design/SignIn.dc.html` is reached by following Mika's link,
 * and a sign-in screen that cannot say who invited you or to what is asking
 * somebody to hand over their Google account on no information at all. It
 * reveals a trip name and an inviter's first name to whoever holds the token,
 * which is exactly what the person who sent the link meant to tell them.
 *
 * Signed in, the same sentence rides along on `/api/trips` instead, so the
 * Trips list draws its card without a second round trip.
 */
app.get("/api/invite/pending", async (c) => {
  const auth = authFor(c.env, new URL(c.req.url));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return c.json({ invite: await pendingInvite(c, session?.user.id ?? null) });
});

/**
 * The card at the top of `design/Trips.dc.html`, or nothing.
 *
 * Every word on it is built here — the sentence, the month, the inviter's
 * initials — so the client renders an invitation rather than composing one.
 * An invite to a trip you are already on is not pending, so it resolves to
 * nothing and the cookie is left to expire with the session.
 */
async function pendingInvite(c: Ctx, userId: string | null) {
  const token = readCookie(c, INVITE_COOKIE);
  if (!token) return null;

  const invite = await inviteByToken(c.env.DB, token);
  if (!invite) return null;

  const trip = await getTrip(c.env.DB, invite.trip_id);
  if (!trip) return null;
  // An invite to a trip you are already on is not pending.
  if (userId && (await isMember(c.env.DB, trip.id, userId))) return null;

  const people = await peopleOfTrip(c.env.DB, trip.id);
  const from = personOf(invite.invited_by, people);
  return {
    tripId: trip.id,
    tripName: trip.name,
    sentence: inviteSentence(from.name, trip.name),
    when: monthLabel(trip.start_date, trip.end_date),
    // Not the colour they wear on their own trip: terracotta is you on this
    // screen, whoever you are. See `guestAvatarColor`.
    from: {
      initials: from.initials,
      color: guestAvatarColor([...people.keys()].indexOf(invite.invited_by)),
    },
  };
}

/** Join, which is a person saying yes to the card. */
app.post("/api/invite/accept", async (c) => {
  const { id: userId } = c.get("viewer");

  const token = readCookie(c, INVITE_COOKIE);
  const invite = token ? await inviteByToken(c.env.DB, token) : null;
  if (!invite) return c.json({ error: "that invite link has been revoked" }, 404);

  await joinTrip(c.env.DB, invite.trip_id, userId);
  c.header("set-cookie", clearCookie(c, INVITE_COOKIE), { append: true });
  return c.json({ tripId: invite.trip_id });
});

// --- trips ------------------------------------------------------------------

app.post("/api/trips", async (c) => {
  const { id: userId } = c.get("viewer");

  const body = await c.req.json<{ name?: string; startDate?: string; endDate?: string }>();
  const name = body.name?.trim();
  // Section 4d: the name is required, and it is the only name the app shows.
  if (!name) return c.json({ error: "a trip needs a name" }, 400);
  if (!body.startDate || !body.endDate) return c.json({ error: "a trip needs dates" }, 400);
  if (!isIsoDate(body.startDate) || !isIsoDate(body.endDate)) return c.json({ error: "those are not dates" }, 400);
  if (body.endDate < body.startDate) return c.json({ error: "the trip ends before it starts" }, 400);
  if (daysBetween(body.startDate, body.endDate) > 365) return c.json({ error: "a trip can span at most 366 days" }, 400);

  const trip = await createTrip(c.env.DB, {
    name,
    startDate: body.startDate,
    endDate: body.endDate,
    ownerId: userId,
  });
  return c.json({ trip, days: await listDays(c.env.DB, trip.id) }, 201);
});

app.get("/api/trips", async (c) => {
  const viewer = c.get("viewer");

  return c.json({
    me: me(viewer),
    trips: await tripsFor(c.env.DB, viewer.id),
    // The card at the top of design/Trips.dc.html rides along rather than
    // costing a second call, because this is the screen every load opens on.
    invite: await pendingInvite(c, viewer.id),
  });
});

app.post("/api/trips/:tripId/delete", async (c) => {
  const trip = await tripForViewer(c.env.DB, c.req.param("tripId"), c.get("viewer").id);
  if (!trip) return c.json(NO_SUCH_TRIP, 404);
  if (trip.owner_id !== c.get("viewer").id) return c.json({ error: "Only the trip owner can delete this trip" }, 403);
  const result = await c.env.DB.prepare(
    `DELETE FROM trips WHERE id = ? AND owner_id = ?`,
  ).bind(c.req.param("tripId"), c.get("viewer").id).run();
  if (!result.meta.changes) return c.json(NO_SUCH_TRIP, 404);
  return c.json({ ok: true });
});

app.post("/api/trips/:tripId/leave", async (c) => {
  const userId = c.get("viewer").id;
  const trip = await tripForViewer(c.env.DB, c.req.param("tripId"), userId);
  if (!trip) return c.json(NO_SUCH_TRIP, 404);
  if (trip.owner_id === userId) return c.json({ error: "The trip owner cannot leave their own trip" }, 403);
  const result = await c.env.DB.prepare(
    `DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?
       AND trip_id IN (SELECT id FROM trips WHERE owner_id != ?)`,
  ).bind(trip.id, userId, userId).run();
  if (!result.meta.changes) return c.json(NO_SUCH_TRIP, 404);
  return c.json({ ok: true });
});

async function tripsFor(db: D1Database, userId: string) {
  const { results } = await db
    .prepare(
      `SELECT t.* FROM trips t
         JOIN trip_members m ON m.trip_id = t.id
        WHERE m.user_id = ?
        ORDER BY t.start_date DESC`,
    )
    .bind(userId)
    .all<{ id: string; name: string; start_date: string; end_date: string; owner_id: string }>();

  const trips = [];
  for (const trip of results ?? []) {
    const [days, stops, people, lodging] = await Promise.all([
      listDays(db, trip.id),
      listStops(db, trip.id),
      peopleOfTrip(db, trip.id),
      listLodging(db, trip.id),
    ]);
    const cities = citiesForTrip(days, stops);
    const range = dateRangeLabel(trip.start_date, trip.end_date);

    trips.push({
      ...trip,
      isOwner: trip.owner_id === userId,
      cities,
      mapPoints: [
        ...stops.filter((stop) => stop.lat !== null && stop.lng !== null).map((stop) => ({ lat: stop.lat, lng: stop.lng, hue: days.find((day) => day.id === stop.day_id)?.hue ?? "#94897A" })),
        ...lodging.filter((stay) => Number.isFinite(stay.lat) && Number.isFinite(stay.lng)).map((stay) => ({ lat: stay.lat, lng: stay.lng, hue: "#3F6B4A" })),
      ],
      // One node a day for the card's map strip, already fitted into it:
      // src/lib/preview.ts does the arithmetic so the browser does none.
      dayNodes: previewNodes(toDayGeo(days, stops).map((day) => ({
        ...day,
        stops: [...day.stops, ...lodging.filter((stay) =>
          stay.lat !== null && stay.lng !== null && Number.isFinite(stay.lat) && Number.isFinite(stay.lng) &&
          stay.check_in <= day.date && stay.check_out >= day.date,
        ).map((stay) => ({ lat: stay.lat!, lng: stay.lng! }))],
      })), todayIso()).map((node) => ({ ...node, hue: days.find((day) => day.date === node.date)?.hue })),
      // Dates, then the cities. With no stops the cities half is absent
      // rather than empty — section 4d is explicit about that.
      subtitle: cities.length ? `${range} · ${cities.join(", ")}` : range,
      stopCount: stops.length,
      visitedCount: stops.filter((s) => s.status === "visited").length,
      members: listMembers(people),
    });
  }

  return trips;
}

app.get("/api/trips/:tripId", async (c) => {
  const viewer = c.get("viewer");

  const tripId = c.req.param("tripId");
  const trip = await tripForViewer(c.env.DB, tripId, viewer.id);
  if (!trip) return c.json({ error: "no such trip" }, 404);

  const [days, stops, people, lodging] = await Promise.all([
    listDays(c.env.DB, tripId),
    listStops(c.env.DB, tripId),
    peopleOfTrip(c.env.DB, tripId),
    listLodging(c.env.DB, tripId),
  ]);

  return c.json({
    trip,
    // Your own circle is the one this trip deals you, not a hash of your id,
    // so it cannot collide with a person you invited (see `peopleOfTrip`). The
    // name and email are yours and are not a leak to you.
    me: { ...personOf(viewer.id, people), name: viewer.name, email: viewer.email },
    members: listMembers(people),
    cities: citiesForTrip(days, stops),
    dateRange: dateRangeLabel(trip.start_date, trip.end_date),
    headerSubtitle: headerSubtitle(trip.start_date, trip.end_date, stops.length),
    days: days.map((day) => ({
      ...day,
      // The date is the day's heading and cannot be wrong, so it keeps the
      // name `label` the whole client already reads. What a person typed on
      // the day rides beside it as `name`, which is `days.label` in the
      // schema — the column the first migration declared and nothing wrote.
      label: dayLabel(day.date),
      name: day.label,
      stops: stopsForDay(stops, day.id, people),
    })),
    lodging,
    unplanned: stopsForDay(stops, null, people),
  });
});

// --- people, and the link that adds one -------------------------------------

/**
 * `design/Members.dc.html`, less its two email halves.
 *
 * Reached from the small person-plus button at the end of the avatar stack,
 * which is where PLAN.md section 4h puts it: that is already where "who is on
 * this trip" is being answered, and it keeps the app to one menu.
 */
app.get("/api/trips/:tripId/people", async (c) => {
  const viewer = c.get("viewer");
  const userId = viewer.id;
  const tripId = c.req.param("tripId");
  const trip = await tripForViewer(c.env.DB, tripId, userId);
  if (!trip) return c.json(NO_SUCH_TRIP, 404);

  const [people, counts, invite] = await Promise.all([
    peopleOfTrip(c.env.DB, tripId),
    placeCounts(c.env.DB, tripId),
    liveInvite(c.env.DB, tripId),
  ]);
  const ids = [...people.keys()];

  return c.json({
    tripId,
    title: "Who is on this trip",
    subtitle: `${trip.name} · ${ids.length} ${ids.length === 1 ? "person" : "people"}`,
    people: ids.map((id) => {
      const p = personOf(id, people);
      const you = id === userId;
      const owner = id === trip.owner_id;
      return {
        // A member from before sign-in existed has no name, and their two
        // derived letters are the only thing we know them by. Printing those
        // is honest; inventing a name for them would not be.
        id,
        canRemove: userId === trip.owner_id && !owner,
        name: p.name || p.initials,
        initials: p.initials,
        color: p.color,
        tag: you ? (owner ? "you, started this trip" : "you") : owner ? "started this trip" : "",
        // design/Members.dc.html writes your own email under your own name and
        // a count under everybody else's. Your address is not a leak to you,
        // and nobody else's is in this payload at all.
        line: you && viewer.email ? viewer.email : contributionLine(counts.get(id) ?? 0),
      };
    }),
    invite: inviteView(c, invite),
  });
});

app.post("/api/trips/:tripId/people/:personId/remove", async (c) => {
  const tripId = c.req.param("tripId");
  const trip = await tripForViewer(c.env.DB, tripId, c.get("viewer").id);
  if (!trip) return c.json(NO_SUCH_TRIP, 404);
  if (trip.owner_id !== c.get("viewer").id) return c.json({ error: "Only the trip organizer can remove people" }, 403);
  if (c.req.param("personId") === trip.owner_id) return c.json({ error: "The organizer cannot be removed" }, 400);
  await c.env.DB.prepare("DELETE FROM trip_members WHERE trip_id = ? AND user_id = ? AND user_id != ?")
    .bind(tripId, c.req.param("personId"), trip.owner_id).run();
  return c.json({ ok: true });
});

app.post("/api/trips/:tripId/smart-plan", async (c) => {
  const tripId = c.req.param("tripId");
  const trip = await tripForViewer(c.env.DB, tripId, c.get("viewer").id);
  if (!trip) return c.json(NO_SUCH_TRIP, 404);
  const body = await c.req.json<{ dayId?: string | null }>();
  const dayId = body.dayId ?? null;
  const [days, stops] = await Promise.all([listDays(c.env.DB, tripId), listStops(c.env.DB, tripId)]);
  if (dayId !== null && !days.some((d) => d.id === dayId)) return c.json({ error: "That day is not on this trip" }, 400);
  const result = smartPlan(days, stops, dayId);
  const statements = [];
  const planned = new Map(result.placements.map((p) => [p.id, p]));
  for (const id of new Set(result.placements.map((p) => p.dayId))) {
    const ordered = stops.filter((s) => (planned.get(s.id)?.dayId ?? s.day_id) === id)
      .sort((a, b) => (planned.get(a.id)?.time ?? a.start_time ?? "99:99").localeCompare(planned.get(b.id)?.time ?? b.start_time ?? "99:99") || a.order_key.localeCompare(b.order_key));
    let key: string | null = null;
    for (const stop of ordered) {
      key = orderKeyAppend(key ? [key] : []);
      const placement = planned.get(stop.id);
      statements.push(c.env.DB.prepare("UPDATE stops SET day_id = ?, start_time = ?, order_key = ?, updated_at = ? WHERE id = ? AND trip_id = ? AND deleted_at IS NULL")
        .bind(id, placement?.time ?? stop.start_time, key, Date.now(), stop.id, tripId));
    }
  }
  if (statements.length) await c.env.DB.batch(statements);
  return c.json(result);
});

app.post("/api/trips/:tripId/invite", async (c) => {
  const { id: userId } = c.get("viewer");
  const tripId = c.req.param("tripId");
  if (!(await isMember(c.env.DB, tripId, userId))) return c.json(NO_SUCH_TRIP, 404);

  const invite = await ensureInvite(c.env.DB, tripId, userId);
  return c.json({ invite: inviteView(c, invite) });
});

app.post("/api/trips/:tripId/invite/revoke", async (c) => {
  const { id: userId } = c.get("viewer");
  const tripId = c.req.param("tripId");
  if (!(await isMember(c.env.DB, tripId, userId))) return c.json(NO_SUCH_TRIP, 404);

  await revokeInvites(c.env.DB, tripId);
  return c.json({ invite: null });
});

/** The link, built against whatever host served the request. */
function inviteView(c: Ctx, invite: InviteRow | null) {
  if (!invite) return null;
  return {
    url: inviteUrl(new URL(c.req.url).origin, invite.token),
    ago: agoLabel(invite.created_at, Date.now()),
  };
}

/**
 * Renaming a trip and moving its dates (PLAN.md section 4d).
 *
 * Days inside both the old range and the new one are left alone, so a change
 * of dates does not repaint or empty the part of the trip that did not move.
 * Anything on a day that falls outside the new range lands in To be planned
 * rather than being deleted with it.
 */
app.post("/api/trips/:tripId", async (c) => {
  const tripId = c.req.param("tripId");
  const trip = await tripForViewer(c.env.DB, tripId, c.get("viewer").id);
  if (!trip) return c.json({ error: "no such trip" }, 404);

  const body = await c.req.json<{ name?: string; startDate?: string; endDate?: string }>();
  const name = (body.name ?? trip.name).trim();
  const startDate = body.startDate ?? trip.start_date;
  const endDate = body.endDate ?? trip.end_date;

  if (!name) return c.json({ error: "a trip needs a name" }, 400);
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return c.json({ error: "those are not dates" }, 400);
  if (endDate < startDate) return c.json({ error: "the trip ends before it starts" }, 400);
  if (daysBetween(startDate, endDate) > 365) return c.json({ error: "a trip can span at most 366 days" }, 400);

  const changed = await updateTrip(c.env.DB, trip, { name, startDate, endDate });
  return c.json({ ok: true, ...changed });
});

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/**
 * A day's name and its colour.
 *
 * PLAN.md section 7 gave every day a hue off one ramp. The ramp is now eight
 * chosen colours and a step past them (`dayColor`), and the day is a thing
 * somebody can name and recolour — so this is where the pencil on a day
 * header writes to.
 */
app.post("/api/days/:dayId", async (c) => {
  const dayId = c.req.param("dayId");
  const day = await c.env.DB.prepare(`SELECT id FROM days WHERE id = ? AND ${ON_A_TRIP_OF_MINE}`)
    .bind(dayId, c.get("viewer").id)
    .first<{ id: string }>();
  if (!day) return c.json({ error: "no such day" }, 404);

  const body = await c.req.json<{ name?: string | null; hue?: string }>();
  const patch: { label?: string | null; hue?: string } = {};

  if (body.name !== undefined) {
    // An empty name is no name, not an empty one: the day goes back to being
    // its date alone (PLAN.md section 11, nothing is a placeholder).
    const name = (body.name ?? "").trim();
    patch.label = name === "" ? null : name.slice(0, 60);
  }
  if (body.hue !== undefined) {
    const hue = cleanHex(body.hue);
    if (!hue) return c.json({ error: "that is not a colour" }, 400);
    patch.hue = hue;
  }

  await updateDay(c.env.DB, dayId, patch);
  return c.json({ ok: true, ...patch });
});

/**
 * The line under the trip name. `Sep 30 – Oct 10 · day 3 of 11` while the trip
 * is running, and `· nothing planned yet` on a trip with no stops, which is
 * how `design/EmptyTrip.dc.html` writes it.
 */
function headerSubtitle(startDate: string, endDate: string, stopCount: number): string {
  const range = dateRangeLabel(startDate, endDate);
  if (stopCount === 0) return `${range} · nothing planned yet`;

  const today = todayIso();
  if (today >= startDate && today <= endDate) {
    const day = 1 + daysBetween(startDate, today);
    const total = 1 + daysBetween(startDate, endDate);
    return `${range} · day ${day} of ${total}`;
  }
  return range;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * The avatars on a trip card, in the order people joined.
 *
 * `peopleOfTrip` has already done the two reads this needs — the ids off
 * `trip_members` in join order, the names out of Better Auth's `user` table in
 * one go — and dealt each person the colour they wear on this trip. A member
 * whose account no longer exists still has a row there, and still gets a
 * circle: `personOf` falls back to two letters derived from the id.
 */
const listMembers = (people: ReadonlyMap<string, Person>) =>
  [...people.values()].map((p) => ({ initials: p.initials, color: p.color, name: p.name }));

// --- place search -----------------------------------------------------------

/**
 * PLAN.md section 4b, drawn by `design/PlaceSearch.dc.html`.
 *
 * The screen is a list of results carrying a category, a rating and a distance,
 * which is Text Search's shape, not Autocomplete's — so Text Search is what
 * runs it. The client debounces and holds the floor at three characters; both
 * are enforced again here, because a cost control that only exists in the
 * browser is not a cost control.
 */
const MIN_QUERY_LENGTH = 3;
const CACHE_TTL_SECONDS = 60 * 60;

app.get("/api/trips/:tripId/place-search", async (c) => {
  const { id: userId } = c.get("viewer");
  const tripId = c.req.param("tripId");
  const query = (c.req.query("q") ?? "").trim();
  if (query.length < MIN_QUERY_LENGTH) {
    return c.json({ results: [], bias: null, reason: "too-short" });
  }

  const trip = await tripForViewer(c.env.DB, tripId, userId);
  // A search is a billed call to Google, so it is behind the membership check
  // as much as any write is — and `tripForViewer` has already spent it.
  if (!trip) return c.json(NO_SUCH_TRIP, 404);

  const [days, stops] = await Promise.all([listDays(c.env.DB, tripId), listStops(c.env.DB, tripId)]);

  /**
   * There is no way to turn the bias off, and that is deliberate.
   *
   * The screen used to carry a "Search anywhere" control that dropped
   * `locationBias`. Measured against the deployed Worker, dropping it does not
   * search anywhere: Google falls back to the *caller's* location, which is
   * whichever Cloudflare edge served the request. Searching "onsen" with it on
   * returned San Francisco, Desert Hot Springs and two places in Oregon.
   *
   * It also bought nothing. A named place is found either way — "hakone
   * teahouse", "nara park" and "tsutaya books daikanyama" returned identical
   * results with and without the bias — because a name is specific enough on
   * its own. The bias only orders generic queries, and ordering those by the
   * day you are planning is the entire point of PLAN.md section 4b.
   */
  const bias = biasFor(c.req.query("dayId") ?? null, days, stops);

  let places: PlaceDetails[];
  try {
    places = await cachedSearch(c.env, query, bias);
  } catch (error) {
    if (error instanceof PlacesError) {
      return c.json({ error: error.message, upstreamStatus: error.status }, 502);
    }
    throw error;
  }

  const onTrip = await placesOnTrip(c.env.DB, tripId);
  const anchor = bias?.anchor ?? null;

  return c.json({
    bias: bias ? { ...bias, label: biasLabel(bias, days, stops) } : null,
    // The stops already on the trip, so the search view can draw them as the
    // green pins the artboard puts behind the circle.
    pins: stops
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((s) => ({ lat: s.lat as number, lng: s.lng as number })),
    results: places.map((place) => {
      const metres = anchor ? haversineMetres(anchor.location, { lat: place.lat, lng: place.lng }) : null;
      return {
        placeId: place.googlePlaceId,
        name: place.name,
        category: place.category,
        rating: place.rating,
        city: place.city,
        address: place.address,
        // The row needs a coordinate to put a pin on the map when it is
        // tapped, and to stand a stop up optimistically when it is added.
        location: { lat: place.lat, lng: place.lng },
        distanceMetres: metres,
        onTrip: onTrip.has(place.googlePlaceId),
        onTripDay: onTrip.get(place.googlePlaceId) ?? null,
        meta: resultMeta(place, metres, anchor?.name ?? null),
      };
    }),
  });
});

function resultMeta(
  place: PlaceDetails,
  metres: number | null,
  anchorName: string | null,
): string {
  const parts: string[] = [];
  if (place.category) parts.push(titleCase(place.category));
  if (place.city) parts.push(place.city);
  if (place.rating !== null) parts.push(`★ ${place.rating.toFixed(1)}`);

  if (metres !== null) parts.push(anchorName ? `${formatDistance(metres)} from ${anchorName}` : `${formatDistance(metres)} away`);
  return parts.join(" · ");
}

const titleCase = (text: string) =>
  text.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  if (metres < 10_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres / 1000)} km`;
}

/** `Near Fri Oct 2, Fukuoka` — the day the circle came from, and its city. */
function biasLabel(bias: Bias, days: readonly DayRow[], stops: readonly StopRow[]): string {
  const day = days.find((d) => d.id === bias.dayId);
  if (!day) return "Near the map";

  const city =
    day.place_label ??
    stops.find((s) => s.day_id === day.id && s.city)?.city ??
    null;

  return city ? `Near ${dayLabel(day.date)}, ${city}` : `Near ${dayLabel(day.date)}`;
}

function biasFor(dayId: string | null, days: readonly DayRow[], stops: readonly StopRow[]) {
  return resolveBias({ dayId, days: toDayGeo(days, stops) });
}

/**
 * Query plus rounded bias centre, cached for an hour (PLAN.md section 4b).
 *
 * The cached payload is the whole place, not just what a row shows, so picking
 * one costs no further call to Google.
 */
async function cachedSearch(env: Env, query: string, bias: Bias | null): Promise<PlaceDetails[]> {
  const key = `ts:v1:${roundedCentre(bias)}:${query.toLowerCase()}`;
  const cached = await env.PLACES_CACHE.get(key, "json");
  if (cached) return cached as PlaceDetails[];

  const places = await textSearch(placesConfig(env), { query, bias });
  await env.PLACES_CACHE.put(key, JSON.stringify(places), { expirationTtl: CACHE_TTL_SECONDS });
  return places;
}

/** The cache, read by place id, so a pick does not pay for a Details call. */
async function placeFromCache(env: Env, placeId: string): Promise<PlaceDetails | null> {
  const listed = await env.PLACES_CACHE.list({ prefix: "ts:v1:" });
  for (const key of listed.keys) {
    const places = (await env.PLACES_CACHE.get(key.name, "json")) as PlaceDetails[] | null;
    const hit = places?.find((p) => p.googlePlaceId === placeId);
    if (hit) return hit;
  }
  return null;
}

// --- stops ------------------------------------------------------------------

app.post("/api/trips/:tripId/stops", async (c) => {
  const { id: userId } = c.get("viewer");
  const tripId = c.req.param("tripId");
  if (!(await isMember(c.env.DB, tripId, userId))) return c.json(NO_SUCH_TRIP, 404);

  const body = await c.req.json<{
    placeId?: string;
    dayId?: string | null;
    sessionToken?: string;
    startTime?: string | null;
  }>();
  if (!body.placeId) return c.json({ error: "which place?" }, 400);
  if (body.dayId != null && !(await dayOnTrip(c.env.DB, body.dayId, tripId))) {
    return c.json({ error: "that day is not on this trip" }, 400);
  }
  const startTime = cleanTime(body.startTime);
  if (startTime === false) return c.json({ error: "that is not a time" }, 400);

  const trip = await tripForViewer(c.env.DB, tripId, userId);
  if (!trip) return c.json({ error: "no such trip" }, 404);

  let details: PlaceDetails | null;
  try {
    details = await placeFromCache(c.env, body.placeId);
    if (!details) {
      // Not in the cache: an old tab, or a completion picked through the
      // Autocomplete path, which pairs with Details on one session token.
      details = await placeDetails(
        placesConfig(c.env),
        body.placeId,
        body.sessionToken ?? crypto.randomUUID(),
      );
    }
  } catch (error) {
    if (error instanceof PlacesError) {
      return c.json({ error: error.message, upstreamStatus: error.status }, 502);
    }
    throw error;
  }

  const result = await addPlaceAsStop(c.env.DB, {
    tripId,
    dayId: body.dayId ?? null,
    details,
    source: "search",
    userId,
    startTime,
  });
  return c.json({ ...result, place: details }, 201);
});

/**
 * A stop that is not a place: "Pick up the rental car", "Get ready".
 *
 * The schema has allowed this since 0001 — `stops.place_id` is nullable and
 * the comment on it reads "NULL = a note, no pin" — and nothing could make
 * one, so a trip could hold only the places Google knows about. Half of what
 * is on a day is not one of those.
 *
 * It costs no Places call, which is why it is its own route rather than a flag
 * on the one above.
 */
app.post("/api/trips/:tripId/stops/note", async (c) => {
  const { id: userId } = c.get("viewer");

  const tripId = c.req.param("tripId");
  const body = await c.req.json<{ title?: string; dayId?: string | null; startTime?: string | null }>();
  const title = body.title?.trim();
  // The title is the whole of it, so there is nothing to fall back on.
  if (!title) return c.json({ error: "give it a name" }, 400);
  const startTime = cleanTime(body.startTime);
  if (startTime === false) return c.json({ error: "that is not a time" }, 400);

  const trip = await tripForViewer(c.env.DB, tripId, userId);
  if (!trip) return c.json({ error: "no such trip" }, 404);
  if (body.dayId != null && !(await dayOnTrip(c.env.DB, body.dayId, tripId))) {
    return c.json({ error: "that day is not on this trip" }, 400);
  }

  const result = await addNoteAsStop(c.env.DB, {
    tripId,
    dayId: body.dayId ?? null,
    title,
    userId,
    startTime,
  });
  return c.json({ ...result, title }, 201);
});

/**
 * "Paste a place link", PLAN.md section 3, and the last row of the search
 * artboard. A Maps URL carries the place's name in its path, so following the
 * link and searching for that name resolves it without a separate API.
 */
app.post("/api/trips/:tripId/stops/link", async (c) => {
  const { id: userId } = c.get("viewer");

  const tripId = c.req.param("tripId");
  const trip = await tripForViewer(c.env.DB, tripId, userId);
  if (!trip) return c.json(NO_SUCH_TRIP, 404);

  const body = await c.req.json<{ url?: string; dayId?: string | null }>();
  if (!body.url) return c.json({ error: "paste a link first" }, 400);

  const name = await placeNameFromUrl(body.url);
  if (!name) return c.json({ error: "that link does not name a place" }, 400);

  try {
    const [found] = await textSearch(placesConfig(c.env), { query: name, maxResults: 1 });
    if (!found) return c.json({ error: `nothing found for "${name}"` }, 404);

    const result = await addPlaceAsStop(c.env.DB, {
      tripId,
      dayId: body.dayId ?? null,
      details: found,
      source: "link",
      userId,
    });
    return c.json({ ...result, place: found }, 201);
  } catch (error) {
    if (error instanceof PlacesError) {
      return c.json({ error: error.message, upstreamStatus: error.status }, 502);
    }
    throw error;
  }
});

async function placeNameFromUrl(raw: string): Promise<string | null> {
  let url = raw.trim();

  // Short links carry nothing useful until they are followed.
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//.test(url)) {
    const response = await fetch(url, { redirect: "follow" });
    url = response.url;
  }

  const inPath = /\/maps\/place\/([^/@?]+)/.exec(url);
  if (inPath?.[1]) return decodeURIComponent(inPath[1].replace(/\+/g, " "));

  try {
    const query = new URL(url).searchParams.get("q");
    if (query) return query;
  } catch {
    // Not a URL at all. Treat whatever was pasted as the name.
    return url || null;
  }
  return null;
}

/**
 * The days a stop could move to, ranked. PLAN.md section 8, drawn by
 * `design/MoveToDay.dc.html`.
 *
 * Everything the sheet shows is computed here, sentences included, so the
 * client never has to reason about distance or re-derive a reason.
 */
app.get("/api/stops/:stopId/move-options", async (c) => {
  const { id: userId } = c.get("viewer");
  const stop = await stopForViewer(c.env.DB, c.req.param("stopId"), userId);
  if (!stop) return c.json({ error: "no such stop" }, 404);

  const [days, stops] = await Promise.all([
    listDays(c.env.DB, stop.trip_id),
    listStops(c.env.DB, stop.trip_id),
  ]);

  const candidates: CandidateDay[] = days.map((day) => ({
    id: day.id,
    date: day.date,
    label: dayLabel(day.date),
    placeLabel: day.place_label,
    hue: day.hue,
    city: day.place_label ?? cityOfDay(day.id, stops),
    stops: stops
      // The stop being moved is not one of its own neighbours.
      .filter((s) => s.day_id === day.id && s.id !== stop.id)
      .map((s) => ({
        id: s.id,
        name: s.place_name ?? s.title,
        location: s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng } : null,
      })),
  }));

  const suggestion = suggestDays(
    {
      id: stop.id,
      name: stop.place_name ?? stop.title,
      location: stop.lat !== null && stop.lng !== null ? { lat: stop.lat, lng: stop.lng } : null,
      city: stop.city,
      currentDayId: stop.day_id,
    },
    candidates,
    todayIso(),
  );

  const current = days.find((d) => d.id === stop.day_id);
  return c.json({
    stop: {
      id: stop.id,
      name: stop.place_name ?? stop.title,
      // "Hikiniku to Come · currently Fri Oct 2", as the artboard writes it.
      currently: current ? dayLabel(current.date) : "To be planned",
    },
    ...suggestion,
  });
});

app.post("/api/stops/:stopId/move", async (c) => {
  const { id: userId } = c.get("viewer");
  const stop = await stopForViewer(c.env.DB, c.req.param("stopId"), userId);
  if (!stop) return c.json({ error: "no such stop" }, 404);

  const body = await c.req.json<{
    dayId?: string | null;
    afterStopId?: string | null;
    startTime?: string | null;
  }>();
  const dayId = body.dayId ?? null;
  // A drop on the Planner's grid is one op: the day, the key between its new
  // neighbours, and the time of the row it landed on (PLAN.md section 4e).
  const startTime = "startTime" in body ? cleanTime(body.startTime) : undefined;
  if (startTime === false) return c.json({ error: "that is not a time" }, 400);

  if (dayId !== null) {
    const day = await c.env.DB.prepare(`SELECT id FROM days WHERE id = ? AND trip_id = ?`)
      .bind(dayId, stop.trip_id)
      .first<{ id: string }>();
    if (!day) return c.json({ error: "that day is not on this trip" }, 400);
  }

  // "afterStopId" absent means the end of the day, which is what the Move to
  // day sheet wants. A drag sends it, including null for "make it first".
  const orderKey = await moveStopToDay(
    c.env.DB,
    stop,
    dayId,
    "afterStopId" in body ? (body.afterStopId ?? null) : undefined,
  );
  if (startTime !== undefined) {
    await c.env.DB.prepare(
      `UPDATE stops SET start_time = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    )
      .bind(startTime, Date.now(), stop.id)
      .run();
  }

  return c.json({ ok: true, dayId, orderKey, startTime: startTime ?? null });
});

app.post("/api/stops/:stopId/visited", async (c) => {
  const { id: userId } = c.get("viewer");
  const body = await c.req.json<{ visited?: boolean }>();
  const visited = body.visited !== false;

  const done = await c.env.DB.prepare(
    `UPDATE stops SET status = ?, visited_at = ?, visited_by = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL AND ${ON_A_TRIP_OF_MINE}`,
  )
    .bind(
      visited ? "visited" : "planned",
      visited ? Date.now() : null,
      visited ? userId : null,
      Date.now(),
      c.req.param("stopId"),
      userId,
    )
    .run();
  if (!done.meta.changes) return c.json({ error: "no such stop" }, 404);

  return c.json({ ok: true, visited });
});

app.post("/api/stops/:stopId/note", async (c) => {
  const { id: userId } = c.get("viewer");
  const body = await c.req.json<{ note?: string }>();
  // Written by a person, never generated. An empty note is a blank card, not
  // a placeholder (PLAN.md section 4c).
  const done = await c.env.DB.prepare(
    `UPDATE stops SET note = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL AND ${ON_A_TRIP_OF_MINE}`,
  )
    .bind((body.note ?? "").trim(), Date.now(), c.req.param("stopId"), userId)
    .run();
  if (!done.meta.changes) return c.json({ error: "no such stop" }, 404);
  return c.json({ ok: true });
});

app.post("/api/stops/:stopId/title", async (c) => {
  const { id: userId } = c.get("viewer");
  const body = await c.req.json<{ title?: string }>();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return c.json({ error: "give it a name" }, 400);
  const done = await c.env.DB.prepare(
    `UPDATE stops SET title = ?, updated_at = ?
      WHERE id = ? AND place_id IS NULL AND deleted_at IS NULL AND ${ON_A_TRIP_OF_MINE}`,
  ).bind(title, Date.now(), c.req.param("stopId"), userId).run();
  if (!done.meta.changes) return c.json({ error: "no such manual note" }, 404);
  return c.json({ ok: true, title });
});

/**
 * The time on a stop.
 *
 * PLAN.md section 4e puts editing a time on the time itself rather than in a
 * menu, so this is what both the phone's time gutter and the Planner's card
 * write to. An empty string clears it, and a stop without one is the normal
 * case (section 11) rather than an error.
 */
app.post("/api/stops/:stopId/time", async (c) => {
  const { id: userId } = c.get("viewer");
  const body = await c.req.json<{ time?: string | null }>();
  const time = cleanTime(body.time);
  if (time === false) return c.json({ error: "that is not a time" }, 400);

  const done = await c.env.DB.prepare(
    `UPDATE stops SET start_time = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL AND ${ON_A_TRIP_OF_MINE}`,
  )
    .bind(time, Date.now(), c.req.param("stopId"), userId)
    .run();
  if (!done.meta.changes) return c.json({ error: "no such stop" }, 404);
  return c.json({ ok: true, time });
});

/** `09:05`, or null for cleared. `false` means it was neither. */
function cleanTime(raw: string | null | undefined): string | null | false {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const at = minutesOf(raw);
  return at === null ? false : formatClock(at);
}

async function dayOnTrip(db: D1Database, dayId: string, tripId: string) {
  return Boolean(await db.prepare("SELECT id FROM days WHERE id = ? AND trip_id = ?").bind(dayId, tripId).first());
}

app.post("/api/stops/:stopId/delete", async (c) => {
  const { id: userId } = c.get("viewer");
  // Soft, so someone else's offline edit stays undoable (PLAN.md section 9).
  const done = await c.env.DB.prepare(
    `UPDATE stops SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${ON_A_TRIP_OF_MINE}`,
  )
    .bind(Date.now(), Date.now(), c.req.param("stopId"), userId)
    .run();
  if (!done.meta.changes) return c.json({ error: "no such stop" }, 404);
  return c.json({ ok: true });
});

// --- lodging ----------------------------------------------------------------

/**
 * Where you are sleeping, over a span of days.
 *
 * `design/Planner.dc.html` rules a lodging strip under the grid and `lodging`
 * has been in the schema since the first migration, but nothing could put
 * anything in it, so the strip was left out as furniture with nothing behind
 * it (PLAN.md section 5b). This is the API that was missing. A stay is added
 * from the Accommodations tab of the sheet, where it is the one thing on the
 * trip that is a range rather than a day.
 */
app.post("/api/trips/:tripId/lodging", async (c) => {
  const tripId = c.req.param("tripId");
  const trip = await tripForViewer(c.env.DB, tripId, c.get("viewer").id);
  if (!trip) return c.json({ error: "no such trip" }, 404);

  const body = await c.req.json<{
    name?: string;
    placeId?: string | null;
    checkIn?: string;
    checkOut?: string;
    note?: string;
  }>();

  const checkIn = body.checkIn ?? "";
  const checkOut = body.checkOut ?? checkIn;
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return c.json({ error: "a stay needs dates" }, 400);
  if (checkOut < checkIn) return c.json({ error: "that stay ends before it starts" }, 400);

  // A stay can be a place Google knows or an address somebody typed. The
  // second is not a lesser case: half the places people sleep are a friend's
  // spare room, and PLAN.md section 11 is against making somebody invent a
  // Google listing for one.
  let details: PlaceDetails | null = null;
  if (body.placeId) {
    try {
      details = await placeFromCache(c.env, body.placeId);
      if (!details) {
        details = await placeDetails(placesConfig(c.env), body.placeId, crypto.randomUUID());
      }
    } catch (error) {
      if (!(error instanceof PlacesError)) throw error;
      details = null;
    }
  }

  const name = (body.name ?? details?.name ?? "").trim();
  if (!name) return c.json({ error: "a stay needs a name" }, 400);

  const stay = await addLodging(c.env.DB, {
    tripId,
    name,
    checkIn,
    checkOut,
    note: body.note,
    details,
  });
  return c.json({ lodging: stay }, 201);
});

app.post("/api/lodging/:id", async (c) => {
  const stay = await c.env.DB.prepare(`SELECT id, trip_id, check_in, check_out, (SELECT google_place_id FROM places WHERE id = lodging.place_id) AS google_place_id FROM lodging WHERE id = ? AND ${ON_A_TRIP_OF_MINE}`)
    .bind(c.req.param("id"), c.get("viewer").id)
    .first<{ id: string; trip_id: string; google_place_id: string | null; check_in: string; check_out: string }>();
  if (!stay) return c.json({ error: "no such stay" }, 404);

  const body = await c.req.json<{
    name?: string;
    placeId?: string | null;
    checkIn?: string;
    checkOut?: string;
    note?: string;
  }>();

  for (const date of [body.checkIn, body.checkOut]) {
    if (date !== undefined && !isIsoDate(date)) return c.json({ error: "that is not a date" }, 400);
  }
  if ((body.checkOut ?? stay.check_out) < (body.checkIn ?? stay.check_in)) {
    return c.json({ error: "that stay ends before it starts" }, 400);
  }

  if (body.name !== undefined && !body.name.trim()) return c.json({ error: "a stay needs a name" }, 400);

  const locationChanged = body.placeId !== undefined && body.placeId !== stay.google_place_id;
  let details: PlaceDetails | null = null;
  if (locationChanged && body.placeId) {
    try {
      details = await placeFromCache(c.env, body.placeId) ?? await placeDetails(placesConfig(c.env), body.placeId, crypto.randomUUID());
    } catch (error) {
      if (!(error instanceof PlacesError)) throw error;
      return c.json({ error: "That location could not be loaded. Try selecting it again." }, 502);
    }
  }

  await updateLodging(c.env.DB, stay.id, {
    name: body.name?.trim(),
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    note: body.note,
    location: !locationChanged ? undefined : { tripId: stay.trip_id, details },
  });
  return c.json({ ok: true });
});

/**
 * Hard, unlike a stop.
 *
 * A stop is soft-deleted so somebody else's offline edit stays undoable
 * (PLAN.md section 9). A stay carries no order key, no note thread and
 * nothing pointing at it, so there is nothing an offline client could be
 * holding a stale reference to; leaving tombstones in a table the Planner
 * reads on every render would cost more than it saves.
 */
app.post("/api/lodging/:id/delete", async (c) => {
  const stay = await c.env.DB.prepare(`SELECT id, check_in, check_out FROM lodging WHERE id = ? AND ${ON_A_TRIP_OF_MINE}`)
    .bind(c.req.param("id"), c.get("viewer").id)
    .first<{ id: string; check_in: string; check_out: string }>();
  if (!stay) return c.json({ error: "no such stay" }, 404);

  await deleteLodging(c.env.DB, c.req.param("id"));
  return c.json({ ok: true });
});

// --- completion path --------------------------------------------------------

/**
 * Autocomplete, kept beside Text Search.
 *
 * This is the cheaper path for a plain completion field: the keystrokes and
 * the Details call that follows share one session token, so Google bills the
 * search once rather than once per keystroke. No artboard draws that field
 * yet, so nothing in the UI calls this — but it is the path PLAN.md section 4b
 * specifies, and it is tested and deployed.
 */
app.get("/api/trips/:tripId/complete", async (c) => {
  const { id: userId } = c.get("viewer");
  const query = (c.req.query("q") ?? "").trim();
  const sessionToken = c.req.query("session") ?? "";
  if (query.length < MIN_QUERY_LENGTH) return c.json({ suggestions: [], reason: "too-short" });
  if (!sessionToken) return c.json({ error: "a search needs a session token" }, 400);

  const tripId = c.req.param("tripId");
  const trip = await tripForViewer(c.env.DB, tripId, userId);
  if (!trip) return c.json({ error: "no such trip" }, 404);

  const [days, stops] = await Promise.all([listDays(c.env.DB, tripId), listStops(c.env.DB, tripId)]);
  const bias = c.req.query("anywhere") === "1" ? null : biasFor(c.req.query("dayId") ?? null, days, stops);

  try {
    const suggestions = await autocomplete(placesConfig(c.env), { query, sessionToken, bias });
    const onTrip = await placesOnTrip(c.env.DB, tripId);
    return c.json({
      bias,
      suggestions: suggestions.map((s) => ({ ...s, onTrip: onTrip.has(s.placeId) })),
    });
  } catch (error) {
    if (error instanceof PlacesError) {
      return c.json({ error: error.message, upstreamStatus: error.status }, 502);
    }
    throw error;
  }
});

/**
 * The My Maps spike, as an endpoint rather than a script. PLAN.md section 3
 * bets the import story on this fetch working from a Worker, which cannot be
 * proven from a dev machine behind a restrictive egress policy. Delete once
 * the real import Workflow exists.
 */
app.get("/api/_spike/my-map/:mid", async (c) => {
  const started = Date.now();
  const result = await fetchMyMap(c.req.param("mid"));
  const ms = Date.now() - started;
  if (!result.ok) return c.json({ ...result, ms }, 502);

  return c.json({
    ok: true,
    ms,
    name: result.map.name,
    counts: {
      places: result.map.places.length,
      skipped: result.map.skipped.length,
      layers: new Set(result.map.places.map((p) => p.layer)).size,
    },
    sample: result.map.places.slice(0, 3),
    skipped: result.map.skipped,
  });
});

export default app;
export { TripRoom } from "./trip-room.ts";
