/**
 * Design tokens, copied out of `design/*.dc.html`.
 *
 * The artboards are the specification (see CLAUDE.md), so every value here is
 * transcribed rather than chosen. If one of these looks wrong, the artboard is
 * what to check, and the artboard wins.
 */

export const COLOR = {
  /** Page ground, on every phone artboard. */
  paper: "#FBF6EE",
  /** A raised card or a field sitting on the paper. */
  card: "#FFFCF6",
  /** A selected row, an open day header, the "on trip" row. */
  highlight: "#F6EFE2",
  /** The map ground and the muted tiles behind an icon. */
  map: "#EFE8DB",
  mapFill: "#F0E9DC",

  ink: "#33302B",
  inkSoft: "#6B645B",
  grey: "#9A9184",
  greyer: "#A8A093",
  meta: "#A0978A",
  faint: "#B9AFA0",

  line: "#F1E9DA",
  border: "#E9DFCE",
  borderWarm: "#E4D9C5",
  sheetEdge: "#EFE6D6",

  /** Terracotta: the caret, the owner avatar, the bias circle. */
  accent: "#C4826A",
  /** Link text. */
  link: "#A8663C",

  /** Status, PLAN.md section 7. Pin fill carries status and nothing else. */
  today: "#6F9A6B",
  ahead: "#E0B355",
  done: "#BDB4A7",
  todayRing: "#E4EEE1",
  aheadRing: "#F8EECF",
  doneRing: "#EFE9DF",

  todayInk: "#4E7A4B",
  aheadInk: "#96752F",

  /** The tile behind a food icon in the search list, and its stroke. */
  greenTile: "#E4EEE1",
  greenStroke: "#4E7A4B",
  yellowTile: "#F8EECF",
  yellowStroke: "#96752F",
  greyTile: "#F0E9DC",
  greyStroke: "#A59C90",

  /** The bucket that is not a day. */
  unplanned: "#94897A",
} as const;

/**
 * The day ramp, PLAN.md section 7: a sequence encoded as a sequence, so
 * further down the ramp reads as further away in time.
 *
 * `design/Main.dc.html` fixes the first four days of an eleven-day trip
 * exactly, and those four are transcribed. No artboard draws a trip's later
 * days, so the tail is interpolated on to a pale yellow, which is what the
 * plan describes and what `#E6D5A8` in the Planner looks like.
 */
const RAMP: readonly { at: number; hex: string }[] = [
  { at: 0.0, hex: "#3F6B4A" },
  { at: 0.1, hex: "#57794C" },
  { at: 0.2, hex: "#70864D" },
  { at: 0.3, hex: "#8C8C4C" },
  { at: 0.55, hex: "#B29A52" },
  { at: 0.8, hex: "#D2B768" },
  { at: 1.0, hex: "#E6D5A8" },
];

type Rgb = [number, number, number];

const rgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const FIRST = RAMP[0] as { at: number; hex: string };
const LAST = RAMP[RAMP.length - 1] as { at: number; hex: string };

/** The hue for day `index` of `total`. Day one is the deep green. */
export function dayHue(index: number, total: number): string {
  const t = total <= 1 ? 0 : Math.min(1, Math.max(0, index / (total - 1)));

  let lower = FIRST;
  let upper = LAST;
  for (let i = 0; i < RAMP.length - 1; i++) {
    const a = RAMP[i] as { at: number; hex: string };
    const b = RAMP[i + 1] as { at: number; hex: string };
    if (t >= a.at && t <= b.at) {
      lower = a;
      upper = b;
      break;
    }
  }

  const span = upper.at - lower.at;
  const k = span === 0 ? 0 : (t - lower.at) / span;
  const a = rgb(lower.hex);
  const b = rgb(upper.hex);
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${hex(a[0] + (b[0] - a[0]) * k)}${hex(a[1] + (b[1] - a[1]) * k)}${hex(
    a[2] + (b[2] - a[2]) * k,
  )}`;
}

/**
 * Avatar colours, in the order the artboards hand them out: the owner is
 * terracotta, then blue, violet, mauve.
 */
export const AVATAR_COLORS = ["#C4826A", "#6E8CA8", "#8A83AE", "#A87A93"] as const;

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] as string;
}

/** Every phone artboard is this size, and clips. */
export const FRAME = { width: 375, height: 667 } as const;

export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Figtree:wght@400;500;600;700&display=swap";

/** Newsreader for names and titles, Figtree for everything else. */
export const SERIF = 'Newsreader, Georgia, serif';
export const SANS = 'Figtree, "Helvetica Neue", sans-serif';
