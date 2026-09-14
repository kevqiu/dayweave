import { describe, expect, it } from "vitest";
import { isAccommodation } from "../derive.ts";

describe("isAccommodation", () => {
  it("knows the categories Places actually returns for a night's sleep", () => {
    // "THE BLOSSOM HAKATA Premier" comes back as "hotel".
    expect(isAccommodation("hotel")).toBe(true);
    expect(isAccommodation("hostel")).toBe(true);
    expect(isAccommodation("japanese inn")).toBe(true);
    expect(isAccommodation("guest house")).toBe(true);
    expect(isAccommodation("bed and breakfast")).toBe(true);
    expect(isAccommodation("capsule hotel")).toBe(true);
    expect(isAccommodation("Resort Hotel")).toBe(true);
  });

  it("leaves the rest of the trip alone", () => {
    expect(isAccommodation("ramen")).toBe(false);
    expect(isAccommodation("park")).toBe(false);
    expect(isAccommodation("seafood")).toBe(false);
    expect(isAccommodation("museum")).toBe(false);
    expect(isAccommodation(null)).toBe(false);
    expect(isAccommodation("")).toBe(false);
  });

  it("matches whole words, so a dinner is not a room", () => {
    expect(isAccommodation("dinner")).toBe(false);
    expect(isAccommodation("innsbruck")).toBe(false);
    expect(isAccommodation("winner")).toBe(false);
  });

  it("finds the word inside a longer category", () => {
    expect(isAccommodation("business hotel")).toBe(true);
    expect(isAccommodation("extended stay hotel")).toBe(true);
  });
});
