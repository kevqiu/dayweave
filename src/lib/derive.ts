/**
 * The two pieces of text the app computes rather than stores: the grey line
 * under a stop (PLAN.md section 4c) and the cities under a trip name
 * (section 4d).
 *
 * Both are derived at read time on purpose. Nothing here is ever written to a
 * column, so nothing here can go stale or be edited into something untrue.
 */

import { haversineMetres, type LatLng } from "./geo.ts";

/**
 * Metres a minute on foot. 80 is a shade under 5 km/h, which is the usual
 * planning figure for a city on flat ground.
 */
const WALK_METRES_PER_MINUTE = 80;

/**
 * Streets are not straight lines. Multiplying the great-circle distance is
 * crude next to a routing call, but it is free, it works offline, and it is
 * honest at the scale the line is read at: "6 min walk" and "8 min walk" mean
 * the same thing to someone deciding what to do next.
 */
const DETOUR_FACTOR = 1.3;

/**
 * Past this, it is not a walk and saying so would be silly rather than
 * useful. The line then carries the category alone.
 */
const MAX_WALK_MINUTES = 45;

/** Whole minutes on foot between two points, or null if that is not a walk. */
export function walkMinutes(from: LatLng, to: LatLng): number | null {
  const metres = haversineMetres(from, to) * DETOUR_FACTOR;
  const minutes = Math.round(metres / WALK_METRES_PER_MINUTE);
  if (minutes > MAX_WALK_MINUTES) return null;
  return Math.max(1, minutes);
}

export interface DescribableStop {
  category: string | null;
  location: LatLng | null;
}

/**
 * `ramen · 6 min walk`, `ramen` when it is the first stop of the day, and an
 * empty string when we know neither. Empty means the card shows nothing,
 * which section 4c prefers to a placeholder.
 */
export function describeStop(
  stop: DescribableStop,
  previous: DescribableStop | null,
): string {
  const parts: string[] = [];
  if (stop.category) parts.push(stop.category);

  if (stop.location && previous?.location) {
    const minutes = walkMinutes(previous.location, stop.location);
    if (minutes !== null) parts.push(`${minutes} min walk`);
  }

  return parts.join(" · ");
}

/**
 * The subtitle on a trip card: the cities its stops are actually in, in day
 * order, deduplicated, as `Fukuoka, Kagoshima, Hakone`.
 *
 * An empty list is the answer for a trip with no stops, and the card then
 * shows no subtitle at all rather than guessing. Section 4d is explicit that
 * this is the honest state.
 */
export function tripCities(citiesInDayOrder: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const city of citiesInDayOrder) {
    if (!city) continue;
    if (seen.has(city)) continue;
    seen.add(city);
    out.push(city);
  }
  return out;
}

/**
 * Words that mean "this is where you sleep".
 *
 * Google's Places types for lodging come through `shortCategory` as ordinary
 * lowercase words — `hotel`, `hostel`, `japanese inn` — so this reads the
 * category the app already stores rather than a column of its own. That has
 * two consequences worth knowing: a stop added before this existed is
 * recognised too, and a place Google types as something else (a hotel filed
 * under `restaurant` for its dining room) is not.
 *
 * Deliberately narrow. `apartment` and `campground` are left out: the first is
 * as often a place you are visiting as a place you are staying, and the
 * second is a stop on a hike as often as a night.
 */
const LODGING = [
  "hotel",
  "motel",
  "hostel",
  "inn",
  "ryokan",
  "minshuku",
  "resort",
  "lodging",
  "lodge",
  "guest house",
  "guesthouse",
  "guest room",
  "bed and breakfast",
  "bed & breakfast",
  "homestay",
  "farmstay",
  "cottage",
  "capsule",
];

/**
 * Whether a stop is somewhere you sleep.
 *
 * A whole word or phrase, never a substring: "inn" must not match "dinner" or
 * "Innsbruck", and "hotel" as part of "hotel supply store" is a shop.
 */
export function isAccommodation(category: string | null | undefined): boolean {
  if (!category) return false;
  const words = category.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return false;

  for (const term of LODGING) {
    const parts = term.split(" ");
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((part, k) => words[i + k] === part)) return true;
    }
  }
  return false;
}
