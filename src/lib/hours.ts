/**
 * Opening hours, and whether a stop is somewhere at a time it is open.
 *
 * Google gives a place's regular hours as periods — open on a weekday at a
 * time, close on a weekday at a time, in the place's own local clock. A stop's
 * time is written in the same clock (it is the wall clock of the city the day
 * is in), so the two compare directly with no timezone arithmetic at all.
 *
 * What is stored is the periods cut at every midnight: seven lists of
 * `[start, end]` minutes, Sunday first, every piece inside its own day. That
 * is the shape every question here wants — "is it open at 10:00 on Friday" is
 * one lookup — and it is small enough to ride on every stop to the browser,
 * which has to answer the same questions again after a drag without a round
 * trip. `src/worker/ui/hours-client.ts` is that browser copy, and
 * `hours-client.test.ts` holds the two to each other.
 *
 * These are *regular* hours. Google only publishes the special hours of a
 * public holiday for the coming week, and a trip is usually further out than
 * that, so a holiday closure is something this cannot see.
 */

export type Piece = [number, number];
/** Seven days, Sunday first, each a sorted list of open pieces within 0..1440. */
export type Week = Piece[][];

/** One end of a period, as Places (New) writes it. `day` is 0 for Sunday. */
export interface GooglePoint {
  day?: number;
  hour?: number;
  minute?: number;
}

export interface GooglePeriod {
  open?: GooglePoint;
  /** Absent when the place never closes. */
  close?: GooglePoint;
}

const DAY = 1440;
const WEEK = 7 * DAY;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const at = (p: GooglePoint) => (p.day ?? 0) * DAY + (p.hour ?? 0) * 60 + (p.minute ?? 0);

/**
 * Google's periods, cut at midnight into the stored shape.
 *
 * Null when Google gave no periods, which is a place with no hours to speak of
 * — a park, a street, a viewpoint — and is not the same as a place that is
 * always closed. A period with no close is a place that never shuts; Google
 * writes that as a single period opening at midnight on Sunday.
 */
export function weekFromPeriods(periods: readonly GooglePeriod[] | null | undefined): Week | null {
  if (!periods || periods.length === 0) return null;

  const week: Week = [[], [], [], [], [], [], []];
  let any = false;

  for (const period of periods) {
    if (!period.open || typeof period.open.day !== "number") continue;
    const start = at(period.open);
    let end = period.close && typeof period.close.day === "number" ? at(period.close) : start + WEEK;
    // A close that reads earlier in the week than its open is next week's.
    while (end <= start) end += WEEK;
    end = Math.min(end, start + WEEK);

    for (let t = start; t < end; ) {
      const dayStart = Math.floor(t / DAY) * DAY;
      const pieceEnd = Math.min(end, dayStart + DAY);
      const weekday = Math.floor(t / DAY) % 7;
      (week[weekday] as Piece[]).push([t - dayStart, pieceEnd - dayStart]);
      any = true;
      t = pieceEnd;
    }
  }

  return any ? week.map(merge) : null;
}

function merge(pieces: Piece[]): Piece[] {
  const sorted = [...pieces].sort((a, b) => a[0] - b[0]);
  const out: Piece[] = [];
  for (const piece of sorted) {
    const last = out[out.length - 1];
    if (last && piece[0] <= last[1]) last[1] = Math.max(last[1], piece[1]);
    else out.push([piece[0], piece[1]]);
  }
  return out;
}

/** 0 for Sunday. Noon, so no timezone can tip an ISO date into its neighbour. */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

function clock(minutes: number): string {
  const m = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function minutes(time: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h > 23 || mm > 59 ? null : h * 60 + mm;
}

/**
 * The sessions that belong to a day: every piece that starts on it, with the
 * end carried over midnight when the place stays open into the next day.
 *
 * A piece at 00:00 that is the tail of last night is last night's, the way a
 * bar that shuts at 02:00 on Saturday morning is a Friday bar. It still counts
 * for being open — somebody there at 01:00 on Saturday is somewhere open — but
 * it is not one of Saturday's sessions, and Saturday is not described by it.
 */
function sessions(week: Week, weekday: number): Piece[] {
  const today = week[weekday] ?? [];
  const yesterday = week[(weekday + 6) % 7] ?? [];
  const tomorrow = week[(weekday + 1) % 7] ?? [];
  const carried = yesterday.length > 0 && (yesterday[yesterday.length - 1] as Piece)[1] === DAY;

  return today
    .filter((piece, i) => !(i === 0 && piece[0] === 0 && carried && !(piece[1] === DAY && today.length === 1)))
    .map((piece): Piece => {
      const next = tomorrow[0];
      if (piece[1] === DAY && next && next[0] === 0 && next[1] < DAY) return [piece[0], DAY + next[1]];
      return [piece[0], piece[1]];
    });
}

/** `11:00 – 15:00, 17:30 – 22:00`, `Closed`, or `Open 24 hours`. */
export function dayLabel(week: Week, weekday: number): string {
  const today = week[weekday] ?? [];
  if (today.length === 1 && (today[0] as Piece)[0] === 0 && (today[0] as Piece)[1] === DAY) return "Open 24 hours";
  const own = sessions(week, weekday);
  if (own.length === 0) return "Closed";
  return own.map(([a, b]) => `${clock(a)} – ${clock(b)}`).join(", ");
}

export interface HoursCheck {
  weekday: number;
  /** `Friday`. */
  dayName: string;
  /** What the day's hours are, in words. */
  label: string;
  /** The day's open pieces within 0..1440, for the bar. */
  open: Piece[];
  /** Nothing opens this day. */
  closed: boolean;
  /** False is a stop somewhere shut: flag it. */
  ok: boolean;
  /** The flag's words: `opens 11:00`, `closed after 22:00`, `closed Mondays`. */
  note: string | null;
  /** A time on the same day it is open, for the one-tap fix. `11:00`. */
  fix: string | null;
}

/**
 * Whether a place is open for a stop on a date at a time.
 *
 * Null when there is nothing to check against: no hours, or no date (the To be
 * planned bucket). A stop with no time is only flagged when the place is shut
 * all day, because that is wrong whatever time it ends up with.
 */
export function checkHours(week: Week | null | undefined, isoDate: string | null | undefined, time: string | null | undefined): HoursCheck | null {
  if (!week || !isoDate) return null;
  const weekday = weekdayOf(isoDate);
  const dayName = WEEKDAYS[weekday] as string;
  const pieces = week[weekday] ?? [];
  const own = sessions(week, weekday);
  const label = dayLabel(week, weekday);
  const m = minutes(time);
  const openNow = m !== null && pieces.some(([a, b]) => a <= m && m < b);
  const base = { weekday, dayName, label, open: pieces.map((p): Piece => [p[0], p[1]]), fix: null };

  if (own.length === 0 && label !== "Open 24 hours") {
    if (openNow) return { ...base, closed: true, ok: true, note: null };
    return { ...base, closed: true, ok: false, note: `closed ${dayName}s` };
  }
  if (m === null || openNow) return { ...base, closed: false, ok: true, note: null };

  const later = own.find(([a]) => a > m);
  if (later) return { ...base, closed: false, ok: false, note: `opens ${clock(later[0])}`, fix: clock(later[0]) };
  const last = own[own.length - 1] as Piece;
  return { ...base, closed: false, ok: false, note: `closed after ${clock(last[1])}`, fix: clock(last[0]) };
}

export interface DayOption {
  id: string;
  date: string;
  city: string | null;
}

export interface OpenDay {
  dayId: string;
  date: string;
  /** Set when the stop has to move to the opening as well as to the day. */
  time: string | null;
}

/**
 * The nearest day of the trip a place is open, for a stop that sits on a day
 * it is shut.
 *
 * Only days still ahead, and only in the same city when both sides know their
 * city — a closed ramen shop in Fukuoka is not fixed by a Tuesday in
 * Kagoshima. It first looks for a day open at the stop's own time, so the move
 * changes one thing; failing that, the nearest day open at all, with the time
 * moved to its first opening. Ties go to the earlier day.
 */
export function nearestOpenDay(
  week: Week | null | undefined,
  days: readonly DayOption[],
  current: { dayId: string | null; city: string | null },
  time: string | null | undefined,
  today: string,
): OpenDay | null {
  if (!week) return null;
  const from = days.find((d) => d.id === current.dayId);
  const origin = from ? Date.parse(`${from.date}T12:00:00Z`) : Date.parse(`${today}T12:00:00Z`);
  const same = (city: string | null) =>
    !city || !current.city || city.trim().toLowerCase() === current.city.trim().toLowerCase();

  const pool = days
    .filter((d) => d.id !== current.dayId && d.date >= today && same(d.city))
    .map((d) => ({ day: d, distance: Math.abs(Date.parse(`${d.date}T12:00:00Z`) - origin) }))
    .sort((a, b) => a.distance - b.distance || (a.day.date < b.day.date ? -1 : 1));

  if (minutes(time) !== null) {
    const exact = pool.find(({ day }) => checkHours(week, day.date, time)?.ok);
    if (exact) return { dayId: exact.day.id, date: exact.day.date, time: null };
  }
  for (const { day } of pool) {
    const own = sessions(week, weekdayOf(day.date));
    if (own.length === 0) continue;
    return { dayId: day.id, date: day.date, time: minutes(time) === null ? null : clock((own[0] as Piece)[0]) };
  }
  return null;
}
