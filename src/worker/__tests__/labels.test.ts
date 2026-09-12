import { describe, expect, it } from "vitest";
import { dateRangeLabel, dayLabel, initialsFor } from "../store.ts";
import { dayHue } from "../ui/tokens.ts";

describe("dayLabel", () => {
  it("writes a day the way every artboard does", () => {
    expect(dayLabel("2026-10-03")).toBe("Sat Oct 3");
    expect(dayLabel("2025-09-30")).toBe("Tue Sep 30");
  });

  it("hands back anything it cannot read, rather than inventing a date", () => {
    expect(dayLabel("not a date")).toBe("not a date");
  });
});

describe("dateRangeLabel", () => {
  it("writes Sep 30 – Oct 10 across two months", () => {
    expect(dateRangeLabel("2025-09-30", "2025-10-10")).toBe("Sep 30 – Oct 10");
  });

  it("does not repeat a month both ends share", () => {
    expect(dateRangeLabel("2026-04-11", "2026-04-22")).toBe("Apr 11 – 22");
  });

  it("writes a one-day trip as a date, not a range", () => {
    expect(dateRangeLabel("2026-09-12", "2026-09-12")).toBe("Sep 12");
  });
});

describe("dayHue", () => {
  it("reproduces the four days Main.dc.html fixes for an 11 day trip", () => {
    expect(dayHue(0, 11)).toBe("#3f6b4a");
    expect(dayHue(1, 11)).toBe("#57794c");
    expect(dayHue(2, 11)).toBe("#70864d");
    expect(dayHue(3, 11)).toBe("#8c8c4c");
  });

  it("ends pale yellow, and starts deep green whatever the trip's length", () => {
    expect(dayHue(0, 4)).toBe("#3f6b4a");
    expect(dayHue(3, 4)).toBe("#e6d5a8");
    expect(dayHue(0, 1)).toBe("#3f6b4a");
  });

  it("travels in one direction, so the ramp reads as a sequence", () => {
    const reds = [0, 1, 2, 3, 4, 5, 6].map((i) => Number.parseInt(dayHue(i, 7).slice(1, 3), 16));
    for (let i = 1; i < reds.length; i++) expect(reds[i]).toBeGreaterThan(reds[i - 1] as number);
  });
});

describe("initialsFor", () => {
  it("is stable for one person", () => {
    expect(initialsFor("dev_8f3cabc")).toBe(initialsFor("dev_8f3cabc"));
  });

  it("reads as initials rather than as a count", () => {
    for (const id of ["dev_8f3cabc", "dev_0000", "local-user", "dev_zzz999"]) {
      expect(initialsFor(id)).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("tells two people apart", () => {
    expect(initialsFor("dev_aaa")).not.toBe(initialsFor("dev_bbb"));
  });
});
