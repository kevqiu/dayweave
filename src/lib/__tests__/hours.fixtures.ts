import type { GooglePeriod } from "../hours.ts";

/** Example weeks, in the shape Places (New) returns them. */
const p = (day: number, open: string, closeDay: number, close: string): GooglePeriod => {
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  return { open: { day, hour: oh, minute: om }, close: { day: closeDay, hour: ch, minute: cm } };
};

/** Closed Mondays; lunch and dinner Tuesday to Friday; all day at the weekend. */
export const RAMEN: GooglePeriod[] = [
  p(0, "10:00", 0, "22:00"),
  ...[2, 3, 4, 5].flatMap((d) => [p(d, "11:00", d, "15:00"), p(d, "17:30", d, "22:00")]),
  p(6, "10:00", 6, "22:00"),
];

/** Open late on Friday only, into Saturday morning. */
export const BAR: GooglePeriod[] = [p(5, "18:00", 6, "02:00")];

/** Google's way of writing a place that never shuts. */
export const ALWAYS: GooglePeriod[] = [{ open: { day: 0, hour: 0, minute: 0 } }];
