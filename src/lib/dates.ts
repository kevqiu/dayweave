/**
 * Trip dates are plain `YYYY-MM-DD` strings, never Date objects, because a
 * trip's days belong to the place you are in rather than the browser's zone.
 * Parsing "2025-10-03" with `new Date` in UTC-7 gives you October 2nd.
 */

export function parseISODate(iso: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not an ISO date: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function isISODate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** Days since the epoch, which is all we need to compare and step dates. */
export function toDayNumber(iso: string): number {
  const { y, m, d } = parseISODate(iso);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** Inclusive, so a one-day trip is one day and not zero. */
export function datesBetween(startIso: string, endIso: string): string[] {
  const start = toDayNumber(startIso);
  const end = toDayNumber(endIso);
  const out: string[] = [];
  for (let n = start; n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

export function dayCount(startIso: string, endIso: string): number {
  return toDayNumber(endIso) - toDayNumber(startIso) + 1;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function monthShort(iso: string): string {
  return MONTHS[parseISODate(iso).m - 1]!;
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS[((toDayNumber(iso) % 7) + 11) % 7]!;
}

/** "Sep 30 – Oct 10", collapsing the month when both ends share it. */
export function formatRange(startIso: string, endIso: string): string {
  const a = parseISODate(startIso);
  const b = parseISODate(endIso);
  const left = `${monthShort(startIso)} ${a.d}`;
  return a.m === b.m && a.y === b.y ? `${left} – ${b.d}` : `${left} – ${monthShort(endIso)} ${b.d}`;
}

/** "Fri Oct 3", the day-header form. */
export function formatDayHeader(iso: string): string {
  const { d } = parseISODate(iso);
  return `${weekdayShort(iso)} ${monthShort(iso)} ${d}`;
}
