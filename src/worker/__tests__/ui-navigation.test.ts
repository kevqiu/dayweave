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
      fitPadding: () => 24, dayFitKey: () => "day-key", selectStay: openStay, clearLookMarker: vi.fn(), focusSelectedMapStop: () => false,
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
