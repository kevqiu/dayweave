import { describe, expect, it } from "vitest";
import { describeStop, tripCities, walkMinutes } from "../derive.ts";

const A = { lat: 33.5904, lng: 130.4017 };
// About 500 m north of A.
const B = { lat: 33.5949, lng: 130.4017 };
const FAR = { lat: 31.5966, lng: 130.5571 };

describe("walkMinutes", () => {
  it("turns half a kilometre into a believable walk", () => {
    expect(walkMinutes(A, B)).toBe(8);
  });

  it("never rounds a real distance down to zero minutes", () => {
    expect(walkMinutes(A, { lat: 33.5905, lng: 130.4017 })).toBe(1);
  });

  it("is null when it is plainly not a walk", () => {
    expect(walkMinutes(A, FAR)).toBeNull();
  });
});

describe("describeStop", () => {
  it("reads as section 4c says: category, then the walk in", () => {
    expect(describeStop({ category: "ramen", location: B }, { category: null, location: A }))
      .toBe("ramen · 8 min walk");
  });

  it("is the category alone for the first stop of a day", () => {
    expect(describeStop({ category: "ramen", location: B }, null)).toBe("ramen");
  });

  it("drops the walk when the previous stop is a train ride away", () => {
    expect(describeStop({ category: "onsen", location: FAR }, { category: null, location: A }))
      .toBe("onsen");
  });

  it("is empty rather than a placeholder when we know nothing", () => {
    expect(describeStop({ category: null, location: null }, null)).toBe("");
  });
});

describe("tripCities", () => {
  it("keeps day order and says each city once", () => {
    expect(tripCities(["Fukuoka", "Fukuoka", "Kagoshima", "Hakone", "Kagoshima"]))
      .toEqual(["Fukuoka", "Kagoshima", "Hakone"]);
  });

  it("is empty for a trip with no stops, so the card shows no subtitle", () => {
    expect(tripCities([null, null])).toEqual([]);
  });
});
