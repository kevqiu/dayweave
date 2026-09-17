import { describe, expect, it, vi } from "vitest";
import { CLIENT } from "../ui/client.ts";

function definition(name: string) {
  const start = CLIENT.indexOf(`\nfunction ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const body = CLIENT.indexOf("{", start);
  let depth = 1;
  let end = body + 1;
  while (depth && end < CLIENT.length) {
    if (CLIENT[end] === "{") depth++;
    if (CLIENT[end] === "}") depth--;
    end++;
  }
  return CLIENT.slice(start, end);
}

describe("map camera across UI updates", () => {
  it("retains the existing map host when a rerender rebuilds the screen", () => {
    const mapHost = { camera: { lat: 35.01, lng: 135.76, zoom: 16 } };
    const replacement = { replaceWith: vi.fn() };
    const paint = vi.fn();
    const context = {
      state: { screen: "trip", view: "map" },
      document: { title: "Dayweave", querySelectorAll: () => [], querySelector: () => null },
      gridViewportHeight: 0,
      frame: { replaceChildren: vi.fn(), append: vi.fn() },
      planning: () => false, wideNow: () => true,
      positionEditors: vi.fn(), splashCleanup: null, stopTrailWave: vi.fn(),
      screenTripDesk: () => replacement,
      $: () => replacement, gmap: { getDiv: () => mapHost }, paintMap: paint,
    };
    const run = new Function(...Object.keys(context), definition("render") + "\nreturn render;")(...Object.values(context));
    run();
    run();
    expect(replacement.replaceWith).toHaveBeenCalledTimes(2);
    expect(replacement.replaceWith).toHaveBeenLastCalledWith(mapHost);
    expect(mapHost.camera).toEqual({ lat: 35.01, lng: 135.76, zoom: 16 });
    expect(paint).toHaveBeenCalledTimes(2);
  });

  it("refits for a different trip or changed location but not a checkbox update", () => {
    const state = { openDayId: "day", trip: { trip: { id: "trip-a" }, days: [{ id: "day", stops: [{ id: "stop", status: "planned", location: { lat: 35, lng: 135 } }] }] } };
    const key = new Function("state", definition("dayFitKey") + "\nreturn dayFitKey;")(state);
    const before = key();
    state.trip.days[0]!.stops[0]!.status = "visited";
    expect(key()).toBe(before);
    state.trip.days[0]!.stops[0]!.location.lat = 36;
    expect(key()).not.toBe(before);
    const relocated = key();
    state.trip.trip.id = "trip-b";
    expect(key()).not.toBe(relocated);
  });
});
