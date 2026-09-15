/**
 * "Move to day", PLAN.md section 8, drawn by `design/MoveToDay.dc.html`.
 *
 * The ranking is deliberately simple and explainable, because a suggestion you
 * cannot understand is worse than no suggestion. Every candidate carries the
 * sentence that explains it, in the words the artboard writes them in.
 *
 * No routing call at suggest time. Straight-line distance is close enough to
 * rank, and a Directions call is only worth spending once someone asks for a
 * real walking time.
 */

import { haversineMetres, type LatLng } from "./geo.ts";
import { walkMinutes } from "./derive.ts";
import { locality, sameCity } from "./locality.ts";

export interface CandidateStop {
  id: string;
  name: string;
  location: LatLng | null;
}

export interface CandidateDay {
  id: string;
  date: string;
  /** `Sat Oct 3`, already formatted. */
  label: string;
  /** `Fukuoka`, or `Fukuoka to Kagoshima` on a travel day. */
  placeLabel: string | null;
  hue: string;
  /** The day's city, from its stops. Null when it has none. */
  city: string | null;
  /** In planned order. */
  stops: CandidateStop[];
}

export interface MovingStop {
  id: string;
  name: string;
  location: LatLng | null;
  city: string | null;
  /** Where it is now, so the sheet can say "currently Fri Oct 2". */
  currentDayId: string | null;
}

/** Why a day is or is not a good home for the stop. */
export type CandidateKind =
  | "best"
  | "ok"
  | "empty"
  | "travel"
  | "other-city"
  | "past"
  | "current"
  | "unplanned";

export interface Candidate {
  dayId: string | null;
  label: string;
  placeLabel: string | null;
  hue: string;
  kind: CandidateKind;
  /** `Fukuoka · 3 stops`, beside the day on the best-fit card. */
  shape: string;
  /** The grey line under the day, as the artboard writes it. */
  reason: string;
  /** Only on the best fit: the full sentence in the green card. */
  detail: string | null;
  /** The stop it would follow, and the one it would come before. */
  after: string | null;
  before: string | null;
  afterStopId?: string | null;
  addedMetres: number | null;
  addedMinutes: number | null;
  /** Lower is better. Infinity means it cannot be ranked at all. */
  score: number;
}

export interface Suggestion {
  /** The BEST FIT card, or null when nothing can be ranked. */
  best: Candidate | null;
  /** Everything else, in the order the list shows it. */
  rest: Candidate[];
}

/** A day whose label names two places is a day spent getting between them. */
const isTravelDay = (day: CandidateDay) => /\bto\b/i.test(day.placeLabel ?? "");

/** Past this many stops a day is full enough that one more is a cost. */
const CROWDED = 6;

/**
 * The extra straight-line distance of slotting `point` between two stops, and
 * which two they are. Walking out to somewhere and back is what it measures,
 * so the cheapest insertion is the one that bends the day's path least.
 */
function bestInsertion(
  day: CandidateDay,
  point: LatLng,
): { added: number; after: string | null; before: string | null; afterStopId: string | null } {
  const located = day.stops.filter((s) => s.location);
  if (located.length === 0) return { added: 0, after: null, before: null, afterStopId: null };

  const first = located[0] as CandidateStop;
  const last = located[located.length - 1] as CandidateStop;

  // Before the first stop, or after the last: one leg, not two.
  let best = {
    added: haversineMetres(point, first.location as LatLng),
    after: null as string | null,
    before: first.name as string | null,
    afterStopId: null as string | null,
  };

  const atEnd = haversineMetres(last.location as LatLng, point);
  if (atEnd < best.added) best = { added: atEnd, after: last.name, before: null, afterStopId: last.id };

  for (let i = 0; i < located.length - 1; i++) {
    const a = located[i] as CandidateStop;
    const b = located[i + 1] as CandidateStop;
    const detour =
      haversineMetres(a.location as LatLng, point) +
      haversineMetres(point, b.location as LatLng) -
      haversineMetres(a.location as LatLng, b.location as LatLng);
    if (detour < best.added) best = { added: detour, after: a.name, before: b.name, afterStopId: a.id };
  }

  return best;
}

/** `400 m`, `1.2 km`, `290 km` — the same scale the search rows use. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  if (metres < 10_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres / 1000)} km`;
}

export function suggestDays(stop: MovingStop, days: readonly CandidateDay[], today: string): Suggestion {
  const candidates = days.map((day) => evaluate(stop, day, today));

  // Section 8, rule 1: days in a different city are dropped from the running
  // unless nothing else scores at all.
  const rankable = candidates.filter((c) => c.score < Infinity);
  const preferred = rankable.filter((c) => c.kind !== "other-city");
  const pool = preferred.length ? preferred : rankable;

  const best = pool.length
    ? pool.reduce((a, b) => (b.score < a.score ? b : a))
    : null;

  if (best) best.kind = "best";

  const rest = candidates.filter((c) => c !== best);
  rest.push(unplannedCandidate());

  return { best: best ? withDetail(best) : null, rest };
}

function evaluate(stop: MovingStop, day: CandidateDay, today: string): Candidate {
  // The artboard writes a day as "Sun Oct 4 · Fukuoka to Kagoshima". The hand
  // written place label wins; the city its stops are in stands in otherwise.
  const point = day.stops.find((s) => s.location)?.location || null;
  const where = locality(day.placeLabel ?? day.city, point);

  const base: Candidate = {
    dayId: day.id,
    label: where ? `${day.label} · ${where}` : day.label,
    placeLabel: where,
    hue: day.hue,
    kind: "ok",
    shape: where ? `${where} · ${dayShape(day)}` : dayShape(day),
    reason: "",
    detail: null,
    after: null,
    before: null,
    addedMetres: null,
    addedMinutes: null,
    score: Infinity,
  };

  if (day.date < today) {
    // A day that has already happened is not somewhere to plan.
    return { ...base, kind: "past", reason: "already past" };
  }
  if (day.id === stop.currentDayId) {
    return { ...base, kind: "current", reason: "where it is now" };
  }

  if (!stop.location) {
    // A stop with no pin cannot be ranked by distance, only chosen by hand.
    return { ...base, kind: day.stops.length ? "ok" : "empty", reason: dayShape(day), score: 1 };
  }

  const { added, after, before, afterStopId } = bestInsertion(day, stop.location);
  base.afterStopId = afterStopId;
  const addedMinutes = minutesFor(added);

  const differentCity =
    stop.city !== null && day.city !== null && !sameCity(stop.city, stop.location, day.city, point);

  if (differentCity) {
    const away = nearestMetres(day, stop.location) ?? added;
    return {
      ...base,
      kind: "other-city",
      reason: `different city · ${formatDistance(away)} away`,
      after,
      before,
      addedMetres: added,
      addedMinutes,
      score: added + 1_000_000,
    };
  }

  if (isTravelDay(day)) {
    return {
      ...base,
      kind: "travel",
      reason: `travel day · ${formatDistance(added)} detour`,
      after,
      before,
      addedMetres: added,
      addedMinutes,
      // Section 8, rule 3: a day already busy taking you somewhere is a poor
      // place to add a stop, so it is pushed down rather than dropped.
      score: added + 250_000,
    };
  }

  if (day.stops.length === 0) {
    return { ...base, kind: "empty", reason: "nothing planned yet", score: added + 50_000 };
  }

  const crowding = day.stops.length >= CROWDED ? 120_000 : 0;

  return {
    ...base,
    kind: "ok",
    reason: `${dayShape(day)} · ${formatDistance(added)} extra straight-line distance`,
    after,
    before,
    addedMetres: added,
    addedMinutes,
    score: added + crowding,
  };
}

/** The green card's sentence, which the artboard writes out in full. */
function withDetail(candidate: Candidate): Candidate {
  const parts: string[] = [];

  if (candidate.after && candidate.before) {
    parts.push(`Slots in after ${candidate.after} and before ${candidate.before}.`);
  } else if (candidate.after) {
    parts.push(`Slots in after ${candidate.after}.`);
  } else if (candidate.before) {
    parts.push(`Slots in before ${candidate.before}.`);
  } else {
    parts.push("Starts the day.");
  }

  if (candidate.addedMetres !== null) {
    parts.push(`${formatDistance(candidate.addedMetres)} extra straight-line distance. Check transport and travel time.`);
  }

  return { ...candidate, detail: parts.join(" ") };
}

function dayShape(day: CandidateDay): string {
  if (day.stops.length === 0) return "nothing planned yet";
  return `${day.stops.length} stop${day.stops.length === 1 ? "" : "s"}`;
}

function nearestMetres(day: CandidateDay, point: LatLng): number | null {
  const located = day.stops.filter((s) => s.location);
  if (!located.length) return null;
  return Math.min(...located.map((s) => haversineMetres(s.location as LatLng, point)));
}

/**
 * Minutes for a distance, through the same walking model the derived line
 * uses, so the two can never disagree about what 400 m costs. `walkMinutes`
 * takes two points, so the distance is turned back into a pair.
 */
function minutesFor(metres: number): number | null {
  if (metres <= 0) return null;
  return walkMinutes({ lat: 0, lng: 0 }, { lat: metres / 111_320, lng: 0 });
}

/** The bucket that is not a day, always last (PLAN.md section 9). */
function unplannedCandidate(): Candidate {
  return {
    dayId: null,
    label: "To be planned",
    placeLabel: null,
    hue: "#94897A",
    kind: "unplanned",
    shape: "",
    reason: "keep it on the map, no day",
    detail: null,
    after: null,
    before: null,
    addedMetres: null,
    addedMinutes: null,
    score: Infinity,
  };
}
