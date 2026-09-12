import { describe, expect, it } from "vitest";
import { cityFrom, countryFrom, shortCategory } from "../places.ts";

describe("shortCategory", () => {
  it("drops the generic noun, which is the line section 4c specifies", () => {
    expect(shortCategory("Ramen Restaurant", "ramen_restaurant")).toBe("ramen");
    expect(shortCategory("Coffee Shop", "coffee_shop")).toBe("coffee");
    expect(shortCategory("Book Store", "book_store")).toBe("book");
  });

  it("keeps a category that is only the generic noun", () => {
    expect(shortCategory("Restaurant", "restaurant")).toBe("restaurant");
  });

  it("falls back to the raw type when there is no display name", () => {
    expect(shortCategory(undefined, "art_gallery")).toBe("art gallery");
  });

  it("is null when Places tells us nothing", () => {
    expect(shortCategory(undefined, undefined)).toBeNull();
  });
});

describe("cityFrom", () => {
  const fukuoka = [
    { longText: "Hakata Ward", types: ["sublocality_level_1", "sublocality"] },
    { longText: "Fukuoka", types: ["locality", "political"] },
    { longText: "Fukuoka Prefecture", types: ["administrative_area_level_1"] },
    { longText: "Japan", shortText: "JP", types: ["country", "political"] },
  ];

  it("prefers the locality over the ward, so the subtitle says Fukuoka", () => {
    expect(cityFrom(fukuoka)).toBe("Fukuoka");
  });

  it("falls back through postal town and the admin areas", () => {
    expect(cityFrom([{ longText: "Reading", types: ["postal_town"] }])).toBe("Reading");
    expect(
      cityFrom([{ longText: "Tyrol", types: ["administrative_area_level_1"] }]),
    ).toBe("Tyrol");
  });

  it("is null rather than a guess when nothing matches", () => {
    expect(cityFrom([{ longText: "Japan", types: ["country"] }])).toBeNull();
  });

  it("reads the country as its short code", () => {
    expect(countryFrom(fukuoka)).toBe("JP");
    expect(countryFrom([])).toBeNull();
  });
});
