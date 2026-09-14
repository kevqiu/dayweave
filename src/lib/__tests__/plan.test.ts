import { describe, expect, it } from "vitest";
import {
  cardBox,
  formatClock,
  formatFree,
  gridSpan,
  gridTime,
  gridY,
  hourLabels,
  hourLines,
  lodgingBars,
  minutesOf,
  planRows,
  PX_PER_HOUR,
  staysOn,
} from "../plan.ts";

describe("minutesOf", () => {
  it("reads a clock", () => {
    expect(minutesOf("10:00")).toBe(600);
    expect(minutesOf("13:15")).toBe(795);
    expect(minutesOf("00:00")).toBe(0);
  });

  it("is null for anything that is not one", () => {
    expect(minutesOf("")).toBeNull();
    expect(minutesOf(null)).toBeNull();
    expect(minutesOf("half past")).toBeNull();
    expect(minutesOf("24:30")).toBeNull();
    expect(minutesOf("10:75")).toBeNull();
  });
});

describe("formatClock", () => {
  it("always has two digits", () => {
    expect(formatClock(600)).toBe("10:00");
    expect(formatClock(9 * 60 + 5)).toBe("09:05");
  });
});

describe("formatFree", () => {
  it("says an hour and a bit the way a person does", () => {
    expect(formatFree(135)).toBe("2 h 15 free");
    expect(formatFree(120)).toBe("2 h free");
    expect(formatFree(45)).toBe("45 min free");
  });
});

describe("planRows", () => {
  const row = (id: string, time: string, status = "planned") => ({ id, time, status });

  it("gives every stop the artboard's base height", () => {
    const rows = planRows([row("a", "10:00"), row("b", "10:30")]);
    expect(rows.map((r) => r.height)).toEqual([46, 46]);
    expect(rows[0]?.free).toBeNull();
  });

  it("holds a long gap open with the dashed slot", () => {
    const rows = planRows([row("a", "16:00"), row("b", "19:30")]);
    expect(rows[0]?.free).toBe("3 h 30 free");
    expect(rows[0]?.height).toBe(46 + 31);
    // The plus starts the next thing an hour in, not the instant this began.
    expect(rows[0]?.freeAt).toBe("17:00");
  });

  it("never offers to plan into a gap that has already happened", () => {
    const rows = planRows([row("a", "10:00", "visited"), row("b", "12:30")]);
    expect(rows[0]?.free).toBeNull();
    expect(rows[0]?.height).toBe(46);
  });

  it("says nothing about a stop with no time", () => {
    const rows = planRows([row("a", ""), row("b", "19:30")]);
    expect(rows[0]?.free).toBeNull();
  });
});

describe("gridSpan", () => {
  it("rules the artboard's hours when the day is an ordinary one", () => {
    const span = gridSpan(["10:00", "13:15", "19:30"]);
    expect(span.from).toBe(8 * 60);
    expect(span.to).toBe(23 * 60);
    expect(span.height).toBe(15 * PX_PER_HOUR);
  });

  it("opens up for an early ferry", () => {
    expect(gridSpan(["06:40"]).from).toBe(6 * 60);
  });

  it("opens up for a late dinner and stops at midnight", () => {
    expect(gridSpan(["23:30"]).to).toBe(24 * 60);
  });

  it("ignores the stops with no time at all", () => {
    expect(gridSpan([null, "", "10:00"]).from).toBe(8 * 60);
  });
});

describe("the grid's geometry", () => {
  const span = gridSpan(["10:00"]);

  it("puts the artboard's cards where the artboard puts them", () => {
    // design/Planner.dc.html, transcribed: 10:00 at 88, 12:30 at 198,
    // 13:15 at 231, 16:00 at 352, 19:30 at 506.
    expect(gridY(span, minutesOf("10:00") as number)).toBe(88);
    expect(gridY(span, minutesOf("12:30") as number)).toBe(198);
    expect(gridY(span, minutesOf("13:15") as number)).toBe(231);
    expect(gridY(span, minutesOf("16:00") as number)).toBe(352);
    expect(gridY(span, minutesOf("19:30") as number)).toBe(506);
  });

  it("snaps a drop to the quarter hour", () => {
    expect(formatClock(gridTime(span, 231))).toBe("13:15");
    expect(formatClock(gridTime(span, 236))).toBe("13:15");
    expect(formatClock(gridTime(span, 0))).toBe("08:00");
  });

  it("never lands outside the column", () => {
    expect(gridTime(span, -400)).toBe(span.from);
    expect(gridTime(span, 9000)).toBe(span.to);
  });

  it("draws a stop with an end time to its real length", () => {
    expect(cardBox(span, "16:00", "17:30", true)).toEqual({ top: 352, height: 66 });
  });

  it("gives a card with no second line the shorter box", () => {
    expect(cardBox(span, "12:30", null, false)).toEqual({ top: 198, height: 30 });
    expect(cardBox(span, "12:30", null, true)).toEqual({ top: 198, height: 38 });
  });

  it("has nowhere to put a stop with no time", () => {
    expect(cardBox(span, null, null, true)).toBeNull();
  });

  it("rules an hour line every hour and labels every second one", () => {
    expect(hourLines(span)[0]).toBe(44);
    expect(hourLines(span)).toHaveLength(14);
    expect(hourLabels(span)[0]).toEqual({ at: 0, label: "08:00" });
    expect(hourLabels(span)[1]).toEqual({ at: 88, label: "10:00" });
  });
});

describe("lodgingBars", () => {
  const WEEK = [
    "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03",
    "2026-10-04", "2026-10-05", "2026-10-06",
  ];
  const stay = (id: string, checkIn: string, checkOut: string) => ({
    id, name: id, checkIn, checkOut,
  });

  it("draws a stay as one bar across the days it covers", () => {
    const [bar] = lodgingBars(WEEK, [stay("blossom", "2026-09-30", "2026-10-02")]);
    expect(bar?.left).toBeCloseTo(0);
    expect(bar?.width).toBeCloseTo(3 / 7);
  });

  it("leaves out a stay that is nowhere near the days showing", () => {
    expect(lodgingBars(WEEK, [stay("later", "2026-11-01", "2026-11-04")])).toEqual([]);
  });

  it("clips to the page, and says which end it ran off", () => {
    const [bar] = lodgingBars(WEEK, [stay("long", "2026-09-20", "2026-11-01")]);
    expect(bar?.left).toBeCloseTo(0);
    expect(bar?.width).toBeCloseTo(1);
    expect(bar?.startsBefore).toBe(true);
    expect(bar?.endsAfter).toBe(true);
  });

  it("splits the day two stays share down the middle", () => {
    // Leaving the Blossom on Oct 2 and checking into the ryokan the same day:
    // the day belongs to both, so each gets half of it and the seam is where
    // the change happens.
    const bars = lodgingBars(WEEK, [
      stay("blossom", "2026-09-30", "2026-10-02"),
      stay("ryokan", "2026-10-02", "2026-10-04"),
    ]);
    const blossom = bars.find((b) => b.id === "blossom");
    const ryokan = bars.find((b) => b.id === "ryokan");

    expect(blossom?.left).toBeCloseTo(0);
    expect(blossom?.width).toBeCloseTo(2.5 / 7);
    expect(ryokan?.left).toBeCloseTo(2.5 / 7);
    expect(ryokan?.width).toBeCloseTo(2.5 / 7);
    // They meet exactly, with nothing over and nothing between.
    expect((blossom as { left: number; width: number }).left + (blossom as { width: number }).width)
      .toBeCloseTo((ryokan as { left: number }).left);
  });

  it("does not halve a day only one stay is on", () => {
    const bars = lodgingBars(WEEK, [
      stay("a", "2026-09-30", "2026-10-01"),
      stay("b", "2026-10-03", "2026-10-04"),
    ]);
    expect(bars[0]?.width).toBeCloseTo(2 / 7);
    expect(bars[1]?.left).toBeCloseTo(3 / 7);
    expect(bars[1]?.width).toBeCloseTo(2 / 7);
  });

  it("hands the halves out the same way whatever order the stays arrive in", () => {
    const two = [stay("blossom", "2026-09-30", "2026-10-02"), stay("ryokan", "2026-10-02", "2026-10-04")];
    expect(lodgingBars(WEEK, two)).toEqual(lodgingBars(WEEK, [...two].reverse()));
  });

  it("ignores a stay that ends before it starts rather than drawing it backwards", () => {
    expect(lodgingBars(WEEK, [stay("wrong", "2026-10-04", "2026-10-01")])).toEqual([]);
  });
});

describe("staysOn", () => {
  const stays = [
    { id: "a", name: "Blossom", checkIn: "2026-09-30", checkOut: "2026-10-02" },
    { id: "b", name: "Ryokan", checkIn: "2026-10-02", checkOut: "2026-10-04" },
  ];

  it("gives both hotels on the day you change, earliest first", () => {
    expect(staysOn("2026-10-02", stays).map((s) => s.name)).toEqual(["Blossom", "Ryokan"]);
  });

  it("gives nothing for a night nobody has booked", () => {
    expect(staysOn("2026-10-09", stays)).toEqual([]);
  });
});
