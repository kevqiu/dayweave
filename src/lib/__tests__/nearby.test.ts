import { describe, expect, it } from "vitest";
import { DAY_RANGE_M, nearDay, nearestNode, nearTrip } from "../nearby.ts";

const HAKATA = { lat: 33.5904, lng: 130.4017, name: "Hakata Station" };
const OHORI = { lat: 33.5862, lng: 130.3766, name: "Ohori Park" };
const DAZAIFU = { lat: 33.5196, lng: 130.5349, name: "Dazaifu" };
const KAGOSHIMA = { lat: 31.5966, lng: 130.5571, name: "Kagoshima" };
const TOKYO = { lat: 35.6812, lng: 139.7671, name: "Tokyo" };

describe("nearestNode", () => {
  it("names the closest stop and how far it is", () => {
    const hit = nearestNode({ lat: 33.587, lng: 130.378 }, [HAKATA, OHORI]);
    expect(hit?.name).toBe("Ohori Park");
    expect(hit!.metres).toBeLessThan(300);
  });

  it("is null with nothing to measure from", () => {
    expect(nearestNode(HAKATA, [])).toBeNull();
  });
});

describe("nearDay", () => {
  it("keeps everything, in Google's order, on an empty day", () => {
    const { kept, dropped } = nearDay([TOKYO, KAGOSHIMA, HAKATA], []);
    expect(kept.map((r) => r.place.name)).toEqual(["Tokyo", "Kagoshima", "Hakata Station"]);
    expect(kept.every((r) => r.nearest === null)).toBe(true);
    expect(dropped).toBe(0);
  });

  it("drops what is out of range of every stop on the day", () => {
    const { kept, dropped } = nearDay([TOKYO, DAZAIFU, KAGOSHIMA], [HAKATA, OHORI]);
    // Dazaifu is a day trip from Hakata, about 16 km; the other two are not.
    expect(kept.map((r) => r.place.name)).toEqual(["Dazaifu"]);
    expect(dropped).toBe(2);
  });

  it("orders by the distance to whichever stop is nearest", () => {
    const nearOhori = { lat: 33.5855, lng: 130.3790, name: "by Ohori" };
    const nearHakata = { lat: 33.5915, lng: 130.4060, name: "by Hakata" };
    const { kept } = nearDay([DAZAIFU, nearHakata, nearOhori], [HAKATA, OHORI]);
    expect(kept.map((r) => r.place.name)).toEqual(["by Ohori", "by Hakata", "Dazaifu"]);
    expect(kept[0]!.nearest?.name).toBe("Ohori Park");
    expect(kept[1]!.nearest?.name).toBe("Hakata Station");
  });

  it("measures against the range it is given", () => {
    const { kept } = nearDay([DAZAIFU], [HAKATA], DAY_RANGE_M);
    expect(kept).toHaveLength(1);
    expect(nearDay([DAZAIFU], [HAKATA], 1_000).dropped).toBe(1);
  });
});

describe("nearTrip", () => {
  const trip = [{ ...HAKATA, countryCode: "JP" }, { ...OHORI, countryCode: "JP" }];
  const place = (p: { lat: number; lng: number; name: string }, countryCode: string | null) => ({ ...p, countryCode });

  it("keeps another city in the same country, however far", () => {
    const sapporo = place({ lat: 43.0618, lng: 141.3545, name: "Sapporo" }, "JP");
    expect(nearTrip([sapporo], trip).kept).toHaveLength(1);
  });

  it("drops a place in another country far from everything on the trip", () => {
    const ohio = place({ lat: 39.9612, lng: -82.9988, name: "Columbus" }, "US");
    const { kept, dropped } = nearTrip([ohio, place(DAZAIFU, "JP")], trip);
    expect(kept.map((p) => p.name)).toEqual(["Dazaifu"]);
    expect(dropped).toBe(1);
  });

  it("keeps a place across a border that is close to the trip", () => {
    const busan = place({ lat: 35.1796, lng: 129.0756, name: "Busan" }, "KR");
    expect(nearTrip([busan], trip).kept).toHaveLength(1);
  });

  it("measures a place with no country by distance alone", () => {
    expect(nearTrip([place(TOKYO, null)], trip).kept).toHaveLength(0);
    expect(nearTrip([place(KAGOSHIMA, null)], trip).kept).toHaveLength(1);
  });

  it("keeps everything on a trip with nothing located on it", () => {
    const ohio = place({ lat: 39.9612, lng: -82.9988, name: "Columbus" }, "US");
    expect(nearTrip([ohio], []).kept).toHaveLength(1);
  });
});
