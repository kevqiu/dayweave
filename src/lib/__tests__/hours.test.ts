import { describe, expect, it } from "vitest";
import { checkHours, nearestOpenDay, weekFromPeriods } from "../hours.ts";
import { ALWAYS, BAR, RAMEN } from "./hours.fixtures.ts";

// 2026-10-02 is a Friday; 2026-10-03 Saturday; 2026-10-05 Monday.
const FRI = "2026-10-02";
const SAT = "2026-10-03";
const MON = "2026-10-05";

describe("reading Google's periods", () => {
  it("cuts them into seven days, Sunday first", () => {
    const week = weekFromPeriods(RAMEN)!;
    expect(week[1]).toEqual([]);
    expect(week[5]).toEqual([[660, 900], [1050, 1320]]);
    expect(week[0]).toEqual([[600, 1320]]);
  });

  it("carries a late night over midnight into the next day", () => {
    const week = weekFromPeriods(BAR)!;
    expect(week[5]).toEqual([[1080, 1440]]);
    expect(week[6]).toEqual([[0, 120]]);
  });

  it("reads a period with no close as never shutting", () => {
    const week = weekFromPeriods(ALWAYS)!;
    for (const day of week) expect(day).toEqual([[0, 1440]]);
  });

  it("has nothing to say about a place with no periods", () => {
    expect(weekFromPeriods(undefined)).toBeNull();
    expect(weekFromPeriods([])).toBeNull();
  });
});

describe("checking a stop against them", () => {
  const ramen = weekFromPeriods(RAMEN);

  it("says when a place opens later than the stop", () => {
    expect(checkHours(ramen, FRI, "10:00")).toMatchObject({
      dayName: "Friday", label: "11:00 – 15:00, 17:30 – 22:00",
      ok: false, closed: false, note: "opens 11:00", fix: "11:00",
    });
  });

  it("names the next session when the stop falls between two", () => {
    expect(checkHours(ramen, FRI, "16:00")).toMatchObject({ ok: false, note: "opens 17:30", fix: "17:30" });
  });

  it("says when the stop is after the last close", () => {
    expect(checkHours(ramen, FRI, "23:00")).toMatchObject({ ok: false, note: "closed after 22:00", fix: "17:30" });
  });

  it("is quiet when the place is open", () => {
    expect(checkHours(ramen, FRI, "12:00")).toMatchObject({ ok: true, note: null });
    expect(checkHours(ramen, FRI, "11:00")).toMatchObject({ ok: true });
    // Closing time is not open.
    expect(checkHours(ramen, FRI, "15:00")).toMatchObject({ ok: false, note: "opens 17:30" });
  });

  it("flags a day it is shut, with or without a time", () => {
    expect(checkHours(ramen, MON, "10:00")).toMatchObject({ label: "Closed", closed: true, ok: false, note: "closed Mondays", fix: null });
    expect(checkHours(ramen, MON, null)).toMatchObject({ closed: true, ok: false, note: "closed Mondays" });
  });

  it("does not flag a stop with no time on a day it opens", () => {
    expect(checkHours(ramen, FRI, null)).toMatchObject({ ok: true, note: null });
  });

  it("keeps the small hours with the night they belong to", () => {
    const bar = weekFromPeriods(BAR);
    expect(checkHours(bar, FRI, "20:00")).toMatchObject({ label: "18:00 – 02:00", ok: true });
    // Saturday at 01:00 is Friday night, still open.
    expect(checkHours(bar, SAT, "01:00")).toMatchObject({ label: "Closed", ok: true });
    expect(checkHours(bar, SAT, "10:00")).toMatchObject({ ok: false, note: "closed Saturdays" });
  });

  it("describes a place that never shuts", () => {
    expect(checkHours(weekFromPeriods(ALWAYS), MON, "03:00")).toMatchObject({ label: "Open 24 hours", ok: true });
  });

  it("has nothing to check without hours or a day", () => {
    expect(checkHours(null, FRI, "10:00")).toBeNull();
    expect(checkHours(ramen, null, "10:00")).toBeNull();
  });
});

describe("the nearest day it is open", () => {
  const ramen = weekFromPeriods(RAMEN);
  const days = [
    { id: "wed", date: "2026-09-30", city: "Fukuoka" },
    { id: "thu", date: "2026-10-01", city: "Fukuoka" },
    { id: "fri", date: FRI, city: "Fukuoka" },
    { id: "sat", date: SAT, city: "Fukuoka" },
    { id: "sun", date: "2026-10-04", city: "Fukuoka" },
    { id: "mon", date: MON, city: "Fukuoka" },
    { id: "tue", date: "2026-10-06", city: "Kagoshima" },
  ];
  const here = { dayId: "mon", city: "Fukuoka" };

  it("keeps the time when a nearby day is open at it", () => {
    expect(nearestOpenDay(ramen, days, here, "10:00", "2026-09-23")).toEqual({ dayId: "sun", date: "2026-10-04", time: null });
  });

  it("moves the time to the opening when no day is open at it", () => {
    expect(nearestOpenDay(ramen, days, here, "09:00", "2026-09-23")).toEqual({ dayId: "sun", date: "2026-10-04", time: "10:00" });
  });

  it("stays in the city, and breaks a tie towards the earlier day", () => {
    const allFukuoka = days.map((d) => ({ ...d, city: "Fukuoka" }));
    // Sunday and Tuesday are both a day away; Sunday wins.
    expect(nearestOpenDay(ramen, allFukuoka, here, "12:00", "2026-09-23")?.dayId).toBe("sun");
  });

  it("never offers a day already past", () => {
    const later = days.map((d) => ({ ...d, city: "Fukuoka" }));
    expect(nearestOpenDay(ramen, later, here, "12:00", MON)?.dayId).toBe("tue");
    expect(nearestOpenDay(ramen, days, here, "12:00", MON)).toBeNull();
  });
});
