import { describe, expect, it } from "vitest";
import { centroid, haversineMetres, resolveBias, roundedCentre } from "../geo.ts";

const HAKATA = { lat: 33.5904, lng: 130.4017 };
const KAGOSHIMA = { lat: 31.5966, lng: 130.5571 };

describe("haversineMetres", () => {
  it("measures a known gap", () => {
    // Hakata to Kagoshima is about 222 km.
    expect(haversineMetres(HAKATA, KAGOSHIMA) / 1000).toBeCloseTo(222, 0);
  });

  it("is zero for a point against itself", () => {
    expect(haversineMetres(HAKATA, HAKATA)).toBe(0);
  });
});

describe("centroid", () => {
  it("averages the points", () => {
    const c = centroid([HAKATA, KAGOSHIMA]);
    expect(c?.lat).toBeCloseTo(32.5935, 3);
  });

  it("is null for nothing", () => {
    expect(centroid([])).toBeNull();
  });
});

describe("resolveBias", () => {
  const days = [
    { id: "mon", date: "2026-10-05", stops: [HAKATA] },
    { id: "tue", date: "2026-10-06", stops: [], lodging: KAGOSHIMA },
    { id: "wed", date: "2026-10-07", stops: [] },
  ];

  it("takes the open day's stops first, at 3 km", () => {
    const bias = resolveBias({ dayId: "mon", days });
    expect(bias?.source).toBe("day-stops");
    expect(bias?.radius).toBe(3000);
    expect(bias?.center.lat).toBeCloseTo(HAKATA.lat, 4);
  });

  it("falls back to that day's lodging when it has no stops", () => {
    const bias = resolveBias({ dayId: "tue", days });
    expect(bias?.source).toBe("lodging");
    expect(bias?.center).toEqual(KAGOSHIMA);
  });

  it("reaches for the nearest day with stops for an empty day in a new city", () => {
    const bias = resolveBias({ dayId: "wed", days });
    expect(bias?.source).toBe("nearest-day");
    expect(bias?.center.lat).toBeCloseTo(HAKATA.lat, 4);
  });

  it("prefers the earlier day when both sides are equally near", () => {
    const bias = resolveBias({
      dayId: "b",
      days: [
        { id: "a", date: "2026-10-05", stops: [HAKATA] },
        { id: "b", date: "2026-10-06", stops: [] },
        { id: "c", date: "2026-10-07", stops: [KAGOSHIMA] },
      ],
    });
    expect(bias?.center.lat).toBeCloseTo(HAKATA.lat, 4);
  });

  it("uses the viewport last, capped at the API's 50 km", () => {
    const bias = resolveBias({ dayId: null, days, viewport: { center: KAGOSHIMA, radius: 90000 } });
    expect(bias?.source).toBe("viewport");
    expect(bias?.radius).toBe(50000);
  });

  it("is null on a brand new trip, which searches unbiased", () => {
    expect(resolveBias({ dayId: "wed", days: [{ id: "wed", date: "2026-10-07", stops: [] }] }))
      .toBeNull();
  });
});

describe("roundedCentre", () => {
  it("rounds so a nudged map still hits the cache", () => {
    const a = resolveBias({ dayId: "d", days: [{ id: "d", date: "2026-10-05", stops: [HAKATA] }] });
    const b = resolveBias({
      dayId: "d",
      days: [{ id: "d", date: "2026-10-05", stops: [{ lat: 33.5912, lng: 130.4008 }] }],
    });
    expect(roundedCentre(a)).toBe(roundedCentre(b));
  });

  it("has a name for no bias at all", () => {
    expect(roundedCentre(null)).toBe("none");
  });
});
