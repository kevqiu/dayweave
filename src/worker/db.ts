/**
 * Every D1 read and write, in one file. The routes stay thin so the shape of
 * the SQL is visible in one place while the schema is still moving.
 */
import { generateKeyBetween } from "fractional-indexing";
import type {
  CreateStopBody, CreateTripBody, Day, Member, Place, Stop, Trip, TripSummary, UpdateStopBody,
} from "../shared/types.ts";
import { datesBetween, dayCount, toDayNumber } from "../lib/dates.ts";
import { dayHue, initials, personColor } from "../lib/palette.ts";

export function newId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 22);
}

/** Trip URLs read better as a slug, and it has to be unique across trips. */
export function slugify(name: string): string {
  const base = name.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${base || "trip"}-${newId().slice(0, 6)}`;
}

interface TripRow {
  id: string; name: string; slug: string; start_date: string; end_date: string;
  timezone: string; owner_id: string;
}
interface DayRow { id: string; date: string; label: string | null; place_label: string | null; hue: string }
interface StopRow {
  id: string; day_id: string | null; place_id: string | null; title: string; note: string;
  start_time: string | null; end_time: string | null; order_key: string; status: string;
  created_by: string;
  place_name: string | null; lat: number | null; lng: number | null;
  city: string | null; category: string | null; source: string | null;
}
interface MemberRow { user_id: string; name: string | null }

const STOP_COLUMNS = `
  s.id, s.day_id, s.place_id, s.title, s.note, s.start_time, s.end_time,
  s.order_key, s.status, s.created_by,
  p.name AS place_name, p.lat, p.lng, p.city, p.category, p.source
`;

/**
 * Metres between two points, straight line. Enough to rank and to say "6 min
 * walk"; PLAN.md 8 is explicit that no routing call happens here.
 */
function haversine(a: Place, b: Place): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Category, then walking time from the previous stop. Derived, never typed. */
function describe(place: Place | null, previous: Place | null): string {
  const bits: string[] = [];
  if (place?.category) bits.push(place.category);
  if (place && previous) {
    // 80 m/min is an unhurried walking pace, and rounding up avoids "0 min".
    const minutes = Math.max(1, Math.round(haversine(previous, place) / 80));
    if (minutes <= 45) bits.push(`${minutes} min walk`);
  }
  return bits.join(" · ");
}

function toPlace(row: StopRow): Place | null {
  if (!row.place_id || row.lat === null || row.lng === null) return null;
  return {
    id: row.place_id,
    name: row.place_name ?? "",
    lat: row.lat,
    lng: row.lng,
    city: row.city,
    category: row.category,
    source: (row.source ?? "search") as Place["source"],
  };
}

/** Walks a day's stops in order so each description can see its predecessor. */
function toStops(rows: StopRow[]): Stop[] {
  let previous: Place | null = null;
  return rows.map((row) => {
    const place = toPlace(row);
    const stop: Stop = {
      id: row.id,
      dayId: row.day_id,
      placeId: row.place_id,
      title: row.title,
      note: row.note,
      startTime: row.start_time,
      endTime: row.end_time,
      orderKey: row.order_key,
      status: row.status as Stop["status"],
      createdBy: row.created_by,
      place,
      description: describe(place, previous),
    };
    if (place) previous = place;
    return stop;
  });
}

async function membersOf(db: D1Database, tripId: string): Promise<Member[]> {
  const { results } = await db
    .prepare(`SELECT m.user_id, u.name FROM trip_members m
              LEFT JOIN app_user u ON u.id = m.user_id
              WHERE m.trip_id = ? ORDER BY m.joined_at`)
    .bind(tripId)
    .all<MemberRow>();
  return results.map((row) => {
    const name = row.name ?? "Someone";
    return { userId: row.user_id, name, initials: initials(name), color: personColor(row.user_id) };
  });
}

/** 1-based day number if today falls inside the trip, else null. */
function currentDayOf(trip: TripRow, today: string): number | null {
  const at = toDayNumber(today) - toDayNumber(trip.start_date);
  return at >= 0 && at < dayCount(trip.start_date, trip.end_date) ? at + 1 : null;
}

export async function listTrips(db: D1Database, userId: string, today: string): Promise<TripSummary[]> {
  const { results: trips } = await db
    .prepare(`SELECT t.* FROM trips t
              JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ?
              ORDER BY t.start_date DESC`)
    .bind(userId)
    .all<TripRow>();

  return Promise.all(trips.map(async (trip) => {
    const counts = await db
      .prepare(`SELECT COUNT(*) AS total,
                       SUM(CASE WHEN status = 'visited' THEN 1 ELSE 0 END) AS visited
                FROM stops WHERE trip_id = ? AND deleted_at IS NULL`)
      .bind(trip.id)
      .first<{ total: number; visited: number | null }>();
    const { results: cities } = await db
      .prepare(`SELECT DISTINCT p.city FROM places p
                JOIN stops s ON s.place_id = p.id AND s.deleted_at IS NULL
                JOIN days d ON d.id = s.day_id
                WHERE p.trip_id = ? AND p.city IS NOT NULL
                ORDER BY d.date`)
      .bind(trip.id)
      .all<{ city: string }>();

    return {
      id: trip.id,
      slug: trip.slug,
      name: trip.name,
      startDate: trip.start_date,
      endDate: trip.end_date,
      cities: cities.map((c) => c.city),
      members: await membersOf(db, trip.id),
      stopCount: counts?.total ?? 0,
      visitedCount: counts?.visited ?? 0,
      currentDay: currentDayOf(trip, today),
      dayCount: dayCount(trip.start_date, trip.end_date),
    };
  }));
}

export async function getTrip(db: D1Database, slug: string, userId: string, today: string): Promise<Trip | null> {
  const trip = await db.prepare("SELECT * FROM trips WHERE slug = ?").bind(slug).first<TripRow>();
  if (!trip) return null;

  const member = await db
    .prepare("SELECT 1 AS ok FROM trip_members WHERE trip_id = ? AND user_id = ?")
    .bind(trip.id, userId)
    .first<{ ok: number }>();
  if (!member) return null;

  const { results: dayRows } = await db
    .prepare("SELECT id, date, label, place_label, hue FROM days WHERE trip_id = ? ORDER BY date")
    .bind(trip.id)
    .all<DayRow>();

  const { results: stopRows } = await db
    .prepare(`SELECT ${STOP_COLUMNS} FROM stops s
              LEFT JOIN places p ON p.id = s.place_id
              WHERE s.trip_id = ? AND s.deleted_at IS NULL
              ORDER BY s.order_key`)
    .bind(trip.id)
    .all<StopRow>();

  const byDay = new Map<string | null, StopRow[]>();
  for (const row of stopRows) {
    const key = row.day_id;
    const list = byDay.get(key) ?? [];
    list.push(row);
    byDay.set(key, list);
  }

  const days: Day[] = dayRows.map((row) => ({
    id: row.id,
    date: row.date,
    label: row.label,
    placeLabel: row.place_label,
    hue: row.hue,
    stops: toStops(byDay.get(row.id) ?? []),
  }));

  const stopCount = stopRows.length;
  const visitedCount = stopRows.filter((r) => r.status === "visited").length;
  const cities: string[] = [];
  for (const day of days) {
    for (const stop of day.stops) {
      if (stop.place?.city && !cities.includes(stop.place.city)) cities.push(stop.place.city);
    }
  }

  return {
    id: trip.id,
    slug: trip.slug,
    name: trip.name,
    startDate: trip.start_date,
    endDate: trip.end_date,
    cities,
    members: await membersOf(db, trip.id),
    stopCount,
    visitedCount,
    currentDay: currentDayOf(trip, today),
    dayCount: days.length,
    days,
    // day_id IS NULL is the To be planned sidebar. Not a separate table.
    unplanned: toStops(byDay.get(null) ?? []),
  };
}

export async function createTrip(
  db: D1Database, userId: string, body: CreateTripBody, today: string,
): Promise<TripSummary> {
  const id = newId();
  const slug = slugify(body.name);
  const now = Date.now();
  const dates = datesBetween(body.startDate, body.endDate);

  const statements = [
    db.prepare(`INSERT INTO trips (id, name, slug, start_date, end_date, timezone, owner_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'UTC', ?, ?, ?)`)
      .bind(id, body.name, slug, body.startDate, body.endDate, userId, now, now),
    db.prepare("INSERT INTO trip_members (trip_id, user_id, joined_at) VALUES (?, ?, ?)")
      .bind(id, userId, now),
    ...dates.map((date, i) =>
      db.prepare("INSERT INTO days (id, trip_id, date, hue) VALUES (?, ?, ?, ?)")
        .bind(newId(), id, date, dayHue(i, dates.length))),
  ];
  await db.batch(statements);

  return {
    id, slug, name: body.name,
    startDate: body.startDate, endDate: body.endDate,
    cities: [],
    members: await membersOf(db, id),
    stopCount: 0, visitedCount: 0,
    currentDay: currentDayOf(
      { start_date: body.startDate, end_date: body.endDate } as TripRow, today),
    dayCount: dates.length,
  };
}

/**
 * An order key strictly between the two neighbours the client names. The
 * client sends keys rather than indexes so two people dropping onto the same
 * gap at once get different keys instead of fighting (PLAN.md 6).
 */
function keyBetween(after: string | null | undefined, before: string | null | undefined): string {
  return generateKeyBetween(after ?? null, before ?? null);
}

async function lastKeyOf(db: D1Database, tripId: string, dayId: string | null): Promise<string | null> {
  const row = await db
    .prepare(`SELECT order_key FROM stops
              WHERE trip_id = ? AND deleted_at IS NULL AND day_id IS ?
              ORDER BY order_key DESC LIMIT 1`)
    .bind(tripId, dayId)
    .first<{ order_key: string }>();
  return row?.order_key ?? null;
}

export async function createStop(
  db: D1Database, tripId: string, userId: string, body: CreateStopBody,
): Promise<string> {
  const dayId = body.dayId ?? null;
  // With no neighbours named, append to the end of whatever list it lands in.
  const after = body.after ?? (body.before ? null : await lastKeyOf(db, tripId, dayId));
  const id = newId();
  const now = Date.now();
  await db
    .prepare(`INSERT INTO stops
                (id, trip_id, day_id, place_id, title, note, start_time, order_key,
                 status, created_by, created_at, updated_at)
              VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'planned', ?, ?, ?)`)
    .bind(id, tripId, dayId, body.title, body.note ?? "", body.startTime ?? null,
          keyBetween(after, body.before), userId, now, now)
    .run();
  return id;
}

export async function updateStop(
  db: D1Database, tripId: string, stopId: string, body: UpdateStopBody,
): Promise<boolean> {
  const sets: string[] = [];
  const values: unknown[] = [];

  const push = (column: string, value: unknown) => { sets.push(`${column} = ?`); values.push(value); };

  if (body.title !== undefined) push("title", body.title);
  if (body.note !== undefined) push("note", body.note);
  if (body.startTime !== undefined) push("start_time", body.startTime);
  if (body.dayId !== undefined) push("day_id", body.dayId);
  if (body.status !== undefined) {
    push("status", body.status);
    push("visited_at", body.status === "visited" ? Date.now() : null);
  }
  // A move sends neighbours; only then does the key change.
  if (body.after !== undefined || body.before !== undefined) {
    push("order_key", keyBetween(body.after, body.before));
  }
  if (sets.length === 0) return false;

  push("updated_at", Date.now());
  const result = await db
    .prepare(`UPDATE stops SET ${sets.join(", ")} WHERE id = ? AND trip_id = ? AND deleted_at IS NULL`)
    .bind(...values, stopId, tripId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Soft, so a removal on a shared trip stays undoable (PLAN.md 9). */
export async function deleteStop(db: D1Database, tripId: string, stopId: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE stops SET deleted_at = ?, updated_at = ? WHERE id = ? AND trip_id = ? AND deleted_at IS NULL")
    .bind(Date.now(), Date.now(), stopId, tripId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function tripIdForSlug(db: D1Database, slug: string, userId: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT t.id FROM trips t
              JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ?
              WHERE t.slug = ?`)
    .bind(userId, slug)
    .first<{ id: string }>();
  return row?.id ?? null;
}
