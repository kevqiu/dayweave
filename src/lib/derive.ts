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
