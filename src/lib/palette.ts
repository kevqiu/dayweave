/**
 * The palette from PLAN.md section 7, in one place so the Worker (which picks
 * a day's hue at trip creation) and the SPA agree on it.
 */

/**
 * Day 1 is a deep green and the last day a pale yellow. A trip is a sequence,
 * so the hues encode one: further along means further away in time.
 */
export const DAY_RAMP = [
  "#3F6B4A", "#57794C", "#70864D", "#8C8C4C", "#AD8A49", "#CE8845",
  "#D79C4D", "#E0B054", "#E6C168", "#EBCE87", "#F0DCA6",
] as const;

/** Deliberately outside the day ramp, so an avatar never reads as a day. */
export const PEOPLE = ["#C4826A", "#6E8CA8", "#8A83AE", "#A87A93"] as const;

/**
 * Spreads `count` days across the ramp, so a 4-day trip still runs green to
 * yellow rather than stopping a third of the way along.
 */
export function dayHue(index: number, count: number): string {
  if (count <= 1) return DAY_RAMP[0];
  const at = Math.round((index / (count - 1)) * (DAY_RAMP.length - 1));
  return DAY_RAMP[Math.min(Math.max(at, 0), DAY_RAMP.length - 1)]!;
}

/** Stable per person, so someone keeps their colour across screens. */
export function personColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return PEOPLE[Math.abs(hash) % PEOPLE.length]!;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
