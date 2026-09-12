import { describe, expect, it } from "vitest";
import { formatDistance, suggestDays, type CandidateDay, type MovingStop } from "../suggest.ts";

const at = (lat: number, lng: number) => ({ lat, lng });

// Three points a few hundred metres apart in Hakata, and one in Kagoshima.
const CANAL = at(33.5897, 130.4107);
const KUSHIDA = at(33.5932, 130.4106);
const NAKASU = at(33.5926, 130.4056);
const SAKURAJIMA = at(31.5966, 130.5571);

const day = (over: Partial<CandidateDay> & { id: string; date: string }): CandidateDay => ({
  label: "Sat Oct 3",
  placeLabel: "Fukuoka",
  hue: "#70864D",
  city: "Fukuoka",
  stops: [],
  ...over,
});

const stop: MovingStop = {
  id: "s1",
  name: "Hikiniku to Come",
  location: NAKASU,
  city: "Fukuoka",
  currentDayId: "d0",
};

const TODAY = "2026-10-01";

describe("suggestDays", () => {
  it("picks the day whose path bends least", () => {
    const { best } = suggestDays(stop, [
      day({
        id: "d1",
        date: "2026-10-03",
        stops: [
          { id: "a", name: "Canal City", location: CANAL },
          { id: "b", name: "Kushida Shrine", location: KUSHIDA },
        ],
      }),
      day({
        id: "d2",
        date: "2026-10-04",
        city: "Kagoshima",
        placeLabel: "Kagoshima",
        stops: [{ id: "c", name: "Sakurajima", location: SAKURAJIMA }],
      }),
    ], TODAY);

    expect(best?.dayId).toBe("d1");
    // Tacking it on the end adds one leg; slotting it between two stops adds
    // two and removes one. Here the single leg is the cheaper of the two, so
    // that is what it proposes.
    expect(best?.after).toBe("Kushida Shrine");
    expect(best?.before).toBeNull();
    expect(best?.detail).toContain("Slots in after Kushida Shrine.");
    expect(best?.detail).toMatch(/adds \d+ min of walking to the day/);
  });

  it("slots into the middle when that is what bends the path least", () => {
    // Two stops 4 km apart with the moving stop almost exactly between them:
    // going via it is nearly free, while tacking it on the end is a 2 km walk.
    const north = at(33.62, 130.4);
    const south = at(33.58, 130.4);
    const between = { ...stop, location: at(33.6, 130.4009) };

    const { best } = suggestDays(between, [
      day({
        id: "d1",
        date: "2026-10-03",
        stops: [
          { id: "a", name: "Ohori Park", location: south },
          { id: "b", name: "Ainoshima ferry", location: north },
        ],
      }),
    ], TODAY);

    expect(best?.after).toBe("Ohori Park");
    expect(best?.before).toBe("Ainoshima ferry");
    expect(best?.detail).toContain("Slots in after Ohori Park and before Ainoshima ferry.");
  });

  it("drops a different city from the running, and says why in the list", () => {
    const { best, rest } = suggestDays(stop, [
      day({ id: "d1", date: "2026-10-03", stops: [{ id: "a", name: "Canal City", location: CANAL }] }),
      day({
        id: "d2",
        date: "2026-10-04",
        city: "Kagoshima",
        placeLabel: "Kagoshima",
        stops: [{ id: "c", name: "Sakurajima", location: SAKURAJIMA }],
      }),
    ], TODAY);

    expect(best?.dayId).toBe("d1");
    const other = rest.find((c) => c.dayId === "d2");
    expect(other?.kind).toBe("other-city");
    expect(other?.reason).toMatch(/^different city · \d+ km away$/);
  });

  it("still suggests a distant day when there is nothing else", () => {
    const { best } = suggestDays(stop, [
      day({
        id: "d2",
        date: "2026-10-04",
        city: "Kagoshima",
        placeLabel: "Kagoshima",
        stops: [{ id: "c", name: "Sakurajima", location: SAKURAJIMA }],
      }),
    ], TODAY);

    expect(best?.dayId).toBe("d2");
  });

  it("marks a day already gone, and refuses to rank it", () => {
    const { rest } = suggestDays(stop, [
      day({ id: "past", date: "2026-09-30", stops: [{ id: "a", name: "Canal City", location: CANAL }] }),
      day({ id: "d1", date: "2026-10-03", stops: [] }),
    ], TODAY);

    const past = rest.find((c) => c.dayId === "past");
    expect(past?.kind).toBe("past");
    expect(past?.reason).toBe("already past");
    expect(past?.score).toBe(Infinity);
  });

  it("calls a two-city day a travel day and pushes it down", () => {
    const { best, rest } = suggestDays(stop, [
      day({
        id: "travel",
        date: "2026-10-03",
        placeLabel: "Fukuoka to Kagoshima",
        stops: [{ id: "a", name: "Canal City", location: CANAL }],
      }),
      day({ id: "plain", date: "2026-10-05", stops: [{ id: "b", name: "Kushida", location: KUSHIDA }] }),
    ], TODAY);

    expect(best?.dayId).toBe("plain");
    const travel = rest.find((c) => c.dayId === "travel");
    expect(travel?.kind).toBe("travel");
    expect(travel?.reason).toMatch(/^travel day · .+ detour$/);
  });

  it("never offers the day the stop is already on", () => {
    const { best, rest } = suggestDays(stop, [
      day({ id: "d0", date: "2026-10-02", stops: [{ id: "a", name: "Canal City", location: CANAL }] }),
      day({ id: "d1", date: "2026-10-03", stops: [] }),
    ], TODAY);

    expect(best?.dayId).toBe("d1");
    expect(rest.find((c) => c.dayId === "d0")?.reason).toBe("where it is now");
  });

  it("always ends with the bucket that is not a day", () => {
    const { rest } = suggestDays(stop, [day({ id: "d1", date: "2026-10-03" })], TODAY);
    const last = rest[rest.length - 1];
    expect(last?.dayId).toBeNull();
    expect(last?.label).toBe("To be planned");
    expect(last?.reason).toBe("keep it on the map, no day");
  });

  it("says the stop starts a day that has nothing on it", () => {
    const { best } = suggestDays(stop, [day({ id: "d1", date: "2026-10-03", stops: [] })], TODAY);
    expect(best?.detail).toContain("Starts the day.");
  });

  it("ranks a stop with no pin by hand rather than by distance", () => {
    const pinless = { ...stop, location: null };
    const { best } = suggestDays(pinless, [day({ id: "d1", date: "2026-10-03" })], TODAY);
    expect(best?.dayId).toBe("d1");
    expect(best?.addedMetres).toBeNull();
  });
});

describe("how a day is written", () => {
  it("names the day and where it is, as the artboard does", () => {
    const { best } = suggestDays(stop, [
      day({
        id: "d1",
        date: "2026-10-04",
        placeLabel: "Fukuoka to Kagoshima",
        stops: [{ id: "a", name: "Canal City", location: CANAL }],
      }),
    ], TODAY);

    expect(best?.label).toBe("Sat Oct 3 · Fukuoka to Kagoshima");
    expect(best?.shape).toBe("Fukuoka to Kagoshima · 1 stop");
  });

  it("falls back to the city its stops are in when nobody has labelled it", () => {
    const { best } = suggestDays(stop, [
      day({
        id: "d1",
        date: "2026-10-04",
        placeLabel: null,
        city: "Fukuoka",
        stops: [
          { id: "a", name: "Canal City", location: CANAL },
          { id: "b", name: "Kushida", location: KUSHIDA },
        ],
      }),
    ], TODAY);

    expect(best?.label).toBe("Sat Oct 3 · Fukuoka");
    expect(best?.shape).toBe("Fukuoka · 2 stops");
  });

  it("says nothing about a place it does not know", () => {
    const { best } = suggestDays(stop, [
      day({ id: "d1", date: "2026-10-04", placeLabel: null, city: null }),
    ], TODAY);

    expect(best?.label).toBe("Sat Oct 3");
    expect(best?.shape).toBe("nothing planned yet");
  });
});

describe("formatDistance", () => {
  it("reads at the scale a person is thinking at", () => {
    expect(formatDistance(412)).toBe("410 m");
    expect(formatDistance(1234)).toBe("1.2 km");
    expect(formatDistance(289_600)).toBe("290 km");
  });
});
