/**
 * What a place search keeps, and in what order, once the day it is adding to
 * already has something on it.
 *
 * The bias circle only asks Google to prefer the day's neighbourhood; it does
 * not stop "ramen" on a Fukuoka day from coming back with a shop in Tokyo. A
 * day with stops on it is somewhere, and a place 900 km from all of them is
 * not going on it — so those are dropped, and what is left is ordered by how
 * close each result is to the nearest stop already on the day. That is the
 * question the list is answering: what is near what I am already doing?
 *
 * An empty day has nowhere to measure from, so it keeps everything in
 * Google's order. That is the case for a long-range search — planning the
 * Hakone day from Fukuoka — and it is still open on any day with nothing on
 * it yet.
 *
 * Long-range is not unlimited, though. Whatever the day, a result has to
 * belong to the trip: in a country the trip already has a place in, or within
 * a few hundred kilometres of one (`nearTrip`). Another city in Japan is a
 * reasonable thing to add to a Japan trip; a shop in Ohio that shares a name
 * with the one you meant is not.
 */

import { haversineMetres, type LatLng, type NamedPoint } from "./geo.ts";

/** Farther than this from every stop on the day is not part of that day. */
export const DAY_RANGE_M = 30_000;

/**
 * Outside the trip's countries, farther than this from everything on it is not
 * part of the trip. It is there for the border: a Basel trip taking a lunch in
 * Freiburg, or a place Google has no country for.
 */
export const TRIP_RANGE_M = 500_000;

/** Somewhere already on the trip — a stop or a stay — and its country. */
export interface TripPoint extends LatLng {
  countryCode: string | null;
}

export interface Nearest {
  /** The stop on the day the result is closest to. */
  name: string;
  metres: number;
}

export interface NearbyResult<T> {
  place: T;
  /** Null when the day has no located stops to measure from. */
  nearest: Nearest | null;
}

export interface Nearby<T> {
  /** In range, nearest first; Google's order when there is nothing to measure from. */
  kept: NearbyResult<T>[];
  /** How many came back from Google and were too far from the day to show. */
  dropped: number;
}

/** The node in `nodes` closest to `point`, or null when there are none. */
export function nearestNode(point: LatLng, nodes: readonly NamedPoint[]): Nearest | null {
  let best: Nearest | null = null;
  for (const node of nodes) {
    const metres = haversineMetres(point, node);
    if (!best || metres < best.metres) best = { name: node.name, metres };
  }
  return best;
}

export function nearDay<T extends LatLng>(
  places: readonly T[],
  /** The open day's located stops. Empty for an empty day, or no day. */
  nodes: readonly NamedPoint[],
  rangeMetres: number = DAY_RANGE_M,
): Nearby<T> {
  if (nodes.length === 0) {
    return { kept: places.map((place) => ({ place, nearest: null })), dropped: 0 };
  }

  const measured = places.map((place) => ({ place, nearest: nearestNode(place, nodes)! }));
  const kept = measured
    .filter((r) => r.nearest.metres <= rangeMetres)
    // Array sort is stable, so two results the same distance off keep
    // Google's relevance order between them.
    .sort((a, b) => a.nearest.metres - b.nearest.metres);
  return { kept, dropped: measured.length - kept.length };
}

/**
 * The results that belong to the trip at all: in one of its countries, or near
 * something on it. A trip with nothing located on it has no footprint yet, and
 * keeps everything.
 */
export function nearTrip<T extends LatLng & { countryCode: string | null }>(
  places: readonly T[],
  footprint: readonly TripPoint[],
  rangeMetres: number = TRIP_RANGE_M,
): { kept: T[]; dropped: number } {
  if (footprint.length === 0) return { kept: [...places], dropped: 0 };

  const countries = new Set(footprint.flatMap((p) => (p.countryCode ? [p.countryCode] : [])));
  const kept = places.filter((place) =>
    (place.countryCode !== null && countries.has(place.countryCode)) ||
    footprint.some((p) => haversineMetres(place, p) <= rangeMetres),
  );
  return { kept, dropped: places.length - kept.length };
}
