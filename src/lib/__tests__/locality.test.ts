import { describe, expect, it } from "vitest";
import { locality, sameCity } from "../locality.ts";

describe("locality labels", () => {
  it("labels NYC counties as boroughs and compares them as one city", () => {
    const brooklyn = { lat: 40.7, lng: -73.95 };
    const manhattan = { lat: 40.75, lng: -73.98 };
    expect(locality("Kings County", brooklyn)).toBe("Brooklyn");
    expect(sameCity("Kings County", brooklyn, "New York", manhattan)).toBe(true);
    expect(sameCity("Queens County", brooklyn, "New York", manhattan)).toBe(true);
  });
  it("does not rename counties elsewhere or infer location from a name alone", () => {
    expect(locality("Kings County", { lat: 36.1, lng: -119.8 })).toBe("Kings County");
    expect(locality("Kings County", null)).toBe("Kings County");
    expect(sameCity("Jersey City", { lat: 40.7, lng: -74.05 }, "New York", { lat: 40.75, lng: -74 })).toBe(false);
  });
});
