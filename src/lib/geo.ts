/**
 * Geography small enough to keep in one file: distances, centroids, and the
 * bias circle that PLAN.md section 4b hands to the Places API.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle metres between two points. */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Arithmetic mean of the points.
 *
 * Wrong by a few hundred metres for a set that straddles the antimeridian,
 * which no trip this app plans does, and harmless anyway: the result only
 * picks the centre of a 3 km ranking circle.
 */
export function centroid(points: readonly LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

/** Where a bias circle came from, so the UI can say "near Kagoshima" honestly. */
export type BiasSource = "day-stops" | "lodging" | "nearest-day" | "viewport";

/**
 * A place the distances on the search rows are measured from, so a row can
 * read "450 m from Ohori Park" rather than from an unnamed centroid.
 *
 * It is the last stop on whichever day the circle came from, because that is
 * where you would be walking on from. Null when the circle has no named point
 * behind it, and the rows then show no distance at all.
 */
export interface BiasAnchor {
  name: string;
  location: LatLng;
}

export interface Bias {
  center: LatLng;
  /** Metres. The Places API caps this at 50 000. */
  radius: number;
  source: BiasSource;
  anchor: BiasAnchor | null;
  /** The day the circle came from, so the chip can name it. Null for a viewport. */
  dayId: string | null;
}

/** PLAN.md section 4b: the open day's stops win, at 3 km. */
const DAY_RADIUS_M = 3_000;
const MAX_RADIUS_M = 50_000;

/** A stop as the bias resolver sees it: somewhere on the map, with a name. */
export interface NamedPoint extends LatLng {
  name: string;
}

export interface DayGeo {
  id: string;
  /** ISO date, used only to order days when looking either side. */
  date: string;
  /** In the order they are planned, so the last one is the anchor. */
  stops: NamedPoint[];
  /** That day's lodging, when it has one. */
  lodging?: NamedPoint | null;
}

export interface BiasInput {
  /** The day being planned. When absent we go straight to the viewport. */
  dayId?: string | null;
  days?: readonly DayGeo[];
  /** Last resort: whatever the map is currently showing. */
  viewport?: { center: LatLng; radius: number } | null;
}

/**
 * The circle, in the order PLAN.md section 4b sets out:
 *
 *   1. centroid of the open day's stops
 *   2. that day's lodging
 *   3. the nearest day either side that has stops
 *   4. the map viewport
 *
 * Returns null when none of them can be answered, which is a brand new trip
 * with nothing on it. The caller then searches unbiased, which is also what
 * "Search anywhere" does.
 */
export function resolveBias(input: BiasInput): Bias | null {
  const days = input.days ?? [];
  const open = days.find((d) => d.id === input.dayId);

  if (open) {
    const fromStops = centroid(open.stops);
    if (fromStops) {
      return {
        center: fromStops,
        radius: DAY_RADIUS_M,
        source: "day-stops",
        anchor: lastOf(open.stops),
        dayId: open.id,
      };
    }

    if (open.lodging) {
      const { name, ...point } = open.lodging;
      return {
        center: point,
        radius: DAY_RADIUS_M,
        source: "lodging",
        anchor: { name, location: point },
        dayId: open.id,
      };
    }

    const neighbour = nearestDayWithStops(days, open);
    if (neighbour) {
      const center = centroid(neighbour.stops);
      if (center) {
        return {
          center,
          radius: DAY_RADIUS_M,
          source: "nearest-day",
          anchor: lastOf(neighbour.stops),
          dayId: neighbour.id,
        };
      }
    }
  }

  if (input.viewport) {
    return {
      center: input.viewport.center,
      radius: Math.min(MAX_RADIUS_M, Math.max(1, Math.round(input.viewport.radius))),
      source: "viewport",
      // A viewport is a rectangle someone dragged, not a place with a name.
      anchor: null,
      dayId: null,
    };
  }

  return null;
}

function lastOf(stops: readonly NamedPoint[]): BiasAnchor | null {
  const last = stops[stops.length - 1];
  if (!last) return null;
  return { name: last.name, location: { lat: last.lat, lng: last.lng } };
}

/**
 * The closest day either side of `open` that has stops. Ties go to the earlier
 * day, because on the morning of an empty day you are still where last night
 * left you.
 */
function nearestDayWithStops(days: readonly DayGeo[], open: DayGeo): DayGeo | null {
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const index = ordered.findIndex((d) => d.id === open.id);
  if (index === -1) return null;

  for (let step = 1; step < ordered.length; step++) {
    const before = ordered[index - step];
    if (before && before.stops.length > 0) return before;
    const after = ordered[index + step];
    if (after && after.stops.length > 0) return after;
  }
  return null;
}

/**
 * The cache key's share of the bias, rounded to ~1.1 km so that nudging the
 * map does not miss the cache. PLAN.md section 4b caches on query plus this.
 */
export function roundedCentre(bias: Bias | null): string {
  if (!bias) return "none";
  return `${bias.center.lat.toFixed(2)},${bias.center.lng.toFixed(2)}`;
}
