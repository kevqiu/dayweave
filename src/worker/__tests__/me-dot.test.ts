import { describe, expect, it, vi } from "vitest";
import { CLIENT } from "../ui/client.ts";

/**
 * The dot for where you are: it pulses only while the position is live, and
 * goes grey and still once it is not. Lifted out of the client script by name
 * and driven with a stand-in geolocation and a stand-in google.maps.
 */
function definition(name: string) {
  const start = CLIENT.indexOf(`\nfunction ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  let end = CLIENT.indexOf("{", start) + 1;
  for (let depth = 1; depth; end++) {
    if (CLIENT[end] === "{") depth++;
    if (CLIENT[end] === "}") depth--;
  }
  return CLIENT.slice(start, end);
}

const NAMES = ["goToMe", "centreOnMe", "followMe", "stopFollowingMe", "sawMe", "lostMe", "keepUpWithMe", "paintMe"];

function setup({ permission = "prompt" as string, hidden = false } = {}) {
  const watches: { ok: (p: unknown) => void; fail: (e: unknown) => void }[] = [];
  const geolocation = {
    watchPosition: vi.fn((ok, fail) => { watches.push({ ok, fail }); return watches.length; }),
    clearWatch: vi.fn(),
  };
  const permissionStatus: { state: string; onchange: null | (() => void) } = { state: permission, onchange: null };
  const navigator = { geolocation, permissions: { query: vi.fn(async () => permissionStatus) } };

  const el = {
    className: "", style: {} as Record<string, string>, classes: new Set<string>(),
    classList: { toggle(name: string, on: boolean) { on ? el.classes.add(name) : el.classes.delete(name); } },
    append: vi.fn(), setAttribute: vi.fn(), remove: vi.fn(),
  };
  const gmap = { getZoom: vi.fn(() => 12), setZoom: vi.fn(), panTo: vi.fn() };
  class OverlayView {
    map: unknown = null; onAdd!: () => void; draw!: () => void; onRemove!: () => void;
    getMap() { return this.map; }
    setMap(map: unknown) {
      if (this.map && !map) this.onRemove();
      this.map = map;
      if (map) { this.onAdd(); this.draw(); }
    }
    getPanes() { return { overlayLayer: { append: vi.fn() } }; }
    getProjection() { return { fromLatLngToDivPixel: (at: { lat: number; lng: number }) => ({ x: at.lng, y: at.lat }) }; }
  }
  class LatLng { constructor(public lat: number, public lng: number) {} }

  const state: Record<string, unknown> = { error: null };
  const render = vi.fn();
  const context = {
    state, render, navigator, gmap,
    window: { google: { maps: { OverlayView, LatLng } } },
    document: { hidden, createElement: () => el },
    $: () => ({}), wideNow: () => true, fitPadding: () => ({}), dayFitKey: () => "day-key",
    paddedMapCenter: (at: unknown) => at,
  };
  const prelude =
    "let me = null; let meOverlay = null; let meWatch = null; let meWanted = false;\n" +
    "let meCentreNext = false; let mePermission = null; let locating = false; let mapFitted = null;\n";
  const api = new Function(...Object.keys(context),
    prelude + NAMES.map(definition).join("\n") +
    "\nreturn {" + NAMES.join(",") + ", peek: () => ({ me, meWatch, locating, mapFitted, meWanted }) };",
  )(...Object.values(context));

  const fix = (lat: number, lng: number) => ({ coords: { latitude: lat, longitude: lng } });
  return { api, watches, geolocation, permissionStatus, el, gmap, state, fix };
}

describe("where you are", () => {
  it("asks nobody until the button is pressed", async () => {
    const { api, geolocation } = setup();
    api.keepUpWithMe();
    await Promise.resolve();
    await Promise.resolve();
    expect(geolocation.watchPosition).not.toHaveBeenCalled();
  });

  it("follows by itself when the site is already allowed", async () => {
    const { api, geolocation } = setup({ permission: "granted" });
    api.keepUpWithMe();
    await vi.waitFor(() => expect(geolocation.watchPosition).toHaveBeenCalledOnce());
  });

  it("pulses while live, centres once, and moves without stealing the camera", () => {
    const { api, watches, el, gmap, fix } = setup();
    api.goToMe();
    expect(api.peek().locating).toBe(true);
    watches[0]!.ok(fix(33.59, 130.4));
    expect(el.classes.has("live")).toBe(true);
    expect(el.style).toEqual({ left: "130.4px", top: "33.59px" });
    expect(gmap.panTo).toHaveBeenCalledWith({ lat: 33.59, lng: 130.4 });
    expect(gmap.setZoom).toHaveBeenCalledWith(16);
    expect(api.peek()).toMatchObject({ locating: false, mapFitted: "day-key" });

    watches[0]!.ok(fix(33.6, 130.41));
    expect(el.style).toEqual({ left: "130.41px", top: "33.6px" });
    expect(gmap.panTo).toHaveBeenCalledOnce();
  });

  it("goes still when the signal is lost, and pulses again when it comes back", () => {
    const { api, watches, el, state, fix } = setup();
    api.goToMe();
    watches[0]!.ok(fix(33.59, 130.4));
    watches[0]!.fail({ code: 3 });
    expect(el.classes.has("live")).toBe(false);
    expect(api.peek().me.at).toEqual({ lat: 33.59, lng: 130.4 });
    // Nobody pressed anything, so nothing is reported.
    expect(state.error).toBeNull();
    watches[0]!.ok(fix(33.59, 130.4));
    expect(el.classes.has("live")).toBe(true);
  });

  it("goes still when the map is left, and stops the GPS", () => {
    const { api, watches, el, geolocation, fix } = setup();
    api.goToMe();
    watches[0]!.ok(fix(33.59, 130.4));
    api.stopFollowingMe();
    expect(geolocation.clearWatch).toHaveBeenCalledWith(1);
    expect(el.classes.has("live")).toBe(false);
    expect(api.peek().meWanted).toBe(true);
    api.keepUpWithMe();
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2);
  });

  it("takes the dot away when refused, and says so when asked", () => {
    const { api, watches, el, state, geolocation } = setup();
    api.goToMe();
    watches[0]!.fail({ code: 1 });
    expect(state.error).toBe("This phone is not sharing where it is");
    expect(geolocation.clearWatch).toHaveBeenCalled();
    expect(api.peek()).toMatchObject({ me: null, meWatch: null, meWanted: false, locating: false });
    expect(el.remove).not.toHaveBeenCalled();
  });
});
