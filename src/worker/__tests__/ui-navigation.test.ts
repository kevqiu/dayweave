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
  it.each([true, false])("offers the correct trip action for isOwner=%s", (isOwner) => {
    const h = (tag: string, attrs: any, children: any[]) => ({ tag, attrs, children, hidePopover: vi.fn() });
    const confirmTripRemoval = vi.fn();
    const api = load(["tripCardSettings"], { h, icon: () => null, confirmTripRemoval });
    const trip = { id: "trip", name: "Lisbon", isOwner };
    const settings = api.tripCardSettings(trip);
    const menu = settings.children[1];
    const action = menu.children[0];
    expect(action.children[1]).toBe(isOwner ? "Delete trip" : "Leave Trip");
    expect(confirmTripRemoval).not.toHaveBeenCalled();
    action.attrs.onclick();
    expect(menu.hidePopover).toHaveBeenCalledOnce();
    expect(confirmTripRemoval).toHaveBeenCalledWith(trip);
  });

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

describe("bug bash regressions", () => {
  it("keeps the clicked day at the same viewport position when an earlier day closes", () => {
    const state = { openDayId: "first" };
    let top = 600;
    const scroll = { scrollTop: 900 };
    const anchor = { dataset: { dayId: "last" }, getBoundingClientRect: () => ({ top }) };
    const api = load(["switchMapDay"], { state, document: { querySelectorAll: () => [anchor], querySelector: () => scroll }, render: () => { top = 280; } });
    api.switchMapDay("last");
    expect(state.openDayId).toBe("last");
    expect(scroll.scrollTop).toBe(580);
  });

  it("selecting a map node reveals its day and clears a filter that would hide it", () => {
    const state = { hideVisited: true, selectedStayId: "hotel", sheetTab: "stays" };
    const api = load(["selectMapStop"], { state, render: vi.fn() });
    api.selectMapStop({ id: "last" }, { id: "stop" });
    expect(state).toMatchObject({ openDayId: "last", selectedStopId: "stop", revealStopId: "stop", hideVisited: false, selectedStayId: null, sheetTab: "stops" });
  });

  it.each([null, "b"])("uses the suggested insertion on the client and in the move request: %s", (afterStopId) => {
    const stop = { id: "a" };
    const source = [stop];
    const target = [{ id: "b" }, { id: "c" }];
    const state: any = { move: { stop }, trip: { days: [{ id: "target", stops: target }] } };
    const post = vi.fn();
    let undo: Function = () => {};
    const api = load(["moveTo"], { state, closeLayer: vi.fn(), locateStop: () => ({ list: source, index: 0, stop }), post, optimistic: (apply: Function, request: Function) => { undo = apply(); request(); } });
    api.moveTo("target", afterStopId);
    expect(target.map((s) => s.id)).toEqual(afterStopId === null ? ["a", "b", "c"] : ["b", "a", "c"]);
    expect(post).toHaveBeenCalledWith("/api/stops/a/move", { dayId: "target", afterStopId });
    undo();
    expect(source).toEqual([stop]);
    expect(target.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("reorders within the untimed band without assigning a clock time", () => {
    const state = { drag: { stopId: "a" } };
    const col = { dataset: { dayId: "day" }, querySelectorAll: () => [{ dataset: { stopId: "b" }, style: { top: "720" }, offsetHeight: 50 }] };
    const api = load(["resolveGridDrop"], { state, spanOf: () => ({ height: 660 }), dayById: () => ({ stops: [{ id: "b", time: "" }] }), PLAN: { minutesOf: () => null } });
    api.resolveGridDrop(col, 760);
    expect(state.drag).toMatchObject({ gridTime: "", afterStopId: "b", gridY: null });
  });

  it("reports the missing stay name inline without creating an obstructing toast", () => {
    const field = { value: "", focus: vi.fn() };
    const state: any = { stayEdit: { name: "", start: "2026-09-24", end: "2026-09-27" }, error: null };
    const api = load(["saveStay"], { state, $: () => field, render: vi.fn() });
    api.saveStay();
    expect(state.stayEdit.error).toBe("Enter a name for this stay.");
    expect(state.error).toBeNull();
    expect(field.focus).toHaveBeenCalled();
  });

  it("keeps the splash mounted through pending OAuth and a failed retry", async () => {
    const state: any = { signingIn: false, error: null };
    let reject: (error: Error) => void = () => {};
    const post = vi.fn(() => new Promise((_resolve, fail) => { reject = fail; }));
    const button = { disabled: false, setAttribute: vi.fn(), lastElementChild: { textContent: "" }, before: vi.fn() };
    const render = vi.fn();
    const api = load(["signInWithGoogle", "updateSignInStatus"], {
      state, post, render, location: { pathname: "/" }, window: { location: {} },
      document: { querySelector: (selector: string) => selector === ".signin-google" ? button : null },
      h: (_tag: string, props: unknown) => props,
    });
    const signingIn = api.signInWithGoogle();
    await api.signInWithGoogle();
    expect(post).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    expect(button.lastElementChild.textContent).toBe("Taking you to Google…");
    reject(new Error("Try again"));
    await signingIn;
    expect(button.disabled).toBe(false);
    expect(button.before).toHaveBeenCalledWith(expect.objectContaining({ role: "alert", text: "Try again" }));
    expect(render).not.toHaveBeenCalled();
  });

  it("adds distinct repeat visits and preserves the original membership after failure", () => {
    const original = { id: "original" };
    const day = { id: "day", label: "Thursday", stops: [original] };
    const state = { search: { dayId: "day" }, trip: { trip: { id: "trip" }, days: [day] } };
    const undo: Function[] = [];
    const post = vi.fn();
    const api = load(["addPlace"], { state, crypto, post, optimistic: (apply: Function, request: Function) => { undo.push(apply()); request(); } });
    const row = { placeId: "place", name: "Cafe", onTrip: true, onTripDay: "Wednesday" };
    api.addPlace(row);
    api.addPlace(row);
    expect(new Set(day.stops.map((stop) => stop.id)).size).toBe(3);
    expect(post).toHaveBeenCalledTimes(2);
    undo[1]!();
    undo[0]!();
    expect(day.stops).toEqual([original]);
    expect(row).toMatchObject({ onTrip: true, onTripDay: "Wednesday" });
  });

  it("saves the day immediately on Done without replaying the pending autosave", async () => {
    vi.useFakeTimers();
    try {
      const day = { id: "day", name: "Old" };
      const state = { dayEdit: "day" };
      const post = vi.fn(async () => ({}));
      const api = load(["queueDayName", "finishDayEdit"], { state, post, render: vi.fn(), clearTimeout, setTimeout }, 'let dayNameTimer=null; let dayNameBefore="Old";');
      api.queueDayName(day, "New name");
      api.finishDayEdit(day);
      expect(state.dayEdit).toBeNull();
      expect(post).toHaveBeenCalledWith("/api/days/day", { name: "New name" });
      await vi.runAllTimersAsync();
      expect(post).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it.each([false, true])("centers search in the visible map with desktop=%s", async (wide) => {
    const location = { lat: 35, lng: 130 };
    const zoom = 15;
    const padding = { top: 50, bottom: 410, left: 24, right: 24 };
    const gmap = { panTo: vi.fn(), getZoom: () => zoom };
    const api = load(["centreOnResult", "paddedMapCenter"], { loadMaps: async () => ({}), gmap, wideNow: () => wide, fitPadding: () => padding });
    await api.centreOnResult({ location });
    const center = gmap.panTo.mock.calls[0]![0];
    const project = (lat: number) => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 256 * 2 ** zoom;
    expect(project(location.lat) - project(center.lat)).toBeCloseTo(wide ? 0 : -180);
    expect(center.lng).toBe(location.lng);
  });

  it("fits accommodation popovers below top rows and above bottom rows", () => {
    const api = load(["floatingPosition"], {});
    const bounds = { left: 8, top: 8, right: 367, bottom: 659 };
    const size = { width: 340, height: 180 };
    expect(api.floatingPosition({ left: 20, right: 350, top: 84, bottom: 114 }, size, bounds)).toEqual({ left: 10, top: 120, maxHeight: 180 });
    expect(api.floatingPosition({ left: 20, right: 350, top: 600, bottom: 630 }, size, bounds)).toEqual({ left: 10, top: 414, maxHeight: 180 });
    const tall = api.floatingPosition({ left: 20, right: 350, top: 300, bottom: 330 }, { width: 340, height: 900 }, bounds);
    expect(tall.top + tall.maxHeight).toBeLessThanOrEqual(bounds.bottom);
  });

  it("orders a changeover day from the departing stay to the arriving stay", () => {
    const departing = { id: "a", check_in: "2026-10-01", check_out: "2026-10-04", lat: 35, lng: 130 };
    const arriving = { id: "b", check_in: "2026-10-04", check_out: "2026-10-07", lat: 36, lng: 131 };
    const day = { date: "2026-10-04", stops: [{ location: { lat: 35.5, lng: 130.5 } }] };
    const state = { trip: { lodging: [arriving, departing] } };
    const api = load(["dayStays", "dayRoutePoints"], { state });
    expect(api.dayStays(day)).toEqual([departing, arriving]);
    expect(api.dayRoutePoints(day, state.trip.lodging)).toEqual([{ lat: 35, lng: 130 }, day.stops[0]!.location, { lat: 36, lng: 131 }]);
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
    const api = load(["paintMap", "locatedStays", "unplannedDay"], {
      state, mapsKey: () => true, $: () => host,
      loadMaps: async () => ({ LatLngBounds: Bounds, Marker, Size: class {}, Point: class {} }),
      gmap: map, routeNumbers: () => ({}), pinLook: () => ({}), pinUrl: () => ({ url: "pin", box: 32 }),
      fitPadding: () => 24, dayFitKey: () => "day-key", selectStay: openStay, clearLookMarker: vi.fn(), focusSelectedMapStop: () => false, paintDayRoute: vi.fn(),
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
    const api = load(["tripCard", "tripCardSettings"], { h, openTrip, avatars: () => null, icon: () => null });
    const card = api.tripCard({ id: "trip", name: "Lisbon", members: [], stopCount: 0, visitedCount: 0 });
    const preview = card.children.find((child: any) => child.attrs.class === "trip-card-map");
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
    const api = load(["dayRoutePoints", "smoothTrail"], {});
    const day = { date: "2026-10-02", stops: [
      { location: { lat: 35.1, lng: 130.1 } }, { location: null },
      { location: { lat: 35.2, lng: 130.2 } }, { location: { lat: 35.3, lng: 130.1 } },
    ] };
    const lodging = [
      { lat: 1, lng: 2, check_in: "2026-09-01", check_out: "2026-09-03" },
      { lat: 35, lng: 130, check_in: "2026-10-01", check_out: "2026-10-03" },
    ];
    const points = api.dayRoutePoints(day, lodging);
    expect(points).toEqual([{ lat: 35, lng: 130 }, ...day.stops.filter((stop) => stop.location).map((stop) => stop.location)]);
    const curve = api.smoothTrail(points);
    for (let i = 0; i < points.length; i++) {
      expect(curve[i * 20].lat).toBeCloseTo(points[i].lat);
      expect(curve[i * 20].lng).toBeCloseTo(points[i].lng);
    }
    expect(api.dayRoutePoints(day, [])).toHaveLength(3);
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
    const api = load(["paintDayRoute"], { stopTrailWave: vi.fn(), animateTrailWave: vi.fn(), state, gmap: {}, dayRoutePoints: () => [{ lat: 1, lng: 2 }, { lat: 2, lng: 3 }], smoothTrail: (points: unknown) => points, previous }, "let mapTrails=[previous];");
    api.paintDayRoute({ Polyline: class { constructor(public options: unknown) { lines.push(this); } }, SymbolPath: { CIRCLE: "circle" } });
    expect(previous.setMap).toHaveBeenCalledWith(null);
    expect(lines[0].options.icons[0].icon.fillColor).toBe("#7A4FBF");
    expect(lines[0].options.clickable).toBe(false);
    const dotsOnScreen = (length: number) => lines[0].options.icons.flatMap((sequence: any) => {
      expect(sequence.offset).toMatch(/px$/);
      expect(sequence.repeat).toMatch(/px$/);
      const dots = [];
      for (let at = parseFloat(sequence.offset); at <= length; at += parseFloat(sequence.repeat)) dots.push(at);
      return dots;
    }).sort((a: number, b: number) => a - b);
    for (const length of [160, 1600, 16000]) {
      const dots = dotsOnScreen(length);
      expect(dots).toHaveLength(length / 8 + 1);
      expect(dots.every((dot: number, i: number) => !i || dot - dots[i - 1] === 8)).toBe(true);
    }
  });
  it("focuses a selected accommodation and skips stays without coordinates", () => {
    const state: any = { sheetTab: "stays", selectedStayId: "stay", trip: { days: [], lodging: [
      { id: "stay", lat: 35, lng: 130 }, { id: "unlocated", lat: null, lng: null },
    ] } };
    const gmap = { getZoom: () => 12, setZoom: vi.fn(), panTo: vi.fn() };
    const api = load(["focusSelectedMapStop", "paddedMapCenter"], { state, gmap, fitPadding: () => ({ top: 40, bottom: 40, left: 40, right: 40 }) }, "let focusedMapStop=null; let mapFitted=null;");
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
    const api = load(["focusSelectedMapStop", "paddedMapCenter"], { state, gmap, fitPadding: () => ({ top: 60, bottom: 400, left: 40, right: 40 }) }, "let focusedMapStop=null; let mapFitted=null;");
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
    const api = load(["switchMapDay"], { state, render, document: { querySelectorAll: () => [], querySelector: () => null }, closeThen: (_depth: number, callback: () => void) => { afterClose = callback; } });
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


describe("planner gesture regressions", () => {
  it("expires synthetic-click suppression and never commits cancelled drags", () => {
    vi.useFakeTimers();
    try {
      const handlers: Record<string, Function> = {};
      const state: any = { trayOpen: false };
      let down: Function = () => {};
      const handle = { closest: () => null, addEventListener: (_: string, fn: Function) => { down = fn; } };
      const commitDrag = vi.fn();
      const context = { state, h: () => handle, ICONS: {}, window: { addEventListener: (name: string, fn: Function) => { handlers[name] = fn; }, removeEventListener: vi.fn() }, render: vi.fn(), endHover: vi.fn(), commitDrag, requestAnimationFrame: vi.fn(), cancelAnimationFrame: vi.fn(), setTimeout };
      const api = new Function(...Object.keys(context), "let suppressTap=false;" + definition("dragHandle") + ";return {dragHandle, suppressed:()=>suppressTap};")(...Object.values(context));
      api.dragHandle({ id: "a" }, { id: "s" });
      down({ clientX: 50, clientY: 100, preventDefault() {}, stopPropagation() {} });
      state.drag.moved = true;
      handlers.pointerup!({ type: "pointerup" });
      expect(commitDrag).toHaveBeenCalledOnce();
      expect(api.suppressed()).toBe(true);
      vi.runAllTimers();
      expect(api.suppressed()).toBe(false);
      down({ clientX: 50, clientY: 100, preventDefault() {}, stopPropagation() {} });
      state.drag.moved = true;
      handlers.pointercancel!({ type: "pointercancel" });
      expect(commitDrag).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it("rejects drops over the clipped portion above the calendar", () => {
    const state: any = { drag: {} };
    const viewport = { getBoundingClientRect: () => ({ top: 100, bottom: 600, left: 0, right: 500 }) };
    const wrap = { dataset: { dayId: "a", grid: "1" }, closest: (selector: string) => selector === ".grid-scroll" ? viewport : null, getBoundingClientRect: () => ({ top: -300, bottom: 1000, left: 0, right: 500 }) };
    const resolveGridDrop = vi.fn();
    const api = load(["resolveDropTarget"], { state, planning: () => false, document: { querySelectorAll: () => [wrap] }, reachForDrawer: vi.fn(), endHover: vi.fn(), resolveGridDrop });
    api.resolveDropTarget(200, 60);
    expect(state.drag.outside).toBe(true);
    expect(resolveGridDrop).not.toHaveBeenCalled();
    api.resolveDropTarget(200, 120);
    expect(resolveGridDrop).toHaveBeenCalledOnce();
  });

  it("converts distance preferences without changing the source text", () => {
    const api = load(["displayDistance", "unitPreferences"], { localStorage: { getItem: () => '{"distance":"mi"}' } });
    expect(api.displayDistance("park · 7 km")).toBe("park · 4.3 mi");
    expect(api.displayDistance("cafe · 500 m")).toBe("cafe · 0.3 mi");
  });
});


describe("desktop planner sizing", () => {
  it.each([0, 180])("keeps the stretched clock and card coordinates when picking up and releasing a card (band %s)", (band) => {
    const state: any = { trip: { trip: { id: "trip" } }, drag: null };
    let resize: () => void = () => {};
    const h = (_tag: string, _props: unknown, children: any[]) => ({
      children, isConnected: true, clientHeight: 1200,
      replaceChildren(...next: any[]) { this.children = next; },
    });
    class ResizeObserver {
      constructor(callback: () => void) { resize = callback; }
      disconnect() {}
      observe() {}
    }
    const gridContent = (_days: unknown, span: any) => ({ height: span.height, noonY: (720 - span.from) * span.height / (span.to - span.from) });
    const swipeDays = vi.fn();
    const api = load(["gridScroll"], { state, h, ResizeObserver, gridContent, swipeDays }, "let gridObserver=null; let gridViewportHeight=0;");
    const span = () => ({ from: 480, to: 1380, height: 660 });
    const before = api.gridScroll([{ id: "day" }], span(), band, true);
    resize();
    expect(before.children[0].height).toBeGreaterThan(660);
    state.drag = { stopId: "stop" };
    const during = api.gridScroll([{ id: "day" }], span(), band, true);
    resize();
    expect(during.children).toEqual(before.children);
    state.drag = null;
    const after = api.gridScroll([{ id: "day" }], span(), band, true);
    expect(after.children).toEqual(before.children);
    const mobile = api.gridScroll([{ id: "day" }], span(), band, false);
    expect(mobile.children[0].height).toBe(660);
    expect(swipeDays).toHaveBeenCalledWith(mobile);
  });
});
