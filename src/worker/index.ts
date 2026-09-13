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
import { suggestDays, type CandidateDay } from "../lib/suggest.ts";
import { formatClock, minutesOf } from "../lib/plan.ts";
import {
  addPlaceAsStop,
  cityOfDay,
  citiesForTrip,
  createTrip,
  dateRangeLabel,
  dayLabel,
  ensureInvite,
  getTrip,
  getStop,
  getUser,
  inviteByToken,
  isMember,
  joinTrip,
  listDays,
  listStops,
  liveInvite,
  moveStopToDay,
  peopleOfTrip,
  personOf,
  placeCounts,
  placesOnTrip,
  revokeInvites,
  signIn,
  stopsForDay,
  toDayGeo,
  type DayRow,
  type InviteRow,
  type StopRow,
} from "./store.ts";
import { page } from "./ui/page.ts";
import type { worker } from "../../alchemy.run.ts";

type Env = typeof worker.Env;

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true }));

/**
 * Who is asking.
 *
 * PLAN.md section 5 wants Better Auth and Google, and INFRA.md section 4 is
 * the list of things that have to happen at a computer before that can exist.
 * Until then the session is a per-browser id in a cookie with a name attached
 * to it (see `signIn` in store.ts) — which is not authentication and does not
 * pretend to be, but is enough for the one thing invites cannot work without:
 * somebody to invite, and a name to invite them by.
 *
 * Nothing is minted here. A request with no cookie is signed out, and gets the
 * sign-in screen rather than a new stranger's identity.
 */
const SESSION_COOKIE = "yvr_uid";
/** What the cookie was called before it carried a name. Read, never written. */
const LEGACY_COOKIE = "yvr_dev_uid";
/** An invite a signed-out visitor is holding, until they are through the door. */
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

/** The signed-in user, or null. */
const identity = (c: Req): string | null =>
  readCookie(c, SESSION_COOKIE) ?? readCookie(c, LEGACY_COOKIE);

const sessionCookie = (userId: string) =>
  `${SESSION_COOKIE}=${userId}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`;

/**
 * The invite rides in a session cookie rather than a row, because a visitor
 * holding one is not yet a person we can write anything against. It lasts as
 * long as the browser is open, which is as long as "I clicked Mika's link and
 * then signed in" takes.
 */
const inviteCookie = (token: string) =>
  `${INVITE_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; HttpOnly`;

const clearInviteCookie = () =>
  `${INVITE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;

const SIGN_IN_FIRST = { error: "sign in first" } as const;
/** Membership IS the permission (PLAN.md section 5), now that it can be held. */
const NOT_YOURS = { error: "that trip is not yours" } as const;

type Ctx = Context<{ Bindings: Env }>;

const placesConfig = (env: Env) => ({
  apiKey: env.GOOGLE_PLACES_KEY,
  referer: env.PLACES_REFERRER,
});

const todayIso = () => new Date().toISOString().slice(0, 10);

app.get("/", (c) => {
  // The browser key is public by design; the Places key stays server-side.
  return c.html(page(c.env.GOOGLE_MAPS_BROWSER_KEY));
});

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

  c.header("set-cookie", inviteCookie(invite.token), { append: true });
  return c.redirect("/", 302);
});

// --- session ----------------------------------------------------------------

/**
 * Who you are, what is waiting for you, and what you have — in one call,
 * because it is the first thing every load does and PLAN.md section 2 is
 * about the round trip being the slow part.
 *
 * `me` is null for a browser that has never signed in, and also for one
 * carrying an id from before sign-in existed: it has an id but no name, and a
 * name is the thing an invite cannot work without. Signing in keeps that id,
 * so the trips it already made come with it.
 */
app.get("/api/session", async (c) => {
  const userId = identity(c);
  const me = userId ? await getUser(c.env.DB, userId) : null;
  return c.json({
    me,
    invite: await pendingInvite(c),
    trips: me ? await tripsFor(c.env.DB, me.id) : [],
  });
});

const NAME_LIMIT = 40;

app.post("/api/session", async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = (body.name ?? "").trim().replace(/\s+/g, " ").slice(0, NAME_LIMIT);
  if (!name) return c.json({ error: "what should we call you?" }, 400);

  const me = await signIn(c.env.DB, { userId: identity(c), name });
  c.header("set-cookie", sessionCookie(me.id), { append: true });

  return c.json({
    me,
    invite: await pendingInvite(c, me.id),
    trips: await tripsFor(c.env.DB, me.id),
  });
});

/**
 * The card at the top of `design/Trips.dc.html`, or nothing.
 *
 * Every word on it is built here — the sentence, the month, the inviter's
 * initials — so the client renders an invitation rather than composing one.
 * An invite to a trip you are already on is not pending, so it resolves to
 * nothing and the cookie is left to expire with the session.
 */
async function pendingInvite(c: Ctx, userId?: string | null) {
  const token = readCookie(c, INVITE_COOKIE);
  if (!token) return null;

  const invite = await inviteByToken(c.env.DB, token);
  if (!invite) return null;

  const trip = await getTrip(c.env.DB, invite.trip_id);
  if (!trip) return null;
  if (await isMember(c.env.DB, trip.id, userId === undefined ? identity(c) : userId)) return null;

  // The inviter's avatar is the colour they are on that trip, so the circle on
  // the card is the same circle you meet once you are inside it.
  const from = personOf(invite.invited_by, await peopleOfTrip(c.env.DB, trip.id));
  return {
    tripId: trip.id,
    tripName: trip.name,
    sentence: inviteSentence(from.name, trip.name),
    when: monthLabel(trip.start_date, trip.end_date),
    from: { initials: from.initials, color: from.color },
  };
}

/** Join, which is a person saying yes to the card. */
app.post("/api/invite/accept", async (c) => {
  const userId = identity(c);
  const me = userId ? await getUser(c.env.DB, userId) : null;
  if (!me) return c.json(SIGN_IN_FIRST, 401);

  const token = readCookie(c, INVITE_COOKIE);
  const invite = token ? await inviteByToken(c.env.DB, token) : null;
  if (!invite) return c.json({ error: "that invite link has been revoked" }, 404);

  await joinTrip(c.env.DB, invite.trip_id, me.id);
  c.header("set-cookie", clearInviteCookie(), { append: true });
  return c.json({ tripId: invite.trip_id });
});

// --- trips ------------------------------------------------------------------

app.post("/api/trips", async (c) => {
  const userId = identity(c);
  const me = userId ? await getUser(c.env.DB, userId) : null;
  if (!me) return c.json(SIGN_IN_FIRST, 401);

  const body = await c.req.json<{ name?: string; startDate?: string; endDate?: string }>();
  const name = body.name?.trim();
  // Section 4d: the name is required, and it is the only name the app shows.
  if (!name) return c.json({ error: "a trip needs a name" }, 400);
  if (!body.startDate || !body.endDate) return c.json({ error: "a trip needs dates" }, 400);
  if (body.endDate < body.startDate) return c.json({ error: "the trip ends before it starts" }, 400);

  const trip = await createTrip(c.env.DB, {
    name,
    startDate: body.startDate,
    endDate: body.endDate,
    ownerId: me.id,
  });
  return c.json({ trip, days: await listDays(c.env.DB, trip.id) }, 201);
});

app.get("/api/trips", async (c) => {
  const userId = identity(c);
  const me = userId ? await getUser(c.env.DB, userId) : null;
  if (!me) return c.json(SIGN_IN_FIRST, 401);

  return c.json({ me, trips: await tripsFor(c.env.DB, me.id) });
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
    const [days, stops, people] = await Promise.all([
      listDays(db, trip.id),
      listStops(db, trip.id),
      peopleOfTrip(db, trip.id),
    ]);
    const cities = citiesForTrip(days, stops);
    const range = dateRangeLabel(trip.start_date, trip.end_date);

    trips.push({
      ...trip,
      cities,
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
  const userId = identity(c);
  const tripId = c.req.param("tripId");
  const trip = await getTrip(c.env.DB, tripId);
  if (!trip) return c.json({ error: "no such trip" }, 404);
  if (!(await isMember(c.env.DB, tripId, userId))) return c.json(NOT_YOURS, 403);

  const [days, stops, people] = await Promise.all([
    listDays(c.env.DB, tripId),
    listStops(c.env.DB, tripId),
    peopleOfTrip(c.env.DB, tripId),
  ]);

  return c.json({
    trip,
    me: personOf(userId as string, people),
    members: listMembers(people),
    cities: citiesForTrip(days, stops),
    headerSubtitle: headerSubtitle(trip.start_date, trip.end_date, stops.length),
    days: days.map((day) => ({
      ...day,
      label: dayLabel(day.date),
      stops: stopsForDay(stops, day.id, people),
    })),
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
  const userId = identity(c);
  const tripId = c.req.param("tripId");
  const trip = await getTrip(c.env.DB, tripId);
  if (!trip) return c.json({ error: "no such trip" }, 404);
  if (!(await isMember(c.env.DB, tripId, userId))) return c.json(NOT_YOURS, 403);

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
        name: p.name || p.initials,
        initials: p.initials,
        color: p.color,
        tag: you ? (owner ? "you, started this trip" : "you") : owner ? "started this trip" : "",
        line: contributionLine(counts.get(id) ?? 0),
      };
    }),
    invite: inviteView(c, invite),
  });
});

app.post("/api/trips/:tripId/invite", async (c) => {
  const userId = identity(c);
  const tripId = c.req.param("tripId");
  if (!(await isMember(c.env.DB, tripId, userId))) return c.json(NOT_YOURS, 403);

  const invite = await ensureInvite(c.env.DB, tripId, userId as string);
  return c.json({ invite: inviteView(c, invite) });
});

app.post("/api/trips/:tripId/invite/revoke", async (c) => {
  const userId = identity(c);
  const tripId = c.req.param("tripId");
  if (!(await isMember(c.env.DB, tripId, userId))) return c.json(NOT_YOURS, 403);

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

/** The avatar stack: two letters and a colour each, in the order they joined. */
const listMembers = (people: ReadonlyMap<string, { initials: string; color: string; name: string }>) =>
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
  const tripId = c.req.param("tripId");
  const query = (c.req.query("q") ?? "").trim();
  if (query.length < MIN_QUERY_LENGTH) {
    return c.json({ results: [], bias: null, reason: "too-short" });
  }

  const trip = await getTrip(c.env.DB, tripId);
  if (!trip) return c.json({ error: "no such trip" }, 404);
  // A search is a billed call to Google, so it is behind the membership check
  // as much as any write is.
  if (!(await isMember(c.env.DB, tripId, identity(c)))) return c.json(NOT_YOURS, 403);

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

  /**
   * "Outside the day" only means something when the circle came from the day
   * you are planning. When it fell back to a neighbouring day or the viewport
   * (PLAN.md section 4b), the open day has no location of its own yet, so
   * nothing can be outside it and saying so would be a lie.
   *
   * Either way it never gates anything. Bias ranks; it does not restrict.
   */
  const ownDay = bias !== null && (bias.source === "day-stops" || bias.source === "lodging");

  return c.json({
    bias: bias ? { ...bias, label: biasLabel(bias, days, stops) } : null,
    // The stops already on the trip, so the search view can draw them as the
    // green pins the artboard puts behind the circle.
    pins: stops
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((s) => ({ lat: s.lat as number, lng: s.lng as number })),
    results: places.map((place) => {
      const metres = anchor ? haversineMetres(anchor.location, { lat: place.lat, lng: place.lng }) : null;
      const outside = ownDay && metres !== null && metres > (bias as Bias).radius;
      return {
        placeId: place.googlePlaceId,
        name: place.name,
        category: place.category,
        rating: place.rating,
        // The row needs a coordinate to put a pin on the map when it is
        // tapped, and to stand a stop up optimistically when it is added.
        location: { lat: place.lat, lng: place.lng },
        distanceMetres: metres,
        onTrip: onTrip.has(place.googlePlaceId),
        onTripDay: onTrip.get(place.googlePlaceId) ?? null,
        outside,
        meta: resultMeta(place, metres, anchor?.name ?? null, outside),
      };
    }),
  });
});

/**
 * `Ramen · 4.3 · 450 m from Ohori Park`, exactly as the artboard writes it.
 *
 * Each piece is dropped when it is not known, rather than padded out: an
 * unrated place simply has no rating in the line. A result outside the circle
 * says so instead of giving a walking-scale distance that would mislead.
 */
function resultMeta(
  place: PlaceDetails,
  metres: number | null,
  anchorName: string | null,
  outside: boolean,
): string {
  const parts: string[] = [];
  if (place.category) parts.push(titleCase(place.category));
  if (place.rating !== null) parts.push(place.rating.toFixed(1));

  if (metres !== null) {
    if (outside) {
      parts.push(`${formatDistance(metres)} away`, "outside the day");
    } else if (anchorName) {
      parts.push(`${formatDistance(metres)} from ${anchorName}`);
    }
  }
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

/**
 * The stop named in the path, once the caller is shown to be on its trip.
 *
 * Every stop route takes a stop id and nothing else, so the trip it belongs to
 * has to be read before anything can be said about who may touch it. Null
 * covers both a stop that is not there and one that is not yours: which of the
 * two it is, is not a stranger's business.
 */
async function ownStop(c: Ctx) {
  const stop = await getStop(c.env.DB, c.req.param("stopId") ?? "");
  if (!stop) return null;
  return (await isMember(c.env.DB, stop.trip_id, identity(c))) ? stop : null;
}

app.post("/api/trips/:tripId/stops", async (c) => {
  const userId = identity(c);
  const tripId = c.req.param("tripId");
  if (!(await isMember(c.env.DB, tripId, userId))) return c.json(NOT_YOURS, 403);

  const body = await c.req.json<{
    placeId?: string;
    dayId?: string | null;
    sessionToken?: string;
    startTime?: string | null;
  }>();
  if (!body.placeId) return c.json({ error: "which place?" }, 400);
  const startTime = cleanTime(body.startTime);
  if (startTime === false) return c.json({ error: "that is not a time" }, 400);

  const trip = await getTrip(c.env.DB, tripId);
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
    userId: userId as string,
    startTime,
  });
  return c.json({ ...result, place: details }, 201);
});

/**
 * "Paste a place link", PLAN.md section 3, and the last row of the search
 * artboard. A Maps URL carries the place's name in its path, so following the
 * link and searching for that name resolves it without a separate API.
 */
app.post("/api/trips/:tripId/stops/link", async (c) => {
  const userId = identity(c);
  const tripId = c.req.param("tripId");
  if (!(await isMember(c.env.DB, tripId, userId))) return c.json(NOT_YOURS, 403);

  const body = await c.req.json<{ url?: string; dayId?: string | null }>();
  if (!body.url) return c.json({ error: "paste a link first" }, 400);

  const trip = await getTrip(c.env.DB, tripId);
  if (!trip) return c.json({ error: "no such trip" }, 404);

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
      userId: userId as string,
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
  const stop = await ownStop(c);
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
  const stop = await ownStop(c);
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
  const userId = identity(c);
  const stop = await ownStop(c);
  if (!stop) return c.json(NOT_YOURS, 403);

  const body = await c.req.json<{ visited?: boolean }>();
  const visited = body.visited !== false;

  await c.env.DB.prepare(
    `UPDATE stops SET status = ?, visited_at = ?, visited_by = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(
      visited ? "visited" : "planned",
      visited ? Date.now() : null,
      visited ? userId : null,
      Date.now(),
      stop.id,
    )
    .run();

  return c.json({ ok: true, visited });
});

app.post("/api/stops/:stopId/note", async (c) => {
  const stop = await ownStop(c);
  if (!stop) return c.json({ error: "no such stop" }, 404);

  const body = await c.req.json<{ note?: string }>();
  // Written by a person, never generated. An empty note is a blank card, not
  // a placeholder (PLAN.md section 4c).
  await c.env.DB.prepare(`UPDATE stops SET note = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .bind((body.note ?? "").trim(), Date.now(), stop.id)
    .run();
  return c.json({ ok: true });
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
  const stop = await ownStop(c);
  if (!stop) return c.json({ error: "no such stop" }, 404);

  const body = await c.req.json<{ time?: string | null }>();
  const time = cleanTime(body.time);
  if (time === false) return c.json({ error: "that is not a time" }, 400);

  await c.env.DB.prepare(
    `UPDATE stops SET start_time = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(time, Date.now(), stop.id)
    .run();
  return c.json({ ok: true, time });
});

/** `09:05`, or null for cleared. `false` means it was neither. */
function cleanTime(raw: string | null | undefined): string | null | false {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const at = minutesOf(raw);
  return at === null ? false : formatClock(at);
}

app.post("/api/stops/:stopId/delete", async (c) => {
  const stop = await ownStop(c);
  if (!stop) return c.json({ error: "no such stop" }, 404);

  // Soft, so someone else's offline edit stays undoable (PLAN.md section 9).
  await c.env.DB.prepare(`UPDATE stops SET deleted_at = ?, updated_at = ? WHERE id = ?`)
    .bind(Date.now(), Date.now(), stop.id)
    .run();
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
  const query = (c.req.query("q") ?? "").trim();
  const sessionToken = c.req.query("session") ?? "";
  if (query.length < MIN_QUERY_LENGTH) return c.json({ suggestions: [], reason: "too-short" });
  if (!sessionToken) return c.json({ error: "a search needs a session token" }, 400);

  const tripId = c.req.param("tripId");
  const trip = await getTrip(c.env.DB, tripId);
  if (!trip) return c.json({ error: "no such trip" }, 404);
  if (!(await isMember(c.env.DB, tripId, identity(c)))) return c.json(NOT_YOURS, 403);

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
