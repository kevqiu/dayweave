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

  it("defines everything the client uses", () => {
    for (const name of [
      "minutesOf", "formatClock", "formatFree", "planRows",
      "gridSpan", "gridY", "gridTime", "cardBox", "hourLines", "hourLabels",
    ]) {
      expect(typeof (browser as unknown as Record<string, unknown>)[name]).toBe("function");
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
});
