/**
 * D1 reads and writes. Plain SQL against the schema in db/migrations, kept
 * apart from the HTTP layer so the routes stay readable.
 *
 * Everything here is trip-scoped. Membership is the permission (PLAN.md
 * section 5), so a caller that has already been checked against trip_members
 * may use any of it.
 */

import { orderKeyAppend, orderKeyBetween } from "../lib/order.ts";
import { locality } from "../lib/locality.ts";
import { inviteToken } from "../lib/invite.ts";
import { describeStop, isAccommodation, tripCities } from "../lib/derive.ts";
import type { PlaceDetails } from "../lib/places.ts";
import type { Week } from "../lib/hours.ts";
import type { DayGeo, LatLng } from "../lib/geo.ts";
import { AVATAR_COLORS, avatarColor, dayColor } from "./ui/tokens.ts";

export { dayColor };

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
  start_time: string | null;
  order_key: string;
  status: string;
  created_by: string;
  place_name: string | null;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  category: string | null;
  maps_url: string | null;
  /** JSON, src/lib/hours.ts. Null when Google has none or nobody has asked. */
  opening_hours: string | null;
}

const now = () => Date.now();

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
        .bind(crypto.randomUUID(), trip.id, date, dayColor(i)),
    ),
  ];

  await db.batch(statements);
  return trip;
}

export async function getTrip(db: D1Database, tripId: string): Promise<TripRow | null> {
  return await db.prepare(`SELECT * FROM trips WHERE id = ?`).bind(tripId).first<TripRow>();
}

/** One stop, with the place joined on, for the routes that act on a single one. */
export async function getStop(db: D1Database, stopId: string): Promise<(StopRow & { trip_id: string }) | null> {
  return await db
    .prepare(
      `SELECT s.id, s.trip_id, s.day_id, s.place_id, s.title, s.note, s.start_time,
              s.order_key, s.status, s.created_by,
              p.name AS place_name, p.google_place_id, p.lat, p.lng, p.city,
              p.category, p.maps_url, p.opening_hours
         FROM stops s
         LEFT JOIN places p ON p.id = s.place_id
        WHERE s.id = ? AND s.deleted_at IS NULL`,
    )
    .bind(stopId)
    .first<StopRow & { trip_id: string }>();
}

/**
 * Moves a stop to another day, or to the To be planned bucket, and puts it
 * immediately after `afterStopId` in that day's order.
 *
 * `afterStopId` of null means first in the day; undefined means the end. The
 * key is recomputed against its new neighbours rather than carried over,
 * because a fractional index only means anything within one list (PLAN.md
 * section 6), and computing it between the two rows the drop landed between is
 * what makes the write a single field rather than a renumbering.
 */
export async function moveStopToDay(
  db: D1Database,
  stop: StopRow & { trip_id: string },
  dayId: string | null,
  afterStopId?: string | null,
): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT id, order_key FROM stops
        WHERE trip_id = ? AND deleted_at IS NULL AND day_id IS ? AND id != ?
        ORDER BY order_key`,
    )
    .bind(stop.trip_id, dayId, stop.id)
    .all<{ id: string; order_key: string }>();

  const siblings = results ?? [];
  let orderKey: string;

  if (afterStopId === undefined) {
    orderKey = orderKeyAppend(siblings.map((r) => r.order_key));
  } else {
    const index = afterStopId === null ? -1 : siblings.findIndex((r) => r.id === afterStopId);
    // A neighbour that is not on this day any more means the list moved under
    // the drag; appending is the safe answer rather than guessing a position.
    if (afterStopId !== null && index === -1) {
      orderKey = orderKeyAppend(siblings.map((r) => r.order_key));
    } else {
      const before = index === -1 ? null : (siblings[index] as { order_key: string }).order_key;
      const next = siblings[index + 1];
      orderKey = orderKeyBetween(before, next ? next.order_key : null);
    }
  }

  await db
    .prepare(`UPDATE stops SET day_id = ?, order_key = ?, updated_at = ? WHERE id = ?`)
    .bind(dayId, orderKey, now(), stop.id)
    .run();

  return orderKey;
}

/** The day's city, taken from whatever its stops say they are in. */
export function cityOfDay(dayId: string, stops: readonly StopRow[]): string | null {
  const stop = stops.find((s) => s.day_id === dayId && s.city);
  return stop ? locality(stop.city, stop.lat !== null && stop.lng !== null ? { lat: stop.lat, lng: stop.lng } : null) : null;
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
      `SELECT s.id, s.day_id, s.place_id, s.title, s.note, s.start_time,
              s.order_key, s.status, s.created_by,
              p.name AS place_name, p.google_place_id, p.lat, p.lng, p.city,
              p.category, p.maps_url, p.opening_hours
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
 * Places already on the trip, mapped to the day they sit on.
 *
 * The search list needs more than a yes or no: `design/PlaceSearch.dc.html`
 * writes the row as "Already on Sat Oct 3", so the day has to come back with
 * it. A place kept in the To be planned bucket has no day, and the artboard's
 * wording falls back to the bucket's own name.
 */
export async function placesOnTrip(
  db: D1Database,
  tripId: string,
): Promise<Map<string, string>> {
  const { results } = await db
    .prepare(
      `SELECT p.google_place_id, d.date
         FROM places p
         LEFT JOIN stops s ON s.place_id = p.id AND s.deleted_at IS NULL
         LEFT JOIN days d ON d.id = s.day_id
        WHERE p.trip_id = ? AND p.google_place_id IS NOT NULL`,
    )
    .bind(tripId)
    .all<{ google_place_id: string; date: string | null }>();

  const out = new Map<string, string>();
  for (const row of results ?? []) {
    // A place can hang off several stops; the first day we see is enough to
    // tell someone it is already here.
    if (out.has(row.google_place_id)) continue;
    out.set(row.google_place_id, row.date ? dayLabel(row.date) : "To be planned");
  }
  return out;
}

/** `2026-10-03` -> `Sat Oct 3`, the form every artboard uses for a day. */
export function dayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
  const month = MONTHS[date.getUTCMonth()];
  return `${weekday} ${month} ${date.getUTCDate()}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `Sep 30 – Oct 10`, the date range on a trip card. The month is not repeated
 * when both ends share one, which is how the artboards write `Apr 11 – 22`.
 */
export function dateRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startIso} – ${endIso}`;
  }
  const left = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`;
  // A trip of one day is a date, not a range.
  if (startIso === endIso) return left;

  const right =
    start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()
      ? `${end.getUTCDate()}`
      : `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${left} – ${right}`;
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
    /** `14:30` when the Plan view added it into a gap. */
    startTime?: string | null;
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
    await saveHours(db, placeId, d);
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
    await saveHours(db, placeId, d);
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
      `INSERT INTO stops (id, trip_id, day_id, place_id, title, start_time, order_key,
                          created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stopId,
      input.tripId,
      input.dayId,
      placeId,
      d.name,
      input.startTime ?? null,
      orderKeyAppend((siblings.results ?? []).map((r) => r.order_key)),
      input.userId,
      now(),
      now(),
    )
    .run();

  return { stopId, placeId, deduped: Boolean(existing) };
}

// --- read models ------------------------------------------------------------

/**
 * What the bias resolver needs: each day, with its coordinates in planned
 * order and each one named, so the circle can carry an anchor to measure
 * distances from.
 */
export function toDayGeo(days: readonly DayRow[], stops: readonly StopRow[]): DayGeo[] {
  return days.map((day) => ({
    id: day.id,
    date: day.date,
    stops: stops
      .filter((s) => s.day_id === day.id && s.lat !== null && s.lng !== null)
      .map((s) => ({
        lat: s.lat as number,
        lng: s.lng as number,
        name: s.place_name ?? s.title,
      })),
  }));
}

export interface StopView {
  id: string;
  title: string;
  manual: boolean;
  /** Derived, never typed. PLAN.md section 4c, `meta` in Main.dc.html. */
  description: string;
  /** Typed by a person, and absent until someone writes one. */
  note: string;
  /** `10:00`, or empty. Many stops never get one (PLAN.md section 11). */
  time: string;
  status: string;
  /** Two letters in the avatar on the row. */
  author: string;
  authorColor: string;
  city: string | null;
  /**
   * Somewhere you sleep, worked out from the category (`isAccommodation`).
   *
   * Not a route stop: it is not numbered, its pin carries a roof rather than a
   * number, and it keeps its colour when the rest of the day dims. A hotel is
   * where the day starts and ends, so it stays legible whatever else is
   * selected.
   */
  accommodation: boolean;
  /** Where Open Maps goes. Built rather than stored — see mapsUrl. */
  mapsUrl: string | null;
  location: LatLng | null;
  /**
   * The place's regular week, cut at midnight (src/lib/hours.ts). The browser
   * checks it against the day and the time itself, because both change
   * optimistically under a drag and the answer has to change with them.
   */
  hours: Week | null;
}

/**
 * The link behind Open Maps.
 *
 * This opens the place's Maps listing — the page for the place itself, where
 * you can read its hours, photos and reviews and start directions from there
 * if you want them. It is the documented Maps Search URL, with the place id
 * riding along so Google resolves the exact place rather than the nearest
 * thing to a coordinate, so the listing that opens is the one on the trip and
 * not a namesake down the road.
 */
export function mapsUrl(
  location: LatLng | null,
  googlePlaceId: string | null,
): string | null {
  if (!location) return null;
  const params = new URLSearchParams({
    api: "1",
    query: `${location.lat},${location.lng}`,
  });
  if (googlePlaceId) params.set("query_place_id", googlePlaceId);
  return `https://www.google.com/maps/search/?${params}`;
}

/**
 * Two letters for the avatar on a row, from a real name.
 *
 * The artboards show KQ and MT because they draw named people, and there are
 * named people now: Better Auth keeps the name Google gave us. Two words give
 * a letter each; one word gives its first two, because a single initial in a
 * 32px circle reads as an unfinished one.
 */
export function initialsForName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0] as string;
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const last = words[words.length - 1] as string;
  return `${first[0]}${last[0]}`.toUpperCase();
}

/**
 * Two letters for someone with no name to read.
 *
 * Kept for the member whose row has outlived the account it named — a trip
 * still lists a `user_id` after that user is gone, and an empty circle would
 * read as a bug rather than as an absence. Arbitrary, but stable per id and
 * shaped like initials. Digits would read as a count.
 */
export function initialsFor(userId: string): string {
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 33 + userId.charCodeAt(i)) >>> 0;
  const first = LETTERS[hash % 26] as string;
  const second = LETTERS[Math.floor(hash / 26) % 26] as string;
  return `${first}${second}`;
}

/**
 * Stops for one day, each with its grey line. The walking time is measured
 * from the stop before it on that day, which is why this is computed over the
 * ordered list rather than per row.
 */
export function stopsForDay(
  stops: readonly StopRow[],
  dayId: string | null,
  /**
   * Who wrote each stop, and what circle they wear on this trip.
   *
   * Without it the avatar falls back to two letters hashed out of the user id,
   * which is what it did when nobody had a name. That is why a stop added by
   * a signed-in Kevin Qiu was labelled MZ: the hash never knew about the
   * account, and nothing told it once there was one. The colour comes from the
   * map too rather than from the id, because on this trip it is dealt by join
   * order — see `peopleOfTrip`.
   */
  people?: ReadonlyMap<string, Person>,
): StopView[] {
  const ordered = stops.filter((s) => s.day_id === dayId);
  // To be planned is a bucket, not a route. Two things sitting in it next to
  // each other are not one after the other, so the walk between them would be
  // a measurement of nothing; the line says where the place is instead, which
  // is what design/Planner.dc.html writes on a tray card: `Fukuoka · shopping`.
  const isRoute = dayId !== null;

  return ordered.map((stop, i) => {
    const author = personOf(stop.created_by, people);
    const location = stop.lat !== null && stop.lng !== null ? { lat: stop.lat, lng: stop.lng } : null;
    const before = isRoute ? ordered[i - 1] : undefined;
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
      manual: stop.place_id === null,
      description: isRoute
        ? describeStop({ category: stop.category, location }, previous)
        : [locality(stop.city, location), stop.category].filter(Boolean).join(" · "),
      note: stop.note,
      time: stop.start_time ?? "",
      status: stop.status,
      author: author.initials,
      authorColor: author.color,
      city: locality(stop.city, location),
      accommodation: isAccommodation(stop.category),
      mapsUrl: mapsUrl(location, stop.google_place_id),
      location,
      hours: parseHours(stop.opening_hours),
    };
  });
}

/** The stored week, or null for anything that is not one. */
export function parseHours(raw: string | null | undefined): Week | null {
  if (!raw) return null;
  try {
    const week = JSON.parse(raw) as unknown;
    return Array.isArray(week) && week.length === 7 ? (week as Week) : null;
  } catch {
    return null;
  }
}

/**
 * Writes a place's hours, when the details it came with carried any word on
 * them. A search cached before hours were asked for has no `hours` key at all,
 * and that is "not asked", not "has none" — so it leaves `hours_at` alone for
 * the trip read to fill in.
 */
async function saveHours(db: D1Database, placeId: string, details: Pick<PlaceDetails, "hours">): Promise<void> {
  if (details.hours === undefined) return;
  await db
    .prepare(`UPDATE places SET opening_hours = ?, hours_at = ? WHERE id = ?`)
    .bind(details.hours ? JSON.stringify(details.hours) : null, now(), placeId)
    .run();
}

export async function setPlaceHours(db: D1Database, placeId: string, hours: Week | null): Promise<void> {
  await saveHours(db, placeId, { hours });
}

/** Thirty days, the longest Google lets place content sit in a cache. */
export const HOURS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Places on a trip whose hours were never asked for, or were asked for more
 * than thirty days ago. Every place added before hours existed is one; so is
 * any place that has sat on a trip for a month.
 */
export async function placesNeedingHours(
  db: D1Database,
  tripId: string,
  limit: number,
): Promise<{ id: string; google_place_id: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT id, google_place_id FROM places
        WHERE trip_id = ? AND google_place_id IS NOT NULL
          AND (hours_at IS NULL OR hours_at < ?)
        LIMIT ?`,
    )
    .bind(tripId, now() - HOURS_MAX_AGE_MS, limit)
    .all<{ id: string; google_place_id: string }>();
  return results ?? [];
}

/** The line under a trip name on a card: the cities, in day order. */
export function citiesForTrip(days: readonly DayRow[], stops: readonly StopRow[]): string[] {
  const inDayOrder: (string | null)[] = [];
  for (const day of days) {
    for (const stop of stops.filter((s) => s.day_id === day.id)) inDayOrder.push(locality(stop.city, stop.lat !== null && stop.lng !== null ? { lat: stop.lat, lng: stop.lng } : null));
  }
  for (const stop of stops.filter((s) => s.day_id === null)) inDayOrder.push(locality(stop.city, stop.lat !== null && stop.lng !== null ? { lat: stop.lat, lng: stop.lng } : null));
  return tripCities(inDayOrder);
}

/* ------------------------------------------------------------------ people */

export interface UserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/**
 * The people behind a set of ids, in one read.
 *
 * `user` is Better Auth's table and this is the only place the app reads it:
 * everywhere else a person is an id on a row, which is what keeps membership
 * a foreign key rather than a copy of somebody's name.
 */
export async function usersById(
  db: D1Database,
  ids: readonly string[],
): Promise<Map<string, UserRow>> {
  const wanted = [...new Set(ids)].filter(Boolean);
  if (wanted.length === 0) return new Map();

  const { results } = await db
    .prepare(`SELECT id, name, email, image FROM "user" WHERE id IN (${wanted.map(() => "?").join(", ")})`)
    .bind(...wanted)
    .all<UserRow>();

  return new Map((results ?? []).map((row) => [row.id, row]));
}

/**
 * A person, in the shape an avatar needs.
 *
 * `name` is Better Auth's, which is Google's, and the initials come from it;
 * the colour comes from where they sit on the trip, which is what keeps two
 * people on one trip from wearing the same circle (see `peopleOfTrip`).
 * Someone with no `user` row — a browser that owned trips before sign-in
 * existed and never signed in on it — keeps the two derived letters
 * `initialsFor` has always given it, so nothing it made loses its author.
 */
export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export function personOf(userId: string, people?: ReadonlyMap<string, Person>): Person {
  const known = people?.get(userId);
  if (known) return known;
  return { id: userId, name: "", initials: initialsFor(userId), color: avatarColor(userId) };
}

/**
 * Everyone on one trip, with the colour their avatar is that trip.
 *
 * The colour comes from the order people joined rather than from a hash of
 * their id, which is what `tokens.ts` transcribes from the artboards: the
 * person who started it is terracotta, then blue, violet, mauve. A hash was
 * fine while a trip had one person on it and stops being fine the moment an
 * invite is accepted, because two people can hash to the same circle and the
 * avatar is the only thing telling them apart.
 */
export async function peopleOfTrip(
  db: D1Database,
  tripId: string,
): Promise<Map<string, Person>> {
  const ids = await memberIds(db, tripId);
  const named = await usersById(db, ids);

  const out = new Map<string, Person>();
  ids.forEach((id, index) => {
    const name = named.get(id)?.name ?? "";
    out.set(id, {
      id,
      name,
      initials: name ? initialsForName(name) : initialsFor(id),
      color: AVATAR_COLORS[index % AVATAR_COLORS.length] as string,
    });
  });
  return out;
}

/**
 * What happens to the trips a `yvr_dev_uid` cookie owns: they follow the
 * browser that made them, once, into the account that signs in on it.
 *
 * Before sign-in existed, a trip was owned by a per-browser id in a cookie.
 * That id is a bearer token — whoever holds the cookie already has every one
 * of those trips — so handing them to the account signing in from that same
 * browser gives nobody access they did not have a second earlier. It is the
 * one moment when the two ids are provably the same person, which is why this
 * runs then and never again: the cookie is cleared on the way out.
 *
 * Everything the id touches moves together. A trip whose owner moved but whose
 * stops still read `created_by: dev_…` would put a stranger's initials on the
 * cards of a trip with one member.
 *
 * `UPDATE OR IGNORE` on the membership, then a delete: the primary key is
 * (trip_id, user_id), so a browser that somehow held both ids on one trip
 * would collide, and the row to keep in that case is the one already there.
 */
export async function adoptDevIdentity(
  db: D1Database,
  devId: string,
  userId: string,
): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE trips SET owner_id = ? WHERE owner_id = ?`).bind(userId, devId),
    db.prepare(`UPDATE OR IGNORE trip_members SET user_id = ? WHERE user_id = ?`).bind(userId, devId),
    db.prepare(`DELETE FROM trip_members WHERE user_id = ?`).bind(devId),
    db.prepare(`UPDATE trip_invites SET invited_by = ? WHERE invited_by = ?`).bind(userId, devId),
    db.prepare(`UPDATE stops SET created_by = ? WHERE created_by = ?`).bind(userId, devId),
    db.prepare(`UPDATE stops SET visited_by = ? WHERE visited_by = ?`).bind(userId, devId),
    db.prepare(`UPDATE ops SET actor_id = ? WHERE actor_id = ?`).bind(userId, devId),
  ]);
}

/* -------------------------------------------------------------- membership */

/**
 * Membership IS the permission (PLAN.md section 5), which only means anything
 * once there is a second person, so this is the check the invite feature turns
 * from a comment into a rule. There is no role to read.
 */
export async function isMember(db: D1Database, tripId: string, userId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM trip_members WHERE trip_id = ? AND user_id = ?`)
    .bind(tripId, userId)
    .first<{ ok: number }>();
  return row !== null;
}

export async function memberIds(db: D1Database, tripId: string): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT user_id FROM trip_members WHERE trip_id = ? ORDER BY joined_at`)
    .bind(tripId)
    .all<{ user_id: string }>();
  return (results ?? []).map((r) => r.user_id);
}

/** Idempotent: following the same link twice joins you once. */
export async function joinTrip(db: D1Database, tripId: string, userId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO trip_members (trip_id, user_id, joined_at) VALUES (?, ?, ?)
         ON CONFLICT (trip_id, user_id) DO NOTHING`,
    )
    .bind(tripId, userId, now())
    .run();
}

/** How many places each person on the trip put there, for the People screen. */
export async function placeCounts(db: D1Database, tripId: string): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT created_by, COUNT(*) AS n FROM stops
        WHERE trip_id = ? AND deleted_at IS NULL
        GROUP BY created_by`,
    )
    .bind(tripId)
    .all<{ created_by: string; n: number }>();

  const out = new Map<string, number>();
  for (const row of results ?? []) out.set(row.created_by, row.n);
  return out;
}

// --- invites ----------------------------------------------------------------

export interface InviteRow {
  id: string;
  trip_id: string;
  token: string;
  invited_by: string;
  created_at: number;
}

/**
 * The trip's live invite link, or nothing.
 *
 * There is one at a time, and it is reusable: an invite you cannot copy twice
 * is not a link you can hand to two people, and the whole point of a link
 * rather than an email is that the inviter sends it however they already talk
 * to whoever is coming. Revoking it is the explicit act PLAN.md section 5 puts
 * in place of an expiry.
 */
export async function liveInvite(db: D1Database, tripId: string): Promise<InviteRow | null> {
  return await db
    .prepare(
      `SELECT id, trip_id, token, invited_by, created_at FROM trip_invites
        WHERE trip_id = ? AND revoked_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(tripId)
    .first<InviteRow>();
}

/** The live one if there is one, a new one if there is not. */
export async function ensureInvite(
  db: D1Database,
  tripId: string,
  userId: string,
): Promise<InviteRow> {
  const existing = await liveInvite(db, tripId);
  if (existing) return existing;

  const invite: InviteRow = {
    id: crypto.randomUUID(),
    trip_id: tripId,
    token: inviteToken(),
    invited_by: userId,
    created_at: now(),
  };
  await db
    .prepare(
      `INSERT INTO trip_invites (id, trip_id, token, invited_by, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(invite.id, invite.trip_id, invite.token, invite.invited_by, invite.created_at)
    .run();
  return invite;
}

/** Turning the switch off. Every link the trip has ever had stops working. */
export async function revokeInvites(db: D1Database, tripId: string): Promise<void> {
  await db
    .prepare(`UPDATE trip_invites SET revoked_at = ? WHERE trip_id = ? AND revoked_at IS NULL`)
    .bind(now(), tripId)
    .run();
}

/** A followed link, resolved. Revoked and unknown are the same answer. */
export async function inviteByToken(db: D1Database, token: string): Promise<InviteRow | null> {
  return await db
    .prepare(
      `SELECT id, trip_id, token, invited_by, created_at FROM trip_invites
        WHERE token = ? AND revoked_at IS NULL`,
    )
    .bind(token)
    .first<InviteRow>();
}

/**
 * A stop that is not a place: "Pick up the rental car", "Get ready".
 *
 * `0001_init.sql` has always allowed this — `stops.place_id` is nullable and
 * the column comment reads "NULL = a note, no pin" — and nothing could make
 * one. Now something can. It behaves as every other stop does: it sits on a
 * day, takes a time, drags between days and hours, and can be ticked off. What
 * it does not have is a place, so it has no pin on the map, no walk on its
 * second line and no Open Maps.
 *
 * The title is the whole of it. A place's title comes from Google and its note
 * is the thing a person wrote; here the person wrote the title, and the note
 * stays available for the detail underneath.
 */
export async function addNoteAsStop(
  db: D1Database,
  input: {
    tripId: string;
    dayId: string | null;
    title: string;
    userId: string;
    startTime?: string | null;
  },
): Promise<{ stopId: string }> {
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
      `INSERT INTO stops (id, trip_id, day_id, place_id, title, start_time, order_key,
                          created_by, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stopId,
      input.tripId,
      input.dayId,
      input.title,
      input.startTime ?? null,
      orderKeyAppend((siblings.results ?? []).map((r) => r.order_key)),
      input.userId,
      now(),
      now(),
    )
    .run();

  return { stopId };
}

// --- changing a trip after it exists ----------------------------------------

export interface LodgingRow {
  id: string;
  trip_id: string;
  place_id: string | null;
  name: string;
  check_in: string;
  check_out: string;
  note: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  city?: string | null;
  google_place_id?: string | null;
}

/**
 * Renaming a trip, and moving its dates. PLAN.md section 4d's "changing the
 * dates later", which was written and left unbuilt.
 *
 * The days are reconciled rather than rebuilt: a date that is in both the old
 * range and the new one keeps its row, which is what keeps its stops, its name
 * and the colour somebody chose for it. A date that falls outside the new
 * range loses its row, and `stops.day_id` is `ON DELETE SET NULL`, so whatever
 * was on it lands in To be planned instead of disappearing — the one thing a
 * date change must never do is throw away places somebody found.
 *
 * New days are coloured by their position in the whole trip, so a day added at
 * the front is the deep green and the ones behind it keep what they had. The
 * alternative — recolouring every day to its new index — would repaint a trip
 * somebody has already coloured by hand.
 */
export async function updateTrip(
  db: D1Database,
  trip: TripRow,
  input: { name: string; startDate: string; endDate: string },
): Promise<{ added: number; removed: number }> {
  const dates = datesBetween(input.startDate, input.endDate);
  const existing = await listDays(db, trip.id);
  const keep = new Set(dates);

  const gone = existing.filter((d) => !keep.has(d.date));
  const have = new Set(existing.map((d) => d.date));
  const added = dates.filter((date) => !have.has(date));

  const statements: D1PreparedStatement[] = [
    db
      .prepare(`UPDATE trips SET name = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?`)
      .bind(input.name, input.startDate, input.endDate, now(), trip.id),
    // Emptied before they are dropped rather than relying on ON DELETE SET
    // NULL. The constraint says the same thing, but it only fires while
    // foreign keys are enforced, and a stop left pointing at a day that is
    // gone belongs to no list at all — it would simply stop being on the trip.
    ...gone.map((day) =>
      db
        .prepare(`UPDATE stops SET day_id = NULL, updated_at = ? WHERE day_id = ?`)
        .bind(now(), day.id),
    ),
    ...gone.map((day) => db.prepare(`DELETE FROM days WHERE id = ?`).bind(day.id)),
    ...added.map((date) =>
      db
        .prepare(`INSERT INTO days (id, trip_id, date, hue) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), trip.id, date, dayColor(dates.indexOf(date))),
    ),
  ];

  await db.batch(statements);
  return { added: added.length, removed: gone.length };
}

/**
 * A day's own name and colour.
 *
 * `days.label` has been in the schema since the first migration and nothing
 * wrote to it; this is what it is for. The date stays the day's heading — it
 * is the thing that cannot be wrong — and the name sits under it, the way a
 * city already does.
 */
export async function updateDay(
  db: D1Database,
  dayId: string,
  input: { label?: string | null; hue?: string },
): Promise<void> {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if (input.label !== undefined) {
    sets.push("label = ?");
    values.push(input.label);
  }
  if (input.hue !== undefined) {
    sets.push("hue = ?");
    values.push(input.hue);
  }
  if (!sets.length) return;
  await db
    .prepare(`UPDATE days SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values, dayId)
    .run();
}

/** `#A1B2C3`, or null for anything that is not one. */
export function cleanHex(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const hex = raw.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(hex) ? hex : null;
}

// --- lodging ----------------------------------------------------------------

/**
 * Where you are sleeping, PLAN.md section 5b.
 *
 * A stay spans dates rather than sitting on one, which is why `lodging` has
 * always been its own table and not a stop with a flag. `check_in` and
 * `check_out` are the first and last date the stay applies to, inclusive —
 * the range somebody picks on the sheet — rather than a hotel's own
 * arrive-and-leave, because what the Planner draws is which days you have a
 * bed on.
 */
export async function listLodging(db: D1Database, tripId: string): Promise<LodgingRow[]> {
  const { results } = await db
    .prepare(
      `SELECT l.id, l.trip_id, l.place_id, l.name, l.check_in, l.check_out, l.note,
              p.lat, p.lng, p.address, p.city, p.google_place_id
         FROM lodging l
         LEFT JOIN places p ON p.id = l.place_id
        WHERE l.trip_id = ?
        ORDER BY l.check_in, l.check_out, l.name`,
    )
    .bind(tripId)
    .all<LodgingRow>();
  return results ?? [];
}

async function lodgingPlace(db: D1Database, tripId: string, details: PlaceDetails | null): Promise<string | null> {
  let placeId: string | null = null;

  if (details) {
    // The same dedup the stops take: one row per place per trip, so a hotel
    // that is also a stop is one pin.
    const d = details;
    const existing = await db
      .prepare(`SELECT id FROM places WHERE trip_id = ? AND google_place_id = ?`)
      .bind(tripId, d.googlePlaceId)
      .first<{ id: string }>();
    placeId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      await db
        .prepare(
          `INSERT INTO places (id, trip_id, google_place_id, name, name_local, lat, lng,
                               address, city, country_code, category, maps_url, source, refreshed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          placeId,
          tripId,
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
          "search",
          now(),
        )
        .run();
      await saveHours(db, placeId, d);
    }
  }

  return placeId;
}

export async function addLodging(
  db: D1Database,
  input: {
    tripId: string;
    name: string;
    checkIn: string;
    checkOut: string;
    note?: string;
    details?: PlaceDetails | null;
  },
): Promise<LodgingRow> {
  const placeId = await lodgingPlace(db, input.tripId, input.details ?? null);

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO lodging (id, trip_id, place_id, name, check_in, check_out, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.tripId, placeId, input.name, input.checkIn, input.checkOut, input.note ?? "")
    .run();

  return {
    id,
    trip_id: input.tripId,
    place_id: placeId,
    name: input.name,
    check_in: input.checkIn,
    check_out: input.checkOut,
    note: input.note ?? "",
    lat: input.details?.lat ?? null,
    lng: input.details?.lng ?? null,
    address: input.details?.address ?? null,
  };
}

export async function updateLodging(
  db: D1Database,
  id: string,
  input: { name?: string; checkIn?: string; checkOut?: string; note?: string; location?: { tripId: string; details: PlaceDetails | null } },
): Promise<void> {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if (input.location) { sets.push("place_id = ?"); values.push(await lodgingPlace(db, input.location.tripId, input.location.details)); }
  if (input.name !== undefined) { sets.push("name = ?"); values.push(input.name); }
  if (input.checkIn !== undefined) { sets.push("check_in = ?"); values.push(input.checkIn); }
  if (input.checkOut !== undefined) { sets.push("check_out = ?"); values.push(input.checkOut); }
  if (input.note !== undefined) { sets.push("note = ?"); values.push(input.note); }
  if (!sets.length) return;
  await db.prepare(`UPDATE lodging SET ${sets.join(", ")} WHERE id = ?`).bind(...values, id).run();
}

export async function deleteLodging(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM lodging WHERE id = ?`).bind(id).run();
}
