import { describe, expect, it } from "vitest";
import { HOURS_CLIENT } from "../ui/hours-client.ts";
import * as hours from "../../lib/hours.ts";
import { ALWAYS, BAR, RAMEN } from "../../lib/__tests__/hours.fixtures.ts";

/**
 * The browser copy of the opening-hours rules has to say exactly what
 * `src/lib/hours.ts` says, because it is what the screen uses after every
 * optimistic drag and move. There is no bundler between them, so this runs the
 * script and compares the two across a table of weeks, dates and times.
 */
function loadBrowserCopy() {
  const w: { __HOURS__?: unknown } = {};
  new Function("window", HOURS_CLIENT)(w);
  return w.__HOURS__ as typeof hours;
}

describe("the browser copy of the hours rules", () => {
  const browser = loadBrowserCopy();
  const weeks = [RAMEN, BAR, ALWAYS].map((periods) => hours.weekFromPeriods(periods));
  const dates = ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", null];
  const times = ["00:30", "01:00", "09:59", "10:00", "11:00", "15:00", "16:00", "17:30", "23:00", "", null, "nope"];

  it("agrees on every check", () => {
    for (const week of [...weeks, null]) {
      for (const date of dates) {
        for (const time of times) {
          expect(browser.checkHours(week, date, time)).toEqual(hours.checkHours(week, date, time));
        }
      }
    }
  });

  it("agrees on the nearest open day", () => {
    const days = [
      { id: "a", date: "2026-10-01", city: "Fukuoka" },
      { id: "b", date: "2026-10-03", city: "fukuoka" },
      { id: "c", date: "2026-10-04", city: null },
      { id: "d", date: "2026-10-05", city: "Fukuoka" },
      { id: "e", date: "2026-10-06", city: "Kagoshima" },
    ];
    for (const week of [...weeks, null]) {
      for (const current of [{ dayId: "d", city: "Fukuoka" }, { dayId: "a", city: null }, { dayId: null, city: "Fukuoka" }]) {
        for (const time of ["10:00", "09:00", "23:30", null]) {
          for (const today of ["2026-09-23", "2026-10-04"]) {
            expect(browser.nearestOpenDay(week, days, current, time, today))
              .toEqual(hours.nearestOpenDay(week, days, current, time, today));
          }
        }
      }
    }
  });
});
