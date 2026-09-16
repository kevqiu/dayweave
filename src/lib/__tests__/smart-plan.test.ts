import { describe, expect, it } from "vitest";
import { smartPlan, travelMinutes, visitMinutes, type SmartStop } from "../smart-plan.ts";
import { minutesOf } from "../plan.ts";

const stop = (id: string, overrides: Partial<SmartStop> = {}): SmartStop => ({
  id, day_id: null, start_time: null, category: "museum", status: "planned", lat: 40.7, lng: -74, ...overrides,
});
const days = [{ id: "a" }, { id: "b" }];

describe("Smart Plan", () => {
  it("clusters places near existing destinations and leaves timed stops unchanged", () => {
    const stops = [stop("ny", { day_id: "a", start_time: "09:00" }), stop("la", { day_id: "b", start_time: "09:00", lat: 34, lng: -118 }), stop("ny2"), stop("la2", { lat: 34.001, lng: -118 })];
    const before = structuredClone(stops);
    const result = smartPlan(days, stops, null);
    expect(result.placements.find((p) => p.id === "ny2")?.dayId).toBe("a");
    expect(result.placements.find((p) => p.id === "la2")?.dayId).toBe("b");
    expect(result.placements).toHaveLength(2);
    expect(stops).toEqual(before);
  });

  it("allows visit duration and travel before and after fixed appointments", () => {
    const stops = [stop("fixed", { day_id: "a", start_time: "12:00" }), stop("one", { day_id: "a" }), stop("two", { day_id: "a", category: "cafe" })];
    const result = smartPlan(days, stops, "a");
    expect(result.placements.every((p) => p.dayId === "a")).toBe(true);
    const ordered = [{ id: "fixed", time: "12:00", duration: 120 }, ...result.placements].sort((a, b) => a.time.localeCompare(b.time));
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1]!;
      const current = ordered[i]!;
      expect(minutesOf(current.time)!).toBeGreaterThanOrEqual(minutesOf(previous.time)! + previous.duration + travelMinutes(stops.find((s) => s.id === previous.id), stops.find((s) => s.id === current.id)!));
    }
  });

  it("keeps overflow untimed, excludes lodging and visited places, and handles missing coordinates", () => {
    const stops = [...Array.from({ length: 15 }, (_, i) => stop(String(i), { day_id: "a", lat: null, lng: null })), stop("hotel", { day_id: "a", category: "hotel" }), stop("done", { day_id: "a", status: "visited" }), stop("other", { day_id: "b" })];
    const result = smartPlan(days, stops, "a");
    expect(result.remaining).toBeGreaterThan(0);
    expect(result.placements.length + result.remaining).toBe(15);
    expect(result.placements.every((p) => minutesOf(p.time)! + p.duration <= 1200)).toBe(true);
    expect(new Set(result.placements.map((p) => p.id)).size).toBe(result.placements.length);
    expect(smartPlan([], stops, null).placements).toEqual([]);
  });

  it("uses longer visits for museums and allows longer journeys", () => {
    expect(visitMinutes("museum")).toBeGreaterThan(visitMinutes("cafe"));
    expect(travelMinutes(stop("a"), stop("b", { lat: 41 }))).toBeGreaterThan(travelMinutes(stop("a"), stop("c")));
  });
});
