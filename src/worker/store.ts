/**
 * D1 reads and writes. Plain SQL against the schema in db/migrations, kept
 * apart from the HTTP layer so the routes stay readable.
 *
 * Everything here is trip-scoped. Membership is the permission (PLAN.md
 * section 5), so a caller that has already been checked against trip_members
 * may use any of it.
 */

import { orderKeyAppend, orderKeyBetween } from "../lib/order.ts";
import { initialsOfName, inviteToken } from "../lib/invite.ts";
import type { GoogleIdentity } from "../lib/oauth.ts";
import { describeStop, tripCities } from "../lib/derive.ts";
import type { PlaceDetails } from "../lib/places.ts";
import type { DayGeo, LatLng } from "../lib/geo.ts";
import { AVATAR_COLORS, avatarColor, dayHue } from "./ui/tokens.ts";

export { dayHue };

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
        .bind(crypto.randomUUID(), trip.id, date, dayHue(i, dates.length)),
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
              p.category, p.maps_url
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
  return stops.find((s) => s.day_id === dayId && s.city)?.city ?? null;
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
  /** Where Navigate goes. Built rather than stored — see navigateUrl. */
  navigateUrl: string | null;
  location: LatLng | null;
}

/**
 * The link behind Navigate.
 *
 * Not `places.maps_url`: Google's own `googleMapsUri` opens a place page that
 * lands zoomed out, which is useless when you are standing on a street trying
 * to walk somewhere. This is the documented Maps URL for directions, which
 * opens the app on the destination with walking directions ready. The place id
 * rides along so Google resolves the exact place rather than the nearest thing
 * to a coordinate.
 */
export function navigateUrl(
  location: LatLng | null,
  googlePlaceId: string | null,
): string | null {
  if (!location) return null;
  const params = new URLSearchParams({
    api: "1",
    destination: `${location.lat},${location.lng}`,
    travelmode: "walking",
  });
  if (googlePlaceId) params.set("destination_place_id", googlePlaceId);
  return `https://www.google.com/maps/dir/?${params}`;
}

/**
 * Two letters for the avatar on a row.
 *
 * The artboards show real initials, KQ and MT, because they draw named people.
 * There are no names until Better Auth lands (PLAN.md section 5), so these are
 * derived from the id: arbitrary, but stable per person and shaped like
 * initials, which is what the avatar has to read as. Digits would read as a
 * count.
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
      description: isRoute
        ? describeStop({ category: stop.category, location }, previous)
        : [stop.city, stop.category].filter(Boolean).join(" · "),
      note: stop.note,
      time: stop.start_time ?? "",
      status: stop.status,
      author: author.initials,
      authorColor: author.color,
      city: stop.city,
      navigateUrl: navigateUrl(location, stop.google_place_id),
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

// --- people -----------------------------------------------------------------

/**
 * A person, in the shape an avatar needs.
 *
 * `name` is what someone typed at the door and the initials come from it; the
 * colour comes from where they sit on the trip, which is what keeps two people
 * on one trip from wearing the same circle (see `peopleOfTrip`). Someone with
 * no row yet — a browser that owned trips before sign-in existed — keeps the
 * two derived letters `initialsFor` has always given it, so nothing it made
 * loses its author.
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

export async function getUser(db: D1Database, userId: string): Promise<Person | null> {
  const row = await db
    .prepare(`SELECT id, name FROM app_user WHERE id = ?`)
    .bind(userId)
    .first<{ id: string; name: string }>();
  if (!row) return null;
  return { id: row.id, name: row.name, initials: initialsOfName(row.name), color: avatarColor(row.id) };
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
  const named = await peopleFor(db, ids);

  const out = new Map<string, Person>();
  ids.forEach((id, index) => {
    const known = named.get(id);
    out.set(id, {
      id,
      name: known?.name ?? "",
      initials: known?.initials ?? initialsFor(id),
      color: AVATAR_COLORS[index % AVATAR_COLORS.length] as string,
    });
  });
  return out;
}

/** Names for a set of ids, in one read rather than one per avatar. */
export async function peopleFor(
  db: D1Database,
  userIds: readonly string[],
): Promise<Map<string, Person>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  const out = new Map<string, Person>();
  if (!ids.length) return out;

  const { results } = await db
    .prepare(`SELECT id, name FROM app_user WHERE id IN (${ids.map(() => "?").join(", ")})`)
    .bind(...ids)
    .all<{ id: string; name: string }>();

  for (const row of results ?? []) {
    out.set(row.id, {
      id: row.id,
      name: row.name,
      initials: initialsOfName(row.name),
      color: avatarColor(row.id),
    });
  }
  return out;
}

/**
 * Signing in with Google.
 *
 * Three things have to line up, in this order, and the order is the whole
 * function: the Google account if we have seen it before, then the email
 * address if this is the same person arriving through a second Google account,
 * then a new person. Matching on the account first is what makes a changed
 * email address harmless; matching on email at all is what stops one person
 * ending up with two piles of trips.
 *
 * `adoptUserId` is the id a browser was already carrying — see `claimable` in
 * `src/worker/index.ts`. A browser that has been making trips since before
 * there was any sign-in brings them through the door rather than meeting its
 * own trips as a stranger.
 */
export async function signInWithGoogle(
  db: D1Database,
  input: {
    identity: GoogleIdentity;
    tokens: { accessToken: string | null; refreshToken: string | null; scope: string | null; expiresAt: number | null };
    adoptUserId?: string | null;
  },
): Promise<Person> {
  const { identity, tokens } = input;

  const linked = await db
    .prepare(`SELECT user_id FROM account WHERE provider_id = 'google' AND provider_account_id = ?`)
    .bind(identity.sub)
    .first<{ user_id: string }>();

  const byEmail = linked
    ? null
    : identity.email
      ? await db
          .prepare(`SELECT id FROM app_user WHERE email = ?`)
          .bind(identity.email)
          .first<{ id: string }>()
      : null;

  const userId = linked?.user_id ?? byEmail?.id ?? input.adoptUserId ?? `u_${crypto.randomUUID()}`;

  await db
    .prepare(
      `INSERT INTO app_user (id, email, name, image, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           email = excluded.email, name = excluded.name, image = excluded.image`,
    )
    .bind(userId, identity.email, identity.name, identity.picture, now())
    .run();

  await db
    .prepare(
      `INSERT INTO account (id, user_id, provider_id, provider_account_id,
                            access_token, refresh_token, scope, expires_at, created_at, updated_at)
       VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (provider_id, provider_account_id) DO UPDATE SET
           access_token = excluded.access_token,
           -- Google sends a refresh token once, on the first consent. A later
           -- sign-in comes back without one, and overwriting the stored token
           -- with that null is how an app quietly loses its own Drive access.
           refresh_token = COALESCE(excluded.refresh_token, account.refresh_token),
           scope = excluded.scope,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      identity.sub,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.scope,
      tokens.expiresAt,
      now(),
      now(),
    )
    .run();

  return {
    id: userId,
    name: identity.name,
    initials: initialsOfName(identity.name),
    color: avatarColor(userId),
  };
}

/**
 * Whether an id a browser is carrying is one we may adopt into a new account.
 *
 * Only an id that has never signed in: the moment there is an `app_user` row
 * for it, the cookie naming it is a claim about who somebody is, and a claim
 * is exactly what the old cookie could not make. This is the one place the
 * pre-sign-in cookie is still read, and it can only ever add trips to an
 * account, never open one.
 */
export async function claimableUserId(
  db: D1Database,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;

  const known = await db
    .prepare(`SELECT 1 AS ok FROM app_user WHERE id = ?`)
    .bind(userId)
    .first<{ ok: number }>();
  if (known) return null;

  const owns = await db
    .prepare(`SELECT 1 AS ok FROM trip_members WHERE user_id = ? LIMIT 1`)
    .bind(userId)
    .first<{ ok: number }>();
  return owns ? userId : null;
}

// --- membership -------------------------------------------------------------

/**
 * Membership IS the permission (PLAN.md section 5), which only means anything
 * once there is a second person, so this is the check the invite feature turns
 * from a comment into a rule.
 */
export async function isMember(
  db: D1Database,
  tripId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const row = await db
    .prepare(`SELECT 1 AS ok FROM trip_members WHERE trip_id = ? AND user_id = ?`)
    .bind(tripId, userId)
    .first<{ ok: number }>();
  return Boolean(row);
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
