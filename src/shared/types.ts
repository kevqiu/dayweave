/**
 * The wire format between the Worker and the SPA. Kept in one place so a
 * rename cannot drift between the two halves. Mirrors db/migrations, but is
 * not the same shape: the API sends what a screen needs, which includes a few
 * derived things the database deliberately does not store (PLAN.md 4d).
 */

export type StopStatus = "planned" | "visited" | "skipped";
export type PlaceSource = "my_map" | "search" | "link";

export interface Member {
  userId: string;
  name: string;
  initials: string;
  /** From the people palette, which is deliberately off the day ramp. */
  color: string;
}

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string | null;
  category: string | null;
  source: PlaceSource;
}

export interface Stop {
  id: string;
  dayId: string | null;
  placeId: string | null;
  title: string;
  /** Typed by a person, never generated (PLAN.md 4c). */
  note: string;
  startTime: string | null;
  endTime: string | null;
  orderKey: string;
  status: StopStatus;
  createdBy: string;
  place: Place | null;
  /**
   * The small grey line: category, then walking time from the previous stop.
   * Derived on read, never stored, so it cannot go stale (PLAN.md 4c).
   */
  description: string;
}

export interface Day {
  id: string;
  date: string;
  label: string | null;
  placeLabel: string | null;
  /** Position on the green-to-yellow ramp (PLAN.md 7). */
  hue: string;
  stops: Stop[];
}

export interface TripSummary {
  id: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  /** Derived from the cities the stops are in. Absent until there are any. */
  cities: string[];
  members: Member[];
  stopCount: number;
  visitedCount: number;
  /** 1-based, or null when the trip is not running today. */
  currentDay: number | null;
  dayCount: number;
}

export interface Trip extends TripSummary {
  days: Day[];
  /** stops with day_id IS NULL — the To be planned sidebar (PLAN.md 9). */
  unplanned: Stop[];
}

export interface CreateTripBody {
  name: string;
  startDate: string;
  endDate: string;
}

export interface CreateStopBody {
  title: string;
  dayId?: string | null;
  startTime?: string | null;
  note?: string;
  /** Drop between these two, as order keys. Both optional. */
  after?: string | null;
  before?: string | null;
}

export interface UpdateStopBody {
  title?: string;
  note?: string;
  status?: StopStatus;
  startTime?: string | null;
  dayId?: string | null;
  after?: string | null;
  before?: string | null;
}

export interface ApiError {
  error: string;
}
