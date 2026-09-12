import { Hono } from "hono";
import { fetchMyMap } from "../lib/kml.ts";
import { autocomplete, placeDetails, PlacesError, type Suggestion } from "../lib/places.ts";
import { resolveBias, roundedCentre, type Bias } from "../lib/geo.ts";
import {
  addPlaceAsStop,
  citiesForTrip,
  createTrip,
  getTrip,
  listDays,
  listStops,
  placeIdsOnTrip,
  stopsForDay,
  toDayGeo,
} from "./store.ts";
import { page } from "./ui.ts";
import type { worker } from "../../alchemy.run.ts";

type Env = typeof worker.Env;

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true }));

/**
 * Stands in for Better Auth until PLAN.md section 5 lands.
 *
 * The schema needs an owner on a trip and an author on a stop, and this gives
 * it one without pretending to be a sign-in: a per-browser id in a cookie, no
 * account, no verification, no sharing. Every route that reads it is one that
 * section 5 will have to revisit anyway.
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

function placesConfig(env: Env) {
  return { apiKey: env.GOOGLE_PLACES_KEY, referer: env.PLACES_REFERRER };
}

// --- the app ----------------------------------------------------------------

app.get("/", (c) => {
  const { setCookie } = identity(c);
  if (setCookie) c.header("set-cookie", setCookie);
  return c.html(page());
});

app.post("/api/trips", async (c) => {
  const { userId, setCookie } = identity(c);
  if (setCookie) c.header("set-cookie", setCookie);

  const body = await c.req.json<{ name?: string; startDate?: string; endDate?: string }>();
  const name = body.name?.trim();
  // Section 4d: the name is required, and it is the only name we ever show.
  if (!name) return c.json({ error: "a trip needs a name" }, 400);
  if (!body.startDate || !body.endDate) return c.json({ error: "a trip needs dates" }, 400);
  if (body.endDate < body.startDate) return c.json({ error: "the trip ends before it starts" }, 400);

  const trip = await createTrip(c.env.DB, {
    name,
    startDate: body.startDate,
    endDate: body.endDate,
    ownerId: userId,
  });
  const days = await listDays(c.env.DB, trip.id);

  return c.json({ trip, days }, 201);
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
    .all<{ id: string; name: string; start_date: string; end_date: string }>();

  const trips = [];
  for (const trip of results ?? []) {
    const [days, stops] = await Promise.all([
      listDays(c.env.DB, trip.id),
      listStops(c.env.DB, trip.id),
    ]);
    trips.push({
      ...trip,
      // Absent, not empty, when there are no stops — section 4d is explicit.
      cities: citiesForTrip(days, stops),
    });
  }
  return c.json({ trips });
});

app.get("/api/trips/:tripId", async (c) => {
  const tripId = c.req.param("tripId");
  const trip = await getTrip(c.env.DB, tripId);
  if (!trip) return c.json({ error: "no such trip" }, 404);

  const [days, stops] = await Promise.all([listDays(c.env.DB, tripId), listStops(c.env.DB, tripId)]);

  return c.json({
    trip,
    cities: citiesForTrip(days, stops),
    days: days.map((day) => ({ ...day, stops: stopsForDay(stops, day.id) })),
    unplanned: stopsForDay(stops, null),
  });
});

/**
 * Autocomplete, proxied. PLAN.md section 4b.
 *
 * The client debounces and holds the floor at three characters; both are
 * enforced again here, because a cost control that only exists in the browser
 * is not a cost control.
 */
const MIN_QUERY_LENGTH = 3;
const CACHE_TTL_SECONDS = 60 * 60;

app.get("/api/trips/:tripId/place-search", async (c) => {
  const tripId = c.req.param("tripId");
  const query = (c.req.query("q") ?? "").trim();
  const sessionToken = c.req.query("session") ?? "";

  if (query.length < MIN_QUERY_LENGTH) {
    return c.json({ suggestions: [], bias: null, reason: "too-short" });
  }
  if (!sessionToken) return c.json({ error: "a search needs a session token" }, 400);

  const trip = await getTrip(c.env.DB, tripId);
  if (!trip) return c.json({ error: "no such trip" }, 404);

  const bias = c.req.query("anywhere") === "1" ? null : await biasForRequest(c, tripId);

  // Query plus rounded bias centre, for an hour. The session token is
  // deliberately not in the key: it identifies a typing session, not a result.
  const cacheKey = `ac:v1:${roundedCentre(bias)}:${query.toLowerCase()}`;
  const cached = await c.env.PLACES_CACHE.get(cacheKey, "json");

  let suggestions: Suggestion[];
  let cacheHit = true;
  if (cached) {
    suggestions = cached as Suggestion[];
  } else {
    cacheHit = false;
    try {
      suggestions = await autocomplete(placesConfig(c.env), { query, sessionToken, bias });
    } catch (error) {
      if (error instanceof PlacesError) {
        return c.json({ error: error.message, upstreamStatus: error.status }, 502);
      }
      throw error;
    }
    await c.env.PLACES_CACHE.put(cacheKey, JSON.stringify(suggestions), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  }

  // Places already on the trip are shown as "on trip" rather than offered again.
  const onTrip = await placeIdsOnTrip(c.env.DB, tripId);

  return c.json({
    cacheHit,
    bias: bias ? { ...bias, centre: roundedCentre(bias) } : null,
    suggestions: suggestions.map((s) => ({ ...s, onTrip: onTrip.has(s.placeId) })),
  });
});

/** Adds the place someone picked, and the stop pointing at it. */
app.post("/api/trips/:tripId/stops", async (c) => {
  const { userId, setCookie } = identity(c);
  if (setCookie) c.header("set-cookie", setCookie);

  const tripId = c.req.param("tripId");
  const body = await c.req.json<{ placeId?: string; sessionToken?: string; dayId?: string | null }>();
  if (!body.placeId) return c.json({ error: "which place?" }, 400);
  if (!body.sessionToken) return c.json({ error: "a pick needs its session token" }, 400);

  const trip = await getTrip(c.env.DB, tripId);
  if (!trip) return c.json({ error: "no such trip" }, 404);

  let details;
  try {
    // Same token as the keystrokes that led here, which is what closes the
    // session and bills the whole search once.
    details = await placeDetails(placesConfig(c.env), body.placeId, body.sessionToken);
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

  const [days, stops] = await Promise.all([listDays(c.env.DB, tripId), listStops(c.env.DB, tripId)]);
  const stop = stopsForDay(stops, body.dayId ?? null).find((s) => s.id === result.stopId);

  return c.json({ ...result, place: details, stop, cities: citiesForTrip(days, stops) }, 201);
});

/**
 * The bias circle for this request, in the order section 4b sets out. The
 * viewport is the last resort and only the client knows it, so it arrives as
 * query parameters.
 */
async function biasForRequest(
  c: { req: { query: (k: string) => string | undefined }; env: Env },
  tripId: string,
): Promise<Bias | null> {
  const [days, stops] = await Promise.all([listDays(c.env.DB, tripId), listStops(c.env.DB, tripId)]);

  const lat = Number(c.req.query("vlat"));
  const lng = Number(c.req.query("vlng"));
  const radius = Number(c.req.query("vradius"));
  const viewport =
    Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radius)
      ? { center: { lat, lng }, radius }
      : null;

  return resolveBias({ dayId: c.req.query("dayId") ?? null, days: toDayGeo(days, stops), viewport });
}

/**
 * The My Maps spike, as an endpoint rather than a script.
 *
 * PLAN.md section 3 bets the whole import story on this fetch working from a
 * Worker. It cannot be proven from a dev machine behind a restrictive egress
 * policy, so it is deployed and called instead. Delete once the real import
 * Workflow exists.
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
