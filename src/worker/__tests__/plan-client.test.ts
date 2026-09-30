import { describe, expect, it } from "vitest";
import { PLAN_CLIENT } from "../ui/plan-client.ts";
import * as plan from "../../lib/plan.ts";

/**
 * The browser copy of the Plan view's arithmetic has to say exactly what
 * `src/lib/plan.ts` says. There is no bundler between them, so this runs the
 * script and compares the two on a table of inputs: the day the artboard
 * draws, an early ferry, a late dinner, and the edges of the grid.
 */
function loadBrowserCopy() {
  const w: { __PLAN__?: Record<string, (...args: never[]) => unknown> } = {};
  new Function("window", PLAN_CLIENT)(w);
  return w.__PLAN__ as unknown as typeof plan;
}

describe("the browser copy of the plan arithmetic", () => {
  const browser = loadBrowserCopy();

  it("keeps times and duration aligned when a tall desktop stretches the hours", () => {
    const span = { from: 480, to: 1440, height: 960 };
    for (const implementation of [plan, browser]) {
      expect(implementation.gridY(span, 720)).toBe(240);
      expect(implementation.gridTime(span, 240)).toBe(720);
      expect(implementation.cardBox(span, "12:00", "13:00", true)).toEqual({ top: 240, height: 60 });
    }
  });

  it("defines everything the client uses", () => {
    for (const name of [
      "minutesOf", "formatClock", "formatFree", "planRows",
      "gridSpan", "gridY", "gridTime", "cardBox", "hourLines", "hourLabels",
      "lodgingBars", "staysOn", "timeBetween",
    ]) {
      expect(typeof (browser as unknown as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("puts a stop dropped between two times about halfway, the same way", () => {
    const table: [number, number, number][] = [
      [540, 660, 600],   // 09:00 and 11:00: 10:00
      [540, 600, 570],   // 09:00 and 10:00: 09:30
      [600, 630, 615],   // 10:00 and 10:30: 10:15
      [600, 620, 615],   // 10:00 and 10:20: the quarter between them
      [605, 625, 615],   // 10:05 and 10:25: 10:15
      [610, 620, 615],   // 10:10 and 10:20: 10:15
      [616, 628, 620],   // no quarter strictly between: five minutes
      [600, 610, 605],   // 10:00 and 10:10: 10:05
      [600, 604, 602],   // nothing on five minutes between: the middle
      [720, 720, 720],   // the same time twice: that time
      [660, 540, 600],   // either way round
    ];
    for (const [a, b, want] of table) {
      expect(plan.timeBetween(a, b)).toBe(want);
      expect(browser.timeBetween(a, b)).toBe(want);
    }
  });

  it("reads and writes clocks the same way", () => {
    for (const t of ["10:00", "13:15", "00:00", "9:05", "", "nope", "24:10"]) {
      expect(browser.minutesOf(t)).toEqual(plan.minutesOf(t));
    }
    for (const m of [0, 65, 545, 795, 1439]) {
      expect(browser.formatClock(m)).toBe(plan.formatClock(m));
      expect(browser.formatFree(m)).toBe(plan.formatFree(m));
    }
  });

  it("lays out the same rows", () => {
    const day = [
      { id: "a", time: "10:00", status: "visited" },
      { id: "b", time: "12:30", status: "planned" },
      { id: "c", time: "13:15", status: "planned" },
      { id: "d", time: "16:00", status: "planned" },
      { id: "e", time: "", status: "planned" },
    ];
    expect(browser.planRows(day)).toEqual(plan.planRows(day));
  });

  it("rules the same grid", () => {
    for (const times of [["10:00", "19:30"], ["06:40"], ["23:30"], [], [null, ""]]) {
      const span = plan.gridSpan(times);
      expect(browser.gridSpan(times)).toEqual(span);
      expect(browser.hourLines(span)).toEqual(plan.hourLines(span));
      expect(browser.hourLabels(span)).toEqual(plan.hourLabels(span));
      for (const y of [-20, 0, 137, 231, 9000]) {
        expect(browser.gridTime(span, y)).toBe(plan.gridTime(span, y));
      }
      for (const box of [["10:00", null], ["16:00", "17:30"], [null, null]] as const) {
        expect(browser.cardBox(span, box[0], box[1], true))
          .toEqual(plan.cardBox(span, box[0], box[1], true));
      }
    }
  });

  it("puts the stays in the same places", () => {
    const dates = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];
    const stays = [
      { id: "a", name: "Blossom", checkIn: "2026-09-28", checkOut: "2026-10-01" },
      { id: "b", name: "Ryokan", checkIn: "2026-10-01", checkOut: "2026-10-03" },
      { id: "c", name: "Elsewhere", checkIn: "2026-11-01", checkOut: "2026-11-03" },
    ];
    expect(browser.lodgingBars(dates, stays)).toEqual(plan.lodgingBars(dates, stays));
    for (const date of [...dates, "2026-11-02"]) {
      expect(browser.staysOn(date, stays)).toEqual(plan.staysOn(date, stays));
    }
  });
});
