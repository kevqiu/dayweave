import { describe, expect, it } from "vitest";
import { CLIENT } from "../ui/client.ts";

/**
 * The rules for what a dot on the map looks like, checked rather than looked
 * at.
 *
 * There are five of them interacting — the day's colour, the open day, a day
 * gone by, what the current selection pushes back, and a bed being exempt from
 * all of it — and that is a matrix that goes quietly wrong. `pinLook` and
 * `pinUrl` are pure functions of their arguments and a small piece of state,
 * so they are lifted out of the client script and run here, the way
 * `plan-client.test.ts` runs the Plan view's arithmetic.
 *
 * Lifting by name rather than by copying: if one of these is renamed or
 * removed the extraction fails loudly instead of testing something stale.
 */
function lift(names: readonly string[]) {
  const sources = names.map((name) => {
    const at = [`\nfunction ${name}(`, `\nconst ${name} =`]
      .map((form) => CLIENT.indexOf(form))
      .find((i) => i >= 0);
    if (at === undefined) throw new Error(`the client no longer defines ${name}`);

    // Read to the brace that closes the definition, and take the semicolon
    // after it if there is one. Counting braces beats guessing at line shapes:
    // an object const and a function body end differently.
    let depth = 0;
    let i = at;
    for (; i < CLIENT.length; i++) {
      const ch = CLIENT[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const end = CLIENT[i + 1] === ";" ? i + 2 : i + 1;
    return CLIENT.slice(at, end);
  });

  const state: Record<string, unknown> = { selectedStopId: null };
  const body =
    "const state = arguments[0];\n" +
    "const todayIso = () => \"2026-09-13\";\n" +
    sources.join("\n") +
    "\nreturn { pinLook, pinUrl, routeNumbers, PIN, STATUS_FILL, state };";

  return { api: new Function(body)(state) as any, state };
}

const { api, state } = lift(["STATUS_FILL", "PIN", "statusOf", "routeNumbers", "mutedHue", "pinLook", "pinUrl"]);

const bed = { id: "bed", status: "planned", accommodation: true };
const stop = (id: string, extra = {}) => ({ id, status: "planned", accommodation: false, ...extra });

const today = { date: "2026-09-13", hue: "#57794C", stops: [bed, stop("a"), stop("b")] };
const later = { date: "2026-09-15", hue: "#8C8C4C", stops: [stop("c")] };
const past = { date: "2026-09-11", hue: "#3F6B4A", stops: [stop("d")] };

describe("routeNumbers", () => {
  it("numbers the route and skips the bed", () => {
    // A hotel is not a stop on the route, so it does not take a number and
    // does not push the first real stop to 2.
    expect(api.routeNumbers(today)).toEqual({ a: 1, b: 2 });
  });
});

describe("pinLook", () => {
  it("colours the open day by the day, which is what the list shows", () => {
    state.selectedStopId = null;
    const look = api.pinLook(today, stop("a"), true, 1);
    expect(look.fill).toBe(today.hue);
    expect(look.number).toBe(1);
    expect(look.size).toBe(api.PIN.full);
    expect(look.opacity).toBe(1);
  });

  it("puts every other day on as a mini dot with no number", () => {
    state.selectedStopId = null;
    const look = api.pinLook(later, stop("c"), false, undefined);
    expect(look.fill).toBe(later.hue);
    expect(look.size).toBe(api.PIN.mini);
    expect(look.number).toBe(null);
    expect(look.opacity).toBe(1);
  });

  it("desaturates a day gone by while keeping its hue", () => {
    state.selectedStopId = null;
    const look = api.pinLook(past, stop("d"), false, undefined);
    expect(look.fill).toBe("#4b5f50");
    expect(look.size).toBe(api.PIN.mini);
    expect(look.opacity).toBe(0.5);
  });

  it("desaturates a visited stop on the open day", () => {
    state.selectedStopId = null;
    const look = api.pinLook(today, stop("a", { status: "visited" }), true, 1);
    expect(look.fill).not.toBe(api.STATUS_FILL.done);
    expect(look.fill).not.toBe(today.hue);
    // Still full size and numbered: it is on the day you are looking at.
    expect(look.size).toBe(api.PIN.full);
    expect(look.number).toBe(1);
  });

  describe("when something is selected", () => {
    it("leaves the selected pin alone, and grows it", () => {
      state.selectedStopId = "a";
      const look = api.pinLook(today, stop("a"), true, 1);
      expect(look.opacity).toBe(1);
      expect(look.size).toBe(api.PIN.selected);
      expect(look.ring).toBe("#33302B");
    });

    it("pushes the rest of that day back to 75%", () => {
      state.selectedStopId = "a";
      expect(api.pinLook(today, stop("b"), true, 2).opacity).toBe(0.75);
    });

    it("pushes every other day back to 30%", () => {
      state.selectedStopId = "a";
      expect(api.pinLook(later, stop("c"), false, undefined).opacity).toBe(0.3);
    });

    it("never lifts a faded day back up", () => {
      // A day gone by is already at 0.5; a selection elsewhere may only take
      // it further back, never return it to half.
      state.selectedStopId = "a";
      expect(api.pinLook(past, stop("d"), false, undefined).opacity).toBe(0.3);
    });
  });

  describe("a bed", () => {
    it("keeps its green, its roof and its size whatever day is open", () => {
      state.selectedStopId = null;
      for (const open of [true, false]) {
        const look = api.pinLook(today, bed, open, undefined);
        expect(look.fill).toBe(api.PIN.bed);
        expect(look.roof).toBe(true);
        expect(look.number).toBe(null);
        // Never mini: a bed is exempt from the whole scheme, size included.
        expect(look.size).toBe(api.PIN.full);
      }
    });

    it("is never dimmed by a selection anywhere", () => {
      state.selectedStopId = "a";
      expect(api.pinLook(today, bed, true, undefined).opacity).toBe(1);
      expect(api.pinLook(later, bed, false, undefined).opacity).toBe(1);
    });

    it("is not greyed out by the day being over", () => {
      state.selectedStopId = null;
      const look = api.pinLook(past, bed, false, undefined);
      expect(look.fill).toBe(api.PIN.bed);
      expect(look.opacity).toBe(1);
    });
  });
});

describe("pinUrl", () => {
  const decode = (look: unknown) => decodeURIComponent(api.pinUrl(look).url.split(",")[1]);

  it("writes the number into the disc", () => {
    expect(decode({ fill: "#57794C", size: 22, ring: "#FFFCF6", opacity: 1, number: 3 }))
      .toContain(">3<");
  });

  it("draws a roof instead, and no number, for a bed", () => {
    const svg = decode({ fill: "#3F6B4A", size: 22, ring: "#FFFCF6", opacity: 1, roof: true });
    expect(svg).toContain("M4 11.5L12 5l8 6.5");
    expect(svg).not.toContain("<text");
  });

  it("carries the opacity, so a pushed-back pin really is faint", () => {
    expect(decode({ fill: "#8C8C4C", size: 12, ring: "#FFFCF6", opacity: 0.3 }))
      .toContain('opacity="0.3"');
  });

  it("grows its box with the disc, so the ring is never clipped", () => {
    const small = api.pinUrl({ fill: "#000", size: 12, ring: "#FFF", opacity: 1 });
    const large = api.pinUrl({ fill: "#000", size: 28, ring: "#FFF", opacity: 1 });
    expect(large.box).toBeGreaterThan(small.box);
    expect(small.box).toBeGreaterThan(12);
  });
});
