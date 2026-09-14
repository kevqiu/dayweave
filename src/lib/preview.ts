/**
 * The nodes on a trip card's map strip, `design/Trips.dc.html`.
 *
 * The card rules 62px of drawn map across its top and drops a pin on it per
 * day, coloured by that day's status. The artboard draws four of them for an
 * eleven-day trip because it draws one specific card; what it specifies is the
 * shape — a node a day, all of them inside the strip.
 *
 * A day's node is the centroid of the day's stops, which is where that day
 * actually happens. A day with nothing located on it has no node, because a
 * node in the middle of the strip would be a guess about where a day nobody
 * has planned yet is going to be.
 *
 * The arithmetic is here, and the trips endpoint hands the client finished
 * percentages, so nothing in the browser reasons about coordinates.
 */

import { centroid, type LatLng } from "./geo.ts";

/** A day as the strip sees it: its date, and wherever its stops are. */
export interface PreviewDay {
  date: string;
  stops: readonly LatLng[];
}

/** PLAN.md section 7's three, named as the client's `STATUS_FILL` names them. */
export type PreviewStatus = "done" | "now" | "ahead";

export interface PreviewNode {
  date: string;
  /** Percent across the strip, of the node's centre. */
  x: number;
  /** Percent down it. */
  y: number;
  status: PreviewStatus;
}

/** The strip on a 375px phone, and the node the artboard draws on it. */
const STRIP = { width: 345, height: 62 } as const;
const NODE = 15;

/** Half a node and a pixel, so the strip never clips one. */
const MARGIN = NODE / 2 + 1;

/**
 * The fit lands inside this, a good deal further in than the clip margin, so
 * that easing a cluster apart has somewhere to grow. Without the room, a city
 * at the edge of the trip is drawn as a row of nodes pressed against the side
 * of the strip.
 */
const INSET = { x: 26, y: 15 } as const;

/**
 * The corner the `DAY 3 OF 11` chip holds: 77px of label 12px in from the
 * right, ending 28px down. A little wider here than it measures, because
 * `DAY 10 OF 14` is a longer word than the artboard's.
 *
 * A node that lands under it is pushed out rather than drawn beneath it: the
 * chip is nearly opaque, and a day hidden behind a label is a day this strip
 * failed to preview.
 */
const CHIP = { width: 96, height: 28 } as const;

/**
 * Centres this close read as one node, so days are eased apart until they are
 * at least this far from each other. Two pixels of ground between two rings.
 *
 * Days in one city really are in one place and the honest drawing of them is a
 * heap — but a heap is a preview of one day, not of six, and the card's whole
 * job is to say how many there are and how they are going.
 */
const GAP = 17;

/**
 * The smallest span the fit will stretch, about 2 km.
 *
 * Days in one neighbourhood differ by a few hundred metres, and magnifying
 * that to the width of the strip would draw a walk around a park as a trip
 * across a region. Below the floor the days stay in a cluster in the middle,
 * which is the truth about them, and the easing above gives them their gap.
 */
const MIN_SPAN_DEG = 0.02;

/** One node per day that has somewhere to be, fitted so all of them show. */
export function previewNodes(
  days: readonly PreviewDay[],
  today: string,
): PreviewNode[] {
  const located: { date: string; point: LatLng }[] = [];
  for (const day of days) {
    const point = centroid(day.stops);
    if (point) located.push({ date: day.date, point });
  }
  if (located.length === 0) return [];

  const across = axis(located.map((d) => d.point.lng), INSET.x, STRIP.width - INSET.x);
  // North is up, so latitude runs from the foot of the strip to its head.
  const down = axis(located.map((d) => d.point.lat), STRIP.height - INSET.y, INSET.y);

  const placed = located.map((day) => settle({ x: across(day.point.lng), y: down(day.point.lat) }));
  ease(placed);

  return located.map((day, i) => {
    const at = placed[i] as Point;
    return {
      date: day.date,
      x: percent(at.x / STRIP.width),
      y: percent(at.y / STRIP.height),
      status: statusOfDay(day.date, today),
    };
  });
}

/**
 * A day's status is its date against today's: the ramp PLAN.md section 7 uses
 * for pins. A stop being ticked off does not enter into it — that is a stop's
 * status, and the strip is drawing days.
 */
export function statusOfDay(date: string, today: string): PreviewStatus {
  if (date < today) return "done";
  if (date === today) return "now";
  return "ahead";
}

interface Point {
  x: number;
  y: number;
}

/**
 * Maps a set of coordinates on to one edge of the strip.
 *
 * Fitted about the middle rather than from the low end, so that a set narrower
 * than the floor comes out centred instead of heaped against the left.
 */
function axis(values: readonly number[], from: number, to: number): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const middle = (min + max) / 2;
  const half = Math.max(max - min, MIN_SPAN_DEG) / 2;

  return (v) => from + ((v - (middle - half)) / (half * 2)) * (to - from);
}

/**
 * Eases nodes apart until each of them can be seen, a few pixels at a time.
 *
 * Every pass pushes each too-close pair along the line between them and puts
 * the result back inside the strip, so a cluster opens into a constellation
 * that still sits where the cluster was. Days that landed on exactly the same
 * spot have no line between them, and are sent off at the golden angle so that
 * a week in one city opens as a ring rather than a stack.
 */
function ease(points: Point[]): void {
  const GOLDEN = 2.399963;

  for (let pass = 0; pass < 40; pass++) {
    let moved = false;

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i] as Point;
        const b = points[j] as Point;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= GAP) continue;

        if (distance === 0) {
          dx = Math.cos(j * GOLDEN);
          dy = Math.sin(j * GOLDEN);
          distance = 1;
        }
        const push = (GAP - distance) / 2 / distance;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        moved = true;
      }
    }

    for (let i = 0; i < points.length; i++) points[i] = settle(points[i] as Point);
    if (!moved) return;
  }
}

/** Inside the strip, and out from under the day chip. */
function settle(point: Point): Point {
  const x = clamp(point.x, MARGIN, STRIP.width - MARGIN);
  const y = clamp(point.y, MARGIN, STRIP.height - MARGIN);

  const left = STRIP.width - CHIP.width - NODE / 2;
  const below = CHIP.height + NODE / 2;
  if (x <= left || y >= below) return { x, y };

  // Out the near side: down the strip, or back along it, whichever is less of
  // a lie about where the day is.
  return below - y <= x - left ? { x, y: below } : { x: left, y };
}

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

const percent = (fraction: number) => Math.round(fraction * 1000) / 10;
