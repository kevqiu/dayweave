import { describe, expect, it } from "vitest";
import { DAY_RAMP, PEOPLE, dayHue, initials, personColor } from "../palette.ts";

describe("day hues", () => {
  it("runs the whole ramp whatever the trip length", () => {
    // Deep green on day one, pale yellow on the last, for 4 days and for 11.
    for (const count of [2, 4, 11, 30]) {
      expect(dayHue(0, count)).toBe(DAY_RAMP[0]);
      expect(dayHue(count - 1, count)).toBe(DAY_RAMP[DAY_RAMP.length - 1]);
    }
  });

  it("never leaves the ramp", () => {
    for (let i = 0; i < 30; i++) expect(DAY_RAMP).toContain(dayHue(i, 30));
  });

  it("gives a one-day trip the first hue", () => {
    expect(dayHue(0, 1)).toBe(DAY_RAMP[0]);
  });
});

describe("people", () => {
  it("keeps someone the same colour across screens", () => {
    expect(personColor("local-user")).toBe(personColor("local-user"));
    expect(PEOPLE).toContain(personColor("mika"));
  });

  it("never gives a person a day colour", () => {
    for (const id of ["a", "mika", "local-user", "jl"]) {
      expect(DAY_RAMP).not.toContain(personColor(id));
    }
  });

  it("builds initials from the ends of a name", () => {
    expect(initials("Kevin Qiu")).toBe("KQ");
    expect(initials("Mika")).toBe("MI");
    expect(initials("Ana Maria Torres")).toBe("AT");
    expect(initials("  ")).toBe("?");
  });
});
