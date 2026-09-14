/**
 * Design tokens, copied out of `design/*.dc.html`.
 *
 * The artboards are the specification (see CLAUDE.md), so every value here is
 * transcribed rather than chosen. If one of these looks wrong, the artboard is
 * what to check, and the artboard wins.
 */

export const COLOR = {
  brand: "#B78B26",
  brandLight: "#E8C45B",
  brandWash: "#FBF1CF",
  brandButton: "#F5DE91",
  brandSolid: "#D5AB38",
  brandInk: "#514936",
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
  link: "#514936",

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

  /**
   * The warm attention card: the pending invite at the top of
   * `design/Trips.dc.html`, and the day header a drag is hovering over. Not an
   * error and not a success — something is waiting for you.
   */
  noticeBg: "#FCF6E6",
  noticeBorder: "#DCC58A",
  noticeInk: "#97803F",

  /** The bucket that is not a day. */
  unplanned: "#94897A",
} as const;

/** The day palette follows red, orange, yellow, green, blue, indigo, violet. */
export const DAY_PALETTE = [
  "#E53935",
  "#EF6C00",
  "#D4A000",
  "#239447",
  "#1976D2",
  "#4936B5",
  "#963DB8",
] as const;

/** A dark neutral swatch with room for a white label and perimeter. */
export const DAY_BLACK = "#202124";

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
 * The first seven come out of the palette in order. Past that a trip is long
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
  return hslHex(hue, 0.7, 0.43);
}

/**
 * Avatar colours, in the order the artboards hand them out: the owner is
 * terracotta, then blue, violet, mauve.
 *
 * On a trip they are dealt in that order, by when each person joined — see
 * `peopleOfTrip` in `store.ts`. That is what the artboards draw, and it is
 * also the only way two people are certain to be different circles.
 */
export const AVATAR_COLORS = ["#C4826A", "#6E8CA8", "#8A83AE", "#A87A93"] as const;

/**
 * A colour for somebody who is not being shown as part of a trip — the avatar
 * for yourself in the Trips bar, and anyone whose membership is not to hand.
 * Stable per person, and it can collide, which is why it is not what a trip
 * uses.
 */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] as string;
}

/**
 * A circle for somebody on a trip you are not on yet.
 *
 * `design/Trips.dc.html` draws your own avatar in the bar as terracotta always
 * — `.me-avatar` is the accent, not a dealt colour — and draws the inviter on
 * the pending card as `#6E8CA8`. That is not where Mika sits on her own trip;
 * on her trip she is first, which is terracotta. It is that terracotta is
 * already taken on this screen, by you, and two people in one 32px circle each
 * is exactly what the dealt colours exist to prevent.
 *
 * So the card deals from the palette with the accent skipped, and a second
 * inviter is still a different circle from the first.
 */
export function guestAvatarColor(index: number): string {
  const rest = AVATAR_COLORS.slice(1);
  return rest[((index % rest.length) + rest.length) % rest.length] as string;
}

/** Every phone artboard is this size, and clips. */
export const FRAME = { width: 375, height: 667 } as const;

export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Figtree:wght@400;500;600;700&display=swap";

/** Newsreader for names and titles, Figtree for everything else. */
export const SERIF = 'Fraunces, Georgia, serif';
export const SANS = 'Figtree, "Helvetica Neue", sans-serif';
