import { describe, expect, it } from "vitest";
import {
  addDays, datesBetween, dayCount, formatDayHeader, formatRange,
  fromDayNumber, isISODate, toDayNumber, weekdayShort,
} from "../dates.ts";

describe("trip dates", () => {
  it("does not shift a date into the previous day", () => {
    // The whole reason these are strings: `new Date("2025-10-03")` is UTC
    // midnight, which is October 2nd for anyone west of Greenwich.
    expect(fromDayNumber(toDayNumber("2025-10-03"))).toBe("2025-10-03");
  });

  it("counts an inclusive range", () => {
    expect(dayCount("2025-09-30", "2025-10-10")).toBe(11);
    expect(dayCount("2025-09-30", "2025-09-30")).toBe(1);
  });

  it("lists every date in the range, ends included", () => {
    const dates = datesBetween("2025-09-30", "2025-10-02");
    expect(dates).toEqual(["2025-09-30", "2025-10-01", "2025-10-02"]);
  });

  it("steps across a month and a year boundary", () => {
    expect(addDays("2025-09-30", 1)).toBe("2025-10-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("knows the weekday", () => {
    expect(weekdayShort("1970-01-01")).toBe("Thu");
    expect(weekdayShort("2025-10-03")).toBe("Fri");
  });

  it("collapses the month when a range stays inside one", () => {
    expect(formatRange("2026-04-11", "2026-04-22")).toBe("Apr 11 – 22");
    expect(formatRange("2025-09-30", "2025-10-10")).toBe("Sep 30 – Oct 10");
  });

  it("formats a day header", () => {
    expect(formatDayHeader("2025-10-03")).toBe("Fri Oct 3");
  });

  it("rejects anything that is not an ISO date", () => {
    expect(isISODate("2025-10-03")).toBe(true);
    expect(isISODate("2025-13-03")).toBe(false);
    expect(isISODate("03/10/2025")).toBe(false);
    expect(isISODate(20251003)).toBe(false);
  });
});
