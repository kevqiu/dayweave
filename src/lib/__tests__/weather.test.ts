import { describe, expect, it } from "vitest";
import { dayPoint, forecastWindow, readForecast, skyOf, weatherQuery } from "../weather.ts";

const FUKUOKA = { lat: 33.5902, lng: 130.4017 };
const KAGOSHIMA = { lat: 31.5966, lng: 130.5571 };

describe("skyOf", () => {
  it("reduces the WMO codes to the six skies the chip draws", () => {
    expect([0, 1].map(skyOf)).toEqual(["sun", "sun"]);
    expect(skyOf(2)).toBe("part");
    expect([3, 45, 48].map(skyOf)).toEqual(["cloud", "cloud", "cloud"]);
    expect([51, 55, 61, 65, 67, 80, 82].every((c) => skyOf(c) === "rain")).toBe(true);
    expect([71, 75, 77, 85, 86].every((c) => skyOf(c) === "snow")).toBe(true);
    expect([95, 96, 99].every((c) => skyOf(c) === "storm")).toBe(true);
  });

  it("does not guess at a code it does not know", () => {
    expect(skyOf(4)).toBeNull();
    expect(skyOf(100)).toBeNull();
  });
});

describe("forecastWindow", () => {
  it("runs 92 days back and 16 days ahead, today included", () => {
    expect(forecastWindow("2026-09-30")).toEqual({ from: "2026-06-30", to: "2026-10-15" });
  });
});

describe("dayPoint", () => {
  const stay = { lat: KAGOSHIMA.lat, lng: KAGOSHIMA.lng, check_in: "2026-10-03", check_out: "2026-10-06" };

  it("is where the day's own stops are", () => {
    expect(dayPoint("2026-10-03", [FUKUOKA, FUKUOKA], [stay])).toEqual(FUKUOKA);
  });

  it("falls back to where you sleep that night, and not on the morning you check out", () => {
    expect(dayPoint("2026-10-03", [], [stay])).toEqual(KAGOSHIMA);
    expect(dayPoint("2026-10-05", [], [stay])).toEqual(KAGOSHIMA);
    expect(dayPoint("2026-10-06", [], [stay])).toBeNull();
  });

  it("is nowhere for a day with neither", () => {
    expect(dayPoint("2026-10-03", [], [])).toBeNull();
    expect(dayPoint("2026-10-03", [], [{ ...stay, lat: null, lng: null }])).toBeNull();
  });
});

describe("weatherQuery", () => {
  const days = [
    { id: "d1", date: "2026-10-01", point: FUKUOKA },
    { id: "d2", date: "2026-10-02", point: { lat: 33.61, lng: 130.39 } },
    { id: "d3", date: "2026-10-03", point: KAGOSHIMA },
    { id: "d4", date: "2026-10-04", point: null },
  ];

  it("asks once, with one location per city and one range for all of them", () => {
    const query = weatherQuery(days, "2026-09-30")!;
    const params = new URL(query.url).searchParams;
    expect(params.get("latitude")).toBe("33.6,31.6");
    expect(params.get("longitude")).toBe("130.4,130.6");
    expect(params.get("start_date")).toBe("2026-10-01");
    expect(params.get("end_date")).toBe("2026-10-03");
    expect(params.get("timezone")).toBe("auto");
    expect(params.get("daily")).toBe("weather_code,temperature_2m_max,precipitation_probability_max");
    expect(query.days).toEqual([
      { id: "d1", date: "2026-10-01", at: 0 },
      { id: "d2", date: "2026-10-02", at: 0 },
      { id: "d3", date: "2026-10-03", at: 1 },
    ]);
  });

  it("leaves out days the forecast does not reach", () => {
    const query = weatherQuery(
      [...days, { id: "far", date: "2026-10-20", point: FUKUOKA }, { id: "old", date: "2026-06-01", point: FUKUOKA }],
      "2026-09-30",
    )!;
    expect(query.days.map((d) => d.id)).toEqual(["d1", "d2", "d3"]);
    expect(new URL(query.url).searchParams.get("end_date")).toBe("2026-10-03");
  });

  it("asks nothing when no day has a point inside the window", () => {
    expect(weatherQuery([{ id: "d4", date: "2026-10-04", point: null }], "2026-09-30")).toBeNull();
    expect(weatherQuery([{ id: "x", date: "2027-01-01", point: FUKUOKA }], "2026-09-30")).toBeNull();
  });
});

describe("readForecast", () => {
  const query = weatherQuery(
    [
      { id: "d1", date: "2026-10-01", point: FUKUOKA },
      { id: "d2", date: "2026-10-02", point: FUKUOKA },
      { id: "d3", date: "2026-10-03", point: KAGOSHIMA },
    ],
    "2026-09-30",
  )!;
  const daily = (codes: unknown[], highs: unknown[], rain: unknown[]) => ({
    daily: { time: ["2026-10-01", "2026-10-02", "2026-10-03"], weather_code: codes, temperature_2m_max: highs, precipitation_probability_max: rain },
  });

  it("reads each day from its own location", () => {
    const body = [daily([0, 61, 3], [26.44, 21.06, 22], [0, 70, 5]), daily([95, 95, 95], [30, 30, 25.2], [80, 80, 80])];
    expect(readForecast(query, body)).toEqual({
      d1: { sky: "sun", rain: 0, high: 26.4 },
      d2: { sky: "rain", rain: 70, high: 21.1 },
      d3: { sky: "storm", rain: 80, high: 25.2 },
    });
  });

  it("reads a single location, which Open-Meteo sends as an object", () => {
    const one = weatherQuery([{ id: "d1", date: "2026-10-01", point: FUKUOKA }], "2026-09-30")!;
    expect(readForecast(one, daily([2, 2, 2], [24, 24, 24], [10, 10, 10]))).toEqual({ d1: { sky: "part", rain: 10, high: 24 } });
  });

  it("keeps a day with no chance of rain as null, and drops one missing its code or high", () => {
    const body = [daily([0, null, 3], [26, 21, null], [null, 40, 5]), daily([3, 3, 3], [22, 22, 22], [null, null, null])];
    expect(readForecast(query, body)).toEqual({
      d1: { sky: "sun", rain: null, high: 26 },
      d3: { sky: "cloud", rain: null, high: 22 },
    });
  });

  it("is empty for a reply it cannot read", () => {
    expect(readForecast(query, { error: true, reason: "nope" })).toEqual({});
    expect(readForecast(query, null)).toEqual({});
  });
});
