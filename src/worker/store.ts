/**
 * D1 reads and writes. Plain SQL against the schema in db/migrations, kept
 * apart from the HTTP layer so the routes stay readable.
 *
 * Everything here is trip-scoped. Membership is the permission (PLAN.md
 * section 5), so a caller that has already been checked against trip_members
 * may use any of it.
 */

import { orderKeyAppend } from "../lib/order.ts";
import { describeStop, tripCities } from "../lib/derive.ts";
import type { PlaceDetails } from "../lib/places.ts";
import type { DayGeo, LatLng } from "../lib/geo.ts";

export interface TripRow {
  id: string;
  name: string;
  slug: string;
  start_date: string;
  end_date: string;
  timezone: string;
  owner_id: string;
}

export interface DayRow {
  id: string;
  trip_id: string;
  date: string;
  label: string | null;
  place_label: string | null;
  hue: string;
}

export interface StopRow {
  id: string;
  day_id: string | null;
  place_id: string | null;
  title: string;
  note: string;
  order_key: string;
  status: string;
  place_name: string | null;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  category: string | null;
  maps_url: string | null;
}

const now = () => Date.now();

/**
 * The day ramp from PLAN.md section 7: day one a deep green, the last day a
 * pale yellow, olive and orange on the way. A sequence encoded as a sequence,
 * so "further down the ramp" reads as "further away in time" with no legend.
 */
const RAMP_START = { r: 0x4e, g: 0x7a, b: 0x4b };
const RAMP_END = { r: 0xe8, g: 0xd0, b: 0x7a };

export function dayHue(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(mix(RAMP_START.r, RAMP_END.r))}${hex(mix(RAMP_START.g, RAMP_END.g))}${hex(
    mix(RAMP_START.b, RAMP_END.b),
  )}`;
}

/** Every date from start to end inclusive, as ISO days. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return out;

  // A trip nobody would plan is still not a reason to loop forever.
  for (let guard = 0; cursor <= last && guard < 400; guard++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "trip"}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function createTrip(
  db: D1Database,
  input: { name: string; startDate: string; endDate: string; timezone?: string; ownerId: string },
): Promise<TripRow> {
  const id = crypto.randomUUID();
  const trip: TripRow = {
    id,
    name: input.name,
    slug: slugify(input.name),
    start_date: input.startDate,
    end_date: input.endDate,
    timezone: input.timezone ?? "UTC",
    owner_id: input.ownerId,
  };

  const dates = datesBetween(trip.start_date, trip.end_date);
  const statements = [
    db
      .prepare(
        `INSERT INTO trips (id, name, slug, start_date, end_date, timezone, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        trip.id,
        trip.name,
        trip.slug,
        trip.start_date,
        trip.end_date,
        trip.timezone,
        trip.owner_id,
        now(),
        now(),
      ),
    db
      .prepare(`INSERT INTO trip_members (trip_id, user_id, joined_at) VALUES (?, ?, ?)`)
      .bind(trip.id, input.ownerId, now()),
    ...dates.map((date, i) =>
      db
        .prepare(`INSERT INTO days (id, trip_id, date, hue) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), trip.id, date, dayHue(i, dates.length)),
    ),
  ];

  await db.batch(statements);
  return trip;
}

export async function getTrip(db: D1Database, tripId: string): Promise<TripRow | null> {
  return await db.prepare(`SELECT * FROM trips WHERE id = ?`).bind(tripId).first<TripRow>();
}

export async function listDays(db: D1Database, tripId: string): Promise<DayRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM days WHERE trip_id = ? ORDER BY date`)
    .bind(tripId)
    .all<DayRow>();
  return results ?? [];
}

/**
 * A trip's stops in the order they are shown: unplanned last, everything else
 * by day then order_key. Joined to places, because every read of a stop wants
 * the pin with it.
 */
export async function listStops(db: D1Database, tripId: string): Promise<StopRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.day_id, s.place_id, s.title, s.note, s.order_key, s.status,
              p.name AS place_name, p.google_place_id, p.lat, p.lng, p.city,
              p.category, p.maps_url
         FROM stops s
         LEFT JOIN places p ON p.id = s.place_id
        WHERE s.trip_id = ? AND s.deleted_at IS NULL
        ORDER BY (s.day_id IS NULL), s.day_id, s.order_key`,
    )
    .bind(tripId)
    .all<StopRow>();
  return results ?? [];
}

/**
 * Places on the trip already, so the search list can say "on trip" instead of
 * offering the same place twice (PLAN.md section 4b).
 */
export async function placeIdsOnTrip(db: D1Database, tripId: string): Promise<Set<string>> {
  const { results } = await db
    .prepare(`SELECT google_place_id FROM places WHERE trip_id = ? AND google_place_id IS NOT NULL`)
    .bind(tripId)
    .all<{ google_place_id: string }>();
  return new Set((results ?? []).map((r) => r.google_place_id));
}

/**
 * Writes the chosen place and points a stop at it.
 *
 * Dedup is per trip on google_place_id, which the schema already enforces with
 * a UNIQUE constraint — so the insert is an upsert and the same restaurant
 * found twice is one row with two stops, not two rows.
 */
export async function addPlaceAsStop(
  db: D1Database,
  input: {
    tripId: string;
    dayId: string | null;
    details: PlaceDetails;
    source: "search" | "link" | "my_map";
    userId: string;
  },
): Promise<{ stopId: string; placeId: string; deduped: boolean }> {
  const existing = await db
    .prepare(`SELECT id FROM places WHERE trip_id = ? AND google_place_id = ?`)
    .bind(input.tripId, input.details.googlePlaceId)
    .first<{ id: string }>();

  const placeId = existing?.id ?? crypto.randomUUID();
  const d = input.details;

  if (existing) {
    // Same place, fresher content. refreshed_at is what keeps us inside
    // Google's caching terms (PLAN.md section 3).
    await db
      .prepare(
        `UPDATE places SET name = ?, lat = ?, lng = ?, address = ?, city = ?,
                country_code = ?, category = ?, maps_url = ?, refreshed_at = ?
           WHERE id = ?`,
      )
      .bind(
        d.name,
        d.lat,
        d.lng,
        d.address,
        d.city,
        d.countryCode,
        d.category,
        d.mapsUrl,
        now(),
        placeId,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO places (id, trip_id, google_place_id, name, name_local, lat, lng,
                             address, city, country_code, category, maps_url, source, refreshed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        placeId,
        input.tripId,
        d.googlePlaceId,
        d.name,
        d.nameLocal,
        d.lat,
        d.lng,
        d.address,
        d.city,
        d.countryCode,
        d.category,
        d.mapsUrl,
        input.source,
        now(),
      )
      .run();
  }

  const siblings = await db
    .prepare(
      `SELECT order_key FROM stops
        WHERE trip_id = ? AND deleted_at IS NULL
          AND day_id IS ?`,
    )
    .bind(input.tripId, input.dayId)
    .all<{ order_key: string }>();

  const stopId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO stops (id, trip_id, day_id, place_id, title, order_key, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stopId,
      input.tripId,
      input.dayId,
      placeId,
      d.name,
      orderKeyAppend((siblings.results ?? []).map((r) => r.order_key)),
      input.userId,
      now(),
      now(),
    )
    .run();

  return { stopId, placeId, deduped: Boolean(existing) };
}

// --- read models ------------------------------------------------------------

/** What the bias resolver needs: each day, with the coordinates on it. */
export function toDayGeo(days: readonly DayRow[], stops: readonly StopRow[]): DayGeo[] {
  return days.map((day) => ({
    id: day.id,
    date: day.date,
    stops: stops
      .filter((s) => s.day_id === day.id && s.lat !== null && s.lng !== null)
      .map((s) => ({ lat: s.lat as number, lng: s.lng as number })),
  }));
}

export interface StopView {
  id: string;
  title: string;
  /** Derived, never typed. PLAN.md section 4c. */
  description: string;
  note: string;
  status: string;
  city: string | null;
  mapsUrl: string | null;
  location: LatLng | null;
}

/**
 * Stops for one day, each with its grey line. The walking time is measured
 * from the stop before it on that day, which is why this is computed over the
 * ordered list rather than per row.
 */
export function stopsForDay(stops: readonly StopRow[], dayId: string | null): StopView[] {
  const ordered = stops.filter((s) => s.day_id === dayId);

  return ordered.map((stop, i) => {
    const location = stop.lat !== null && stop.lng !== null ? { lat: stop.lat, lng: stop.lng } : null;
    const before = ordered[i - 1];
    const previous = before
      ? {
          category: before.category,
          location:
            before.lat !== null && before.lng !== null
              ? { lat: before.lat, lng: before.lng }
              : null,
        }
      : null;

    return {
      id: stop.id,
      title: stop.place_name ?? stop.title,
      description: describeStop({ category: stop.category, location }, previous),
      note: stop.note,
      status: stop.status,
      city: stop.city,
      mapsUrl: stop.maps_url,
      location,
    };
  });
}

/** The line under a trip name on a card: the cities, in day order. */
export function citiesForTrip(days: readonly DayRow[], stops: readonly StopRow[]): string[] {
  const inDayOrder: (string | null)[] = [];
  for (const day of days) {
    for (const stop of stops.filter((s) => s.day_id === day.id)) inDayOrder.push(stop.city);
  }
  for (const stop of stops.filter((s) => s.day_id === null)) inDayOrder.push(stop.city);
  return tripCities(inDayOrder);
}
