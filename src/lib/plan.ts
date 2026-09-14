/**
 * The Plan view's arithmetic, PLAN.md section 4f.
 *
 * `design/PlannerMobile.dc.html` draws the day as a clock and
 * `design/Planner.dc.html` draws the same day as a column on an hour grid.
 * They are one view at two densities, so both are measured here rather than
 * in the client, and both are tested.
 */

/** Minutes since midnight for `10:00`, or null for anything that is not one. */
export function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/** `13:15`. Tabular figures everywhere it is shown, so always two digits. */
export function formatClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * `2 h 15 free`, the dashed slot in `PlannerMobile.dc.html`. Under an hour it
 * reads `45 min free`, because "0 h 45" is not how anyone says it.
 */
export function formatFree(minutes: number): string {
  if (minutes < 60) return `${minutes} min free`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h free` : `${h} h ${m} free`;
}

export interface PlanStop {
  id: string;
  time: string;
  status: string;
}

export interface PlanRow {
  id: string;
  /** The pixel height of the row, which is also the height of its time cell. */
  height: number;
  /** The dashed slot's words, or null when the row has no gap worth offering. */
  free: string | null;
  /** Where the slot's plus would start the next thing, as `14:30`. */
  freeAt: string | null;
}

/** `PlannerMobile.dc.html`: the row height every stop starts at. */
export const ROW_HEIGHT = 46;
/** The dashed slot, 22px, and the 9px that separates it from the row above. */
export const FREE_SLOT = 31;
/**
 * A gap has to be worth planning into before the app offers to fill it. An
 * hour and a quarter is about the shortest gap where "go somewhere else"
 * is a real suggestion rather than noise between two courses.
 */
export const FREE_MIN_GAP = 75;

/**
 * The day as a clock: a row per stop, taller when it is holding open a gap.
 *
 * The artboard draws five rows at 46/62/46/74/46 against times two and a half
 * hours apart, which no single rule reproduces — the 62 in particular answers
 * to nothing else on the page. What the artboard does say unambiguously is
 * that the row with the largest following gap is the one carrying the dashed
 * slot, and that its height is the base row plus that slot. That is the rule
 * here: every row is `ROW_HEIGHT`, and a row grows by `FREE_SLOT` when the gap
 * after it is worth offering.
 *
 * A visited stop never grows one. The gap after it is in the past, and the
 * plus on the slot is an invitation to plan.
 */
export function planRows(stops: readonly PlanStop[]): PlanRow[] {
  return stops.map((stop, i) => {
    const start = minutesOf(stop.time);
    const next = stops[i + 1];
    const nextStart = next ? minutesOf(next.time) : null;
    const gap = start !== null && nextStart !== null ? nextStart - start : null;

    const offer =
      gap !== null && gap >= FREE_MIN_GAP && stop.status !== "visited";

    return {
      id: stop.id,
      height: offer ? ROW_HEIGHT + FREE_SLOT : ROW_HEIGHT,
      free: offer ? formatFree(gap as number) : null,
      // The plus starts the next thing where the last one is likely to end,
      // not the instant this one began.
      freeAt: offer ? formatClock((start as number) + 60) : null,
    };
  });
}

/* ---------------------------------------------------------------- the grid */

/** `Planner.dc.html` rules the hours 44px apart. Everything else follows. */
export const PX_PER_HOUR = 44;
export const PX_PER_MINUTE = PX_PER_HOUR / 60;

export interface GridSpan {
  /** Minutes since midnight at the top of the column. */
  from: number;
  /** Minutes since midnight at the bottom. */
  to: number;
  /** Its height in pixels. */
  height: number;
}

/**
 * The hours a column covers. `Planner.dc.html` rules 08:00 to 22:00, which is
 * the window a day of a trip actually happens in — but a 06:40 ferry has to
 * be somewhere, so the span opens up around whatever the day really holds.
 */
export function gridSpan(times: readonly (string | null)[]): GridSpan {
  let from = 8 * 60;
  let to = 23 * 60;
  for (const time of times) {
    const at = minutesOf(time);
    if (at === null) continue;
    if (at < from) from = Math.floor(at / 60) * 60;
    if (at + 60 > to) to = Math.min(24 * 60, Math.ceil((at + 60) / 60) * 60);
  }
  return { from, to, height: (to - from) * PX_PER_MINUTE };
}

/** Pixels from the top of the column for a time inside the span. */
export function gridY(span: GridSpan, minutes: number): number {
  // Multiply before dividing: 13.25 hours of PX_PER_MINUTE lands on
  // 230.99999999999997, and a card top is compared against in tests.
  return ((minutes - span.from) * span.height) / (span.to - span.from);
}

/**
 * The time a drop at `y` lands on, snapped to the quarter hour. A calendar
 * that lets you drop something at 14:07 is a calendar that makes you tidy up
 * after it.
 */
export function gridTime(span: GridSpan, y: number): number {
  const raw = span.from + (y * (span.to - span.from)) / span.height;
  const snapped = Math.round(raw / 15) * 15;
  return Math.min(span.to, Math.max(span.from, snapped));
}

export interface CardBox {
  top: number;
  height: number;
}

/**
 * Where a card sits and how tall it is.
 *
 * `Planner.dc.html`: a card with a second line is 38px, one without is 30px,
 * and a stop with an end time is drawn to its real length. Nothing shorter
 * than 30px, because two lines of 11.5px text do not fit in less.
 */
export function cardBox(
  span: GridSpan,
  start: string | null,
  end: string | null,
  hasSubtitle: boolean,
): CardBox | null {
  const from = minutesOf(start);
  if (from === null) return null;
  const until = minutesOf(end);
  const natural = hasSubtitle ? 38 : 30;
  const height =
    until !== null && until > from
      ? Math.max(natural, ((until - from) * span.height) / (span.to - span.from))
      : natural;
  return { top: gridY(span, from), height };
}

/** The hour lines in a span, as pixel offsets from its top. */
export function hourLines(span: GridSpan): number[] {
  const out: number[] = [];
  for (let m = span.from + 60; m < span.to; m += 60) out.push(gridY(span, m));
  return out;
}

/** The labelled hours: every second one, which is how the artboard rules it. */
export function hourLabels(span: GridSpan): { at: number; label: string }[] {
  const out: { at: number; label: string }[] = [];
  const firstEven = span.from % 120 === 0 ? span.from : span.from + 60;
  for (let m = firstEven; m <= span.to; m += 120) {
    out.push({ at: gridY(span, m), label: formatClock(m) });
  }
  return out;
}

/* ------------------------------------------------------------- the stays */

export interface LodgingStay {
  id: string;
  name: string;
  /** The first date the stay applies to, inclusive. */
  checkIn: string;
  /** The last date it applies to, inclusive. */
  checkOut: string;
}

export interface LodgingBar {
  id: string;
  name: string;
  /** Fraction across the strip of days, 0 at the first column's left edge. */
  left: number;
  /** Fraction of the strip's width. */
  width: number;
  /** The stay reaches back past the first day showing. */
  startsBefore: boolean;
  /** It carries on past the last one. */
  endsAfter: boolean;
}

/**
 * Where a stay sits on the Planner's lodging strip.
 *
 * `design/Planner.dc.html` writes the hotel's name into every column it
 * covers, so "The Blossom Hakata" is drawn three times in a row. That is what
 * a per-column strip can do, and it reads as three hotels at a glance. A stay
 * is one thing spanning days, so it is drawn as one bar spanning columns.
 *
 * The day you change hotels belongs to both of them, and the artboard has no
 * answer for that — it shows one name per cell and picks. So a day two stays
 * share is split down the middle: the one that started earlier keeps the left
 * half, the one starting that day takes the right. The seam is where the
 * change happens, which is the thing the row is being read for.
 *
 * Three stays on one day would have two of them sharing a half. That is a
 * trip nobody is planning, and inventing lanes for it would cost the strip
 * the height that makes it legible at all.
 */
export function lodgingBars(
  dates: readonly string[],
  stays: readonly LodgingStay[],
): LodgingBar[] {
  if (!dates.length) return [];
  const span = dates.length;

  // Earliest first, and by id where two start together, so the halves are
  // handed out the same way on every render and on every phone.
  const ordered = [...stays].sort(
    (a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.id < b.id ? -1 : 1),
  );
  const covers = (stay: LodgingStay, date: string) => stay.checkIn <= date && date <= stay.checkOut;

  const out: LodgingBar[] = [];
  for (const stay of ordered) {
    if (stay.checkOut < stay.checkIn) continue;

    let from = -1;
    let to = -1;
    for (let i = 0; i < span; i++) {
      if (!covers(stay, dates[i] as string)) continue;
      if (from === -1) from = i;
      to = i;
    }
    if (from === -1) continue;

    const sharing = (index: number) =>
      ordered.filter((other) => other.id !== stay.id && covers(other, dates[index] as string));

    const earlier = sharing(from).some(
      (other) => other.checkIn < stay.checkIn || (other.checkIn === stay.checkIn && other.id < stay.id),
    );
    const later = sharing(to).some(
      (other) => other.checkOut > stay.checkOut || (other.checkOut === stay.checkOut && other.id > stay.id),
    );

    const leftUnits = earlier ? from + 0.5 : from;
    const rightUnits = later ? to + 0.5 : to + 1;

    out.push({
      id: stay.id,
      name: stay.name,
      left: leftUnits / span,
      width: Math.max(0, rightUnits - leftUnits) / span,
      startsBefore: stay.checkIn < (dates[from] as string),
      endsAfter: stay.checkOut > (dates[to] as string),
    });
  }
  return out;
}

/** The stays covering one date, earliest first. What a phone shows for a day. */
export function staysOn(date: string, stays: readonly LodgingStay[]): LodgingStay[] {
  return stays
    .filter((s) => s.checkIn <= date && date <= s.checkOut)
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.id < b.id ? -1 : 1));
}
