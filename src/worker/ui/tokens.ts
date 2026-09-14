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
 * The day palette, PLAN.md section 7: a colour per day, so a pin's hue says
 * which day it belongs to.
 *
 * This used to be a green-to-yellow ramp interpolated out of the four days
 * `design/Main.dc.html` pins exactly. A ramp encodes a sequence, which is what
 * section 7 asked for, but it only has one usable axis: past about day six the
 * steps between neighbouring days are smaller than the eye separates, and on a
 * three-week trip half the map is the same olive. A day is now a thing a
 * person names and colours (see `dayColor` and the day's own pencil), so the
 * eight below are handed out in order and are as far apart on the wheel as
 * the palette allows, while staying in its register — nothing here is more
 * saturated than the terracotta accent already on the screen.
 *
 * `#3F6B4A` is still first, because it is the green every artboard draws on
 * day one and on the today pin.
 */
export const DAY_PALETTE = [
  "#3F6B4A",
  "#2F7D86",
  "#3F6BA6",
  "#6A5FA6",
  "#9C5E8E",
  "#C4826A",
  "#C0913C",
  "#7E8C42",
] as const;

/** White, the ninth swatch: a day deliberately left uncoloured. */
export const DAY_WHITE = "#FFFFFF";

const hslHex = (h: number, s: number, l: number): string => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`.toUpperCase();
};

/**
 * The colour day `index` is born with.
 *
 * The first eight come out of the palette in order. Past that a trip is long
 * enough that no fixed list would cover it, so the hue is stepped by the
 * golden angle — which is the standard way of picking colours that keep
 * landing far from the ones already used rather than clumping, and is stable
 * per index so the server and the browser never disagree about day twelve.
 * Saturation and lightness are held at the palette's own, so a generated
 * colour sits beside a chosen one without looking louder.
 */
export function dayColor(index: number): string {
  const at = Math.max(0, Math.floor(index));
  if (at < DAY_PALETTE.length) return DAY_PALETTE[at] as string;
  const hue = (152 + (at - DAY_PALETTE.length + 1) * 137.508) % 360;
  return hslHex(hue, 0.36, 0.45);
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
