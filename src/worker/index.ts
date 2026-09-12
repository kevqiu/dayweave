import { Hono } from "hono";
import { fetchMyMap } from "../lib/kml.ts";
import {
  autocomplete,
  placeDetails,
  PlacesError,
  textSearch,
  type PlaceDetails,
} from "../lib/places.ts";
import { haversineMetres, resolveBias, roundedCentre, type Bias } from "../lib/geo.ts";
import { suggestDays, type CandidateDay } from "../lib/suggest.ts";
import {
  addPlaceAsStop,
  cityOfDay,
  citiesForTrip,
  createTrip,
  dateRangeLabel,
  dayLabel,
  getTrip,
  initialsFor,
  getStop,
  listDays,
  listStops,
  moveStopToDay,
  placesOnTrip,
  stopsForDay,
  toDayGeo,
  type DayRow,
  type StopRow,
} from "./store.ts";
import { page } from "./ui/page.ts";
import { avatarColor } from "./ui/tokens.ts";
import type { worker } from "../../alchemy.run.ts";

type Env = typeof worker.Env;

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true }));

/**
 * Stands in for Better Auth until PLAN.md section 5 lands.
 *
 * The schema needs an owner on a trip and an author on a stop, and this gives
 * it one without pretending to be a sign-in: a per-browser id in a cookie, no
 * account, no verification, no sharing.
 */
const IDENTITY_COOKIE = "yvr_dev_uid";

function identity(c: { req: { header: (k: string) => string | undefined } }): {
  userId: string;
  setCookie: string | null;
} {
  const cookies = c.req.header("cookie") ?? "";
  const found = /(?:^|;\s*)yvr_dev_uid=([^;]+)/.exec(cookies);
  if (found?.[1]) return { userId: found[1], setCookie: null };

  const userId = `dev_${crypto.randomUUID()}`;
  return {
    userId,
    setCookie: `${IDENTITY_COOKIE}=${userId}; Path=/; Max-Age=31536000; SameSite=Lax`,
  };
}

const placesConfig = (env: Env) => ({
  apiKey: env.GOOGLE_PLACES_KEY,
  referer: env.PLACES_REFERRER,
});

const person = (userId: string) => ({
  initials: initialsFor(userId),
  color: avatarColor(userId),
});

const todayIso = () => new Date().toISOString().slice(0, 10);

app.get("/", (c) => {
  const { setCookie } = identity(c);
  if (setCookie) c.header("set-cookie", setCookie);
  return c.html(page());
});

// --- trips ------------------------------------------------------------------

app.post("/api/trips", async (c) => {
  const { userId, setCookie } = identity(c);
  if (setCookie) c.header("set-cookie", setCookie);

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
    ownerId: userId,
  });
  return c.json({ trip, days: await listDays(c.env.DB, trip.id) }, 201);
});

app.get("/api/trips", async (c) => {
  const { userId, setCookie } = identity(c);
  if (setCookie) c.header("set-cookie", setCookie);

  const { results } = await c.env.DB.prepare(
    `SELECT t.* FROM trips t
       JOIN trip_members m ON m.trip_id = t.id
      WHERE m.user_id = ?
      ORDER BY t.start_date DESC`,
  )
    .bind(userId)
    .all<{ id: string; name: string; start_date: string; end_date: string; owner_id: string }>();

  const trips = [];
  for (const trip of results ?? []) {
    const [days, stops, members] = await Promise.all([
      listDays(c.env.DB, trip.id),
      listStops(c.env.DB, trip.id),
      listMembers(c.env.DB, trip.id),
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
      members,
    });
  }

  return c.json({ me: person(userId), trips });
});

app.get("/api/trips/:tripId", async (c) => {
  const { userId, setCookie } = identity(c);
  if (setCookie) c.header("set-cookie", setCookie);

  const tripId = c.req.param("tripId");
  const trip = await getTrip(c.env.DB, tripId);
  if (!trip) return c.json({ error: "no such trip" }, 404);

  const [days, stops, members] = await Promise.all([
    listDays(c.env.DB, tripId),
    listStops(c.env.DB, tripId),
    listMembers(c.env.DB, tripId),
  ]);

  return c.json({
    trip,
    me: person(userId),
    members,
    cities: citiesForTrip(days, stops),
    headerSubtitle: headerSubtitle(trip.start_date, trip.end_date, stops.length),
    days: days.map((day) => ({
      ...day,
      label: dayLabel(day.date),
      stops: stopsForDay(stops, day.id),
    })),
    unplanned: stopsForDay(stops, null),
  });
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

async function listMembers(db: D1Database, tripId: string) {
  const { results } = await db
    .prepare(`SELECT user_id FROM trip_members WHERE trip_id = ? ORDER BY joined_at`)
    .bind(tripId)
    .all<{ user_id: string }>();
  return (results ?? []).map((r) => person(r.user_id));
}

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

  const [days, stops] = await Promise.all([listDays(c.env.DB, tripId), listStops(c.env.DB, tripId)]);
  const anywhere = c.req.query("anywhere") === "1";
  const bias = anywhere ? null : biasFor(c.req.query("dayId") ?? null, days, stops);

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
    results: places.map((place) => {
      const metres = anchor ? haversineMetres(anchor.location, { lat: place.lat, lng: place.lng }) : null;
      const outside = bias !== null && metres !== null && metres > bias.radius;
      return {
        placeId: place.googlePlaceId,
        name: place.name,
        category: place.category,
        rating: place.rating,
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

app.post("/api/trips/:tripId/stops", async (c) => {
  const { userId, setCookie } = identity(c);
  if (setCookie) c.header("set-cookie", setCookie);

  const tripId = c.req.param("tripId");
  const body = await c.req.json<{ placeId?: string; dayId?: string | null; sessionToken?: string }>();
  if (!body.placeId) return c.json({ error: "which place?" }, 400);

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
    userId,
  });
  return c.json({ ...result, place: details }, 201);
});

/**
 * "Paste a place link", PLAN.md section 3, and the last row of the search
 * artboard. A Maps URL carries the place's name in its path, so following the
 * link and searching for that name resolves it without a separate API.
 */
app.post("/api/trips/:tripId/stops/link", async (c) => {
  const { userId, setCookie } = identity(c);
  if (setCookie) c.header("set-cookie", setCookie);

  const tripId = c.req.param("tripId");
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
  const stop = await getStop(c.env.DB, c.req.param("stopId"));
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
  const stop = await getStop(c.env.DB, c.req.param("stopId"));
  if (!stop) return c.json({ error: "no such stop" }, 404);

  const body = await c.req.json<{ dayId?: string | null }>();
  const dayId = body.dayId ?? null;

  if (dayId !== null) {
    const day = await c.env.DB.prepare(`SELECT id FROM days WHERE id = ? AND trip_id = ?`)
      .bind(dayId, stop.trip_id)
      .first<{ id: string }>();
    if (!day) return c.json({ error: "that day is not on this trip" }, 400);
  }

  await moveStopToDay(c.env.DB, stop, dayId);
  return c.json({ ok: true, dayId });
});

app.post("/api/stops/:stopId/visited", async (c) => {
  const { userId } = identity(c);
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
      c.req.param("stopId"),
    )
    .run();

  return c.json({ ok: true, visited });
});

app.post("/api/stops/:stopId/note", async (c) => {
  const body = await c.req.json<{ note?: string }>();
  // Written by a person, never generated. An empty note is a blank card, not
  // a placeholder (PLAN.md section 4c).
  await c.env.DB.prepare(`UPDATE stops SET note = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .bind((body.note ?? "").trim(), Date.now(), c.req.param("stopId"))
    .run();
  return c.json({ ok: true });
});

app.post("/api/stops/:stopId/delete", async (c) => {
  // Soft, so someone else's offline edit stays undoable (PLAN.md section 9).
  await c.env.DB.prepare(`UPDATE stops SET deleted_at = ?, updated_at = ? WHERE id = ?`)
    .bind(Date.now(), Date.now(), c.req.param("stopId"))
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
