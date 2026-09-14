import { describe, expect, it, vi } from "vitest";
import { CLIENT } from "../ui/client.ts";

function definition(name: string) {
  const start = CLIENT.search(new RegExp("\\n(?:async )?function " + name + "\\("));
  if (start < 0) throw new Error("Missing " + name);
  let end = CLIENT.indexOf("{", start) + 1;
  let depth = 1;
  for (; depth; end++) {
    if (CLIENT[end] === "{") depth++;
    if (CLIENT[end] === "}") depth--;
  }
  return CLIENT.slice(start, end);
}

function load(names: string[], context: Record<string, unknown>, setup = "") {
  return new Function(...Object.keys(context), setup + names.map(definition).join("\n") + "\nreturn {" + names.join(",") + "};")(...Object.values(context));
}

describe("trip routes", () => {
  it.each(["map", "plan"])("restores a %s trip URL without pushing a new entry", async (view) => {
    const openTrip = vi.fn();
    const api = load(["tripPath", "restoreRoute"], {
      location: { pathname: "/trips/trip%20one" + (view === "plan" ? "/plan" : "") },
      openTrip, showTrips: vi.fn(), setRoute: vi.fn(),
    });
    expect(api.tripPath("trip one", view)).toBe("/trips/trip%20one" + (view === "plan" ? "/plan" : ""));
    await api.restoreRoute();
    expect(openTrip).toHaveBeenCalledWith("trip one", true, view);
  });

  it("returns malformed trip URLs to the trip list", async () => {
    const showTrips = vi.fn();
    const setRoute = vi.fn();
    const api = load(["restoreRoute"], { location: { pathname: "/trips/%zz" }, openTrip: vi.fn(), showTrips, setRoute });
    await api.restoreRoute();
    expect(setRoute).toHaveBeenCalledWith("/", true);
    expect(showTrips).toHaveBeenCalledOnce();
  });

  it("opens the requested trip and Planner view together", async () => {
    const state: any = {};
    const setRoute = vi.fn();
    const api = load(["openTrip", "tripPath"], {
      state, setRoute, api: async () => ({ trip: { id: "trip-one" }, days: [{ id: "day-one", date: "2026-10-01" }] }),
      todayIso: () => "2026-10-01", planDay: vi.fn(), render: vi.fn(),
    }, "let routeTicket = 0;\n");
    await api.openTrip("trip-one", false, "plan");
    expect(setRoute).toHaveBeenCalledWith("/trips/trip-one/plan");
    expect(state).toMatchObject({ screen: "trip", view: "plan", openDayId: "day-one" });
  });

  it("does not reveal an unavailable trip on refresh", async () => {
    const state: any = {};
    const setRoute = vi.fn();
    const api = load(["openTrip"], {
      state, setRoute, api: async () => { throw { status: 404, message: "no such trip" }; }, render: vi.fn(),
    }, "let routeTicket = 0;\n");
    await api.openTrip("private-trip", true, "plan");
    expect(state).toMatchObject({ screen: "trips", trip: null, error: "no such trip" });
    expect(setRoute).toHaveBeenCalledWith("/", true);
  });
});

describe("located accommodations", () => {
  it("draws real stays, includes the current stay in camera bounds, and opens its editor", async () => {
    const stay = { id: "stay", name: "Equator guesthouse", lat: 0, lng: 0, check_in: "2026-10-01", check_out: "2026-10-03" };
    const state = { trip: { days: [{ id: "day", date: "2026-10-02", stops: [] }], lodging: [stay, { ...stay, id: "unlocated", lat: null }] }, openDayId: "day" };
    const host = {};
    const markers: any[] = [];
    class Bounds { points: unknown[] = []; extend(point: unknown) { this.points.push(point); } }
    class Marker {
      options: any; click: (() => void) | undefined;
      constructor(options: any) { this.options = options; markers.push(this); }
      addListener(_event: string, callback: () => void) { this.click = callback; }
    }
    const map = { getDiv: () => host, fitBounds: vi.fn(), setZoom: vi.fn() };
    const openStay = vi.fn();
    const api = load(["paintMap", "locatedStays"], {
      state, mapsKey: () => true, $: () => host,
      loadMaps: async () => ({ LatLngBounds: Bounds, Marker, Size: class {}, Point: class {} }),
      gmap: map, routeNumbers: () => ({}), pinLook: () => ({}), pinUrl: () => ({ url: "pin", box: 32 }),
      fitPadding: () => 24, dayFitKey: () => "day-key", selectStay: openStay, clearLookMarker: vi.fn(), focusSelectedMapStop: () => false, paintDayTrail: vi.fn(),
    }, "let gmarkers = []; let mapFitted = null;\n");
    await api.paintMap();
    expect(markers).toHaveLength(1);
    expect(markers[0].options.position).toEqual({ lat: 0, lng: 0 });
    expect(map.fitBounds.mock.calls[0]![0].points).toEqual([{ lat: 0, lng: 0 }]);
    markers[0].click();
    expect(openStay).toHaveBeenCalledWith(stay);
  });
});

describe("stay search", () => {
  it("shows a skeleton immediately and ignores results after the query is cleared", async () => {
    vi.useFakeTimers();
    try {
      let respond: (value: unknown) => void = () => {};
      const request = new Promise((resolve) => { respond = resolve; });
      const state: any = { stayEdit: { name: "", rows: [] }, trip: { trip: { id: "trip" } } };
      const loading = { hidden: true, parentElement: { setAttribute: vi.fn() } };
      const render = vi.fn();
      const api = load(["onStayInput"], {
        state, $: () => loading, document: { querySelector: () => null }, api: () => request, render,
        clearTimeout, setTimeout,
      }, "let stayTicket=0; let stayTimer=null; const MIN_CHARS=3; const DEBOUNCE_MS=250;\n");
      api.onStayInput({ target: { value: "Central" } });
      expect(loading.hidden).toBe(false);
      await vi.advanceTimersByTimeAsync(250);
      api.onStayInput({ target: { value: "" } });
      expect(loading.hidden).toBe(true);
      respond({ results: [{ name: "Stale result" }] });
      await vi.runAllTimersAsync();
      expect(state.stayEdit.rows).toEqual([]);
      expect(render).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});

describe("search and drag transitions", () => {
  it.each([false, true])("automatically starts map tilt with reduced motion %s without requesting permission", (reduced) => {
    const scene = { style: { setProperty: vi.fn() } };
    const stage = { isConnected: true, querySelector: () => scene, addEventListener: vi.fn(), removeEventListener: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }) };
    const motion = { matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const listeners: Record<string, Function> = {};
    const requestPermission = vi.fn();
    let tick: Function = () => {};
    const context = { document: { hidden: false, querySelector: () => stage }, window: {
      isSecureContext: true, DeviceOrientationEvent: { requestPermission }, screen: { orientation: { angle: 0 } },
      matchMedia: (query: string) => query.includes("coarse") ? { matches: true } : motion,
      addEventListener: vi.fn((name: string, callback: Function) => { listeners[name] = callback; }), removeEventListener: vi.fn(),
    }, requestAnimationFrame: vi.fn((callback: Function) => { tick = callback; return 1; }), cancelAnimationFrame: vi.fn() };
    const api = new Function(...Object.keys(context), "let splashCleanup=null;" + definition("initSplashTilt") + ";return {start:initSplashTilt,stop:()=>splashCleanup?.()};")(...Object.values(context));
    api.start();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(context.requestAnimationFrame).not.toHaveBeenCalled();
    if (reduced) {
      expect(context.window.addEventListener).not.toHaveBeenCalled();
    } else {
      expect(context.window.addEventListener).toHaveBeenCalledWith("deviceorientation", expect.any(Function));
      listeners.deviceorientation!({ beta: null, gamma: null });
      expect(context.requestAnimationFrame).not.toHaveBeenCalled();
      listeners.deviceorientation!({ beta: 40, gamma: 0 });
      tick();
      expect(scene.style.setProperty).toHaveBeenCalledWith("--tilt-x", "0.000deg");
      listeners.deviceorientation!({ beta: 130, gamma: 80 });
      for (let i = 0; i < 120; i++) tick();
      const values = scene.style.setProperty.mock.calls.slice(-2).map(call => parseFloat(call[1]));
      expect(values[0]).toBeGreaterThan(11);
      expect(values[0]).toBeLessThanOrEqual(12);
      expect(values[1]).toBeGreaterThan(15);
      expect(values[1]).toBeLessThanOrEqual(16);
      const pointer = stage.addEventListener.mock.calls.find(call => call[0] === "pointermove")![1];
      pointer({ pointerType: "mouse", clientX: 400, clientY: 0 });
      for (let i = 0; i < 120; i++) tick();
      expect(parseFloat(scene.style.setProperty.mock.calls.slice(-2)[0]![1])).toBeCloseTo(8, 1);
      expect(parseFloat(scene.style.setProperty.mock.calls.slice(-1)[0]![1])).toBeCloseTo(12, 1);
      stage.addEventListener.mock.calls.find(call => call[0] === "pointerleave")![1]();
      for (let i = 0; i < 120; i++) tick();
      expect(parseFloat(scene.style.setProperty.mock.calls.slice(-2)[0]![1])).toBeCloseTo(0, 1);
      expect(parseFloat(scene.style.setProperty.mock.calls.slice(-1)[0]![1])).toBeCloseTo(0, 1);
      motion.matches = true;
      motion.addEventListener.mock.calls[0]![1]();
      expect(scene.style.setProperty).toHaveBeenCalledWith("--tilt-x", "0deg");
      expect(context.cancelAnimationFrame).toHaveBeenCalledWith(1);
      motion.matches = false;
      motion.addEventListener.mock.calls[0]![1]();
      expect(context.window.addEventListener).toHaveBeenCalledTimes(2);
    }
    api.stop();
    if (!reduced) {
      expect(context.window.removeEventListener).toHaveBeenCalledWith("deviceorientation", listeners.deviceorientation);
      expect(motion.removeEventListener).toHaveBeenCalled();
    }
  });

  it("opens a trip from its map preview with a tap or keyboard without hijacking attribution links", () => {
    const openTrip = vi.fn();
    const h = (tag: string, attrs: any, children: any[]) => ({ tag, attrs, children });
    const api = load(["tripCard"], { h, openTrip, avatars: () => null });
    const card = api.tripCard({ id: "trip", name: "Lisbon", members: [], stopCount: 0, visitedCount: 0 });
    const preview = card.children[0];
    expect(preview.attrs.role).toBe("link");
    preview.attrs.onclick({ target: { closest: () => null } });
    expect(openTrip).toHaveBeenCalledWith("trip");
    openTrip.mockClear();
    preview.attrs.onclick({ target: { closest: () => ({}) } });
    expect(openTrip).not.toHaveBeenCalled();
    const target = {};
    const preventDefault = vi.fn();
    preview.attrs.onkeydown({ target, currentTarget: target, key: "Enter", preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(openTrip).toHaveBeenCalledWith("trip");
  });

  it("builds a smooth trail from the current accommodation through every destination in order", () => {
    const api = load(["dayTrailPoints", "smoothTrail"], {});
    const day = { date: "2026-10-02", stops: [
      { location: { lat: 35.1, lng: 130.1 } }, { location: null },
      { location: { lat: 35.2, lng: 130.2 } }, { location: { lat: 35.3, lng: 130.1 } },
    ] };
    const lodging = [
      { lat: 1, lng: 2, check_in: "2026-09-01", check_out: "2026-09-03" },
      { lat: 35, lng: 130, check_in: "2026-10-01", check_out: "2026-10-03" },
    ];
    const points = api.dayTrailPoints(day, lodging);
    expect(points).toEqual([{ lat: 35, lng: 130 }, ...day.stops.filter((stop) => stop.location).map((stop) => stop.location)]);
    const curve = api.smoothTrail(points);
    for (let i = 0; i < points.length; i++) {
      expect(curve[i * 20].lat).toBeCloseTo(points[i].lat);
      expect(curve[i * 20].lng).toBeCloseTo(points[i].lng);
    }
    expect(api.dayTrailPoints(day, [])).toHaveLength(3);
    const crossing = api.smoothTrail([{ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 }]);
    expect(Math.abs(crossing.at(-1).lng - crossing[0].lng)).toBeCloseTo(.2);
  });

  it("moves a subtle opacity crest forward one node every four seconds", () => {
    const api = load(["trailWaveOpacity"], {});
    expect(api.trailWaveOpacity(1, 4000, 4)).toBeCloseTo(.68);
    expect(api.trailWaveOpacity(2, 8000, 4)).toBeCloseTo(.68);
    expect(api.trailWaveOpacity(.8, 4000, 4)).toBeGreaterThan(api.trailWaveOpacity(1.2, 4000, 4));
    for (let time = 0; time < 24000; time += 100) {
      const opacity = api.trailWaveOpacity(1, time, 4);
      expect(opacity).toBeGreaterThanOrEqual(.24);
      expect(opacity).toBeLessThanOrEqual(.68);
    }
  });

  it("keeps the trail still for reduced motion and cancels its timer", () => {
    const clearInterval = vi.fn(), setInterval = vi.fn(() => 9), update = vi.fn();
    const motion = { matches: true };
    const api = load(["stopTrailWave", "animateTrailWave"], { clearInterval, setInterval, window: { matchMedia: () => motion }, performance: { now: () => 0 }, document: { hidden: false } }, "let trailWaveTimer=7;");
    api.animateTrailWave(update);
    expect(clearInterval).toHaveBeenCalledWith(7);
    expect(update).toHaveBeenCalledWith(null);
    expect(setInterval).not.toHaveBeenCalled();
    motion.matches = false;
    api.animateTrailWave(update);
    expect(setInterval).toHaveBeenCalledTimes(1);
    api.stopTrailWave();
    expect(clearInterval).toHaveBeenCalledWith(9);
  });

  it("replaces the previous day's dotted trail instead of accumulating map overlays", () => {
    const previous = { setMap: vi.fn() };
    const lines: any[] = [];
    const state = { openDayId: "day", trip: { days: [{ id: "day", hue: "#7A4FBF" }] } };
    const api = load(["paintDayTrail"], { stopTrailWave: vi.fn(), animateTrailWave: vi.fn(), state, gmap: {}, dayTrailPoints: () => [{ lat: 1, lng: 2 }, { lat: 2, lng: 3 }], smoothTrail: (points: unknown) => points, previous }, "let mapTrails=[previous];");
    api.paintDayTrail({ Polyline: class { constructor(public options: unknown) { lines.push(this); } }, SymbolPath: { CIRCLE: "circle" } });
    expect(previous.setMap).toHaveBeenCalledWith(null);
    expect(lines[0].options.icons[0].icon.fillColor).toBe("#7A4FBF");
    expect(lines[0].options.clickable).toBe(false);
  });
  it("focuses a selected accommodation and skips stays without coordinates", () => {
    const state: any = { sheetTab: "stays", selectedStayId: "stay", trip: { days: [], lodging: [
      { id: "stay", lat: 35, lng: 130 }, { id: "unlocated", lat: null, lng: null },
    ] } };
    const gmap = { getZoom: () => 12, setZoom: vi.fn(), panTo: vi.fn() };
    const api = load(["focusSelectedMapStop"], { state, gmap, fitPadding: () => ({ top: 40, bottom: 40, left: 40, right: 40 }) }, "let focusedMapStop=null; let mapFitted=null;");
    expect(api.focusSelectedMapStop()).toBe(true);
    expect(gmap.setZoom).toHaveBeenCalledWith(15);
    expect(gmap.panTo.mock.calls[0]![0].lat).toBeCloseTo(35);
    expect(gmap.panTo.mock.calls[0]![0].lng).toBe(130);
    api.focusSelectedMapStop();
    expect(gmap.panTo).toHaveBeenCalledOnce();
    state.selectedStayId = "unlocated";
    expect(api.focusSelectedMapStop()).toBe(false);
    expect(gmap.panTo).toHaveBeenCalledOnce();
  });
  it("zooms to each selected stop once and leaves it visible above the mobile drawer", () => {
    const state = { selectedStopId: "a", trip: { days: [{ stops: [
      { id: "a", location: { lat: 35, lng: 130 } }, { id: "b", location: { lat: 36, lng: 131 } },
    ] }] } };
    const gmap = { getZoom: () => 12, setZoom: vi.fn(), panTo: vi.fn() };
    const api = load(["focusSelectedMapStop"], { state, gmap, fitPadding: () => ({ top: 60, bottom: 400, left: 40, right: 40 }) }, "let focusedMapStop=null; let mapFitted=null;");
    expect(api.focusSelectedMapStop()).toBe(true);
    expect(gmap.setZoom).toHaveBeenCalledWith(15);
    expect(gmap.panTo.mock.calls[0]![0].lat).toBeLessThan(35);
    expect(gmap.panTo.mock.calls[0]![0].lng).toBe(130);
    api.focusSelectedMapStop();
    expect(gmap.panTo).toHaveBeenCalledOnce();
    state.selectedStopId = "b";
    api.focusSelectedMapStop();
    expect(gmap.panTo).toHaveBeenCalledTimes(2);
    state.selectedStopId = "";
    expect(api.focusSelectedMapStop()).toBe(false);
  });
  it("closes search before changing the desktop day", () => {
    const state: any = { search: {}, openDayId: "first", selectedStopId: "stop" };
    let afterClose: () => void = () => {};
    const render = vi.fn();
    const api = load(["switchMapDay"], { state, render, closeThen: (_depth: number, callback: () => void) => { afterClose = callback; } });
    api.switchMapDay("second");
    expect(state.openDayId).toBe("first");
    expect(render).not.toHaveBeenCalled();
    state.search = null;
    afterClose();
    expect(state).toMatchObject({ openDayId: "second", selectedStopId: null });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens a mobile date after one second while keeping the dragged card", () => {
    const state: any = { drag: { hoverDayId: "second", hoverStart: 0, x: 150, y: 70 }, trayOpen: true };
    let now = 999;
    const resolveDropTarget = vi.fn();
    const render = vi.fn();
    const api = load(["hoverTick", "openHoveredDay"], {
      state, performance: { now: () => now }, planning: () => true, wideNow: () => false,
      document: { querySelectorAll: () => [] }, requestAnimationFrame: vi.fn(),
      endHover: vi.fn(), render, resolveDropTarget, paintDrag: vi.fn(),
    }, "let hoverFrame = null;");
    api.hoverTick();
    expect(render).not.toHaveBeenCalled();
    now = 1000;
    api.hoverTick();
    expect(state).toMatchObject({ openDayId: "second", planDayId: "second", trayOpen: false });
    expect(state.drag).toBeTruthy();
    expect(resolveDropTarget).toHaveBeenCalledWith(150, 70);
  });

  it("fits every search suggestion and highlights a selection without hiding the others", () => {
    const rows = [
      { placeId: "a", name: "First", location: { lat: 1, lng: 2 } },
      { placeId: "b", name: "Second", location: { lat: 3, lng: 4 } },
    ];
    const state = { search: { rows, lookingAt: null as string | null } };
    const markers: any[] = [];
    class Bounds { points: unknown[] = []; extend(point: unknown) { this.points.push(point); } }
    class Marker {
      setMap = vi.fn(); addListener = vi.fn();
      constructor(public options: any) { markers.push(this); }
    }
    const maps = { Marker, LatLngBounds: Bounds, Size: class {}, Point: class {} };
    const gmap = { fitBounds: vi.fn(), setZoom: vi.fn() };
    const api = load(["paintSuggestionPins"], { state, gmap, window: { __LOOK_PIN__: "pin" }, fitPadding: () => 24, lookAt: vi.fn() }, "let suggestionMarkers=[]; let suggestionFitKey=null;");
    api.paintSuggestionPins(maps);
    expect(markers.map((marker) => marker.options.position)).toEqual(rows.map((row) => row.location));
    expect(gmap.fitBounds.mock.calls[0]![0].points).toEqual(rows.map((row) => row.location));
    state.search.lookingAt = "b";
    api.paintSuggestionPins(maps);
    expect(markers[0].setMap).toHaveBeenCalledWith(null);
    expect(markers.slice(2).map((marker) => marker.options.zIndex)).toEqual([50, 60]);
    expect(gmap.fitBounds).toHaveBeenCalledOnce();
  });
});
