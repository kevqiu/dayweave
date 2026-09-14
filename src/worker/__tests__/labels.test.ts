import { describe, expect, it } from "vitest";
import { dateRangeLabel, dayLabel, initialsFor, navigateUrl, stopsForDay } from "../store.ts";
import { DAY_PALETTE, dayColor } from "../ui/tokens.ts";

describe("dayLabel", () => {
  it("writes a day the way every artboard does", () => {
    expect(dayLabel("2026-10-03")).toBe("Sat Oct 3");
    expect(dayLabel("2025-09-30")).toBe("Tue Sep 30");
  });

  it("hands back anything it cannot read, rather than inventing a date", () => {
    expect(dayLabel("not a date")).toBe("not a date");
  });
});

describe("dateRangeLabel", () => {
  it("writes Sep 30 – Oct 10 across two months", () => {
    expect(dateRangeLabel("2025-09-30", "2025-10-10")).toBe("Sep 30 – Oct 10");
  });

  it("does not repeat a month both ends share", () => {
    expect(dateRangeLabel("2026-04-11", "2026-04-22")).toBe("Apr 11 – 22");
  });

  it("writes a one-day trip as a date, not a range", () => {
    expect(dateRangeLabel("2026-09-12", "2026-09-12")).toBe("Sep 12");
  });
});

describe("dayColor", () => {
  it("starts the spectrum with red", () => {
    expect(dayColor(0)).toBe("#E53935");
  });

  it("hands out the palette in order, and nothing twice", () => {
    const colors = DAY_PALETTE.map((_, i) => dayColor(i));
    expect(colors).toEqual([...DAY_PALETTE]);
    expect(new Set(colors).size).toBe(7);
  });

  it("keeps going past the palette, without repeating what it just used", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => dayColor(i));
    for (const hex of twenty) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(twenty).size).toBe(20);
  });

  it("is the same colour for the same day every time it is asked", () => {
    expect(dayColor(13)).toBe(dayColor(13));
  });
});

describe("initialsFor", () => {
  it("is stable for one person", () => {
    expect(initialsFor("dev_8f3cabc")).toBe(initialsFor("dev_8f3cabc"));
  });

  it("reads as initials rather than as a count", () => {
    for (const id of ["dev_8f3cabc", "dev_0000", "local-user", "dev_zzz999"]) {
      expect(initialsFor(id)).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("tells two people apart", () => {
    expect(initialsFor("dev_aaa")).not.toBe(initialsFor("dev_bbb"));
  });
});

describe("navigateUrl", () => {
  const KUSHIDA = { lat: 33.5932, lng: 130.4106 };

  it("opens walking directions to the exact place, not a place page", () => {
    const url = navigateUrl(KUSHIDA, "ChIJV2pTquqRQTURpI1FhH5siaE");
    expect(url).toContain("https://www.google.com/maps/dir/");
    expect(url).toContain("destination=33.5932%2C130.4106");
    expect(url).toContain("destination_place_id=ChIJV2pTquqRQTURpI1FhH5siaE");
    expect(url).toContain("travelmode=walking");
  });

  it("still works for a place with no Google id", () => {
    expect(navigateUrl(KUSHIDA, null)).not.toContain("destination_place_id");
  });

  it("is null for a stop with no pin, so the button has nowhere wrong to go", () => {
    expect(navigateUrl(null, "ChIJ...")).toBeNull();
  });
});

describe("the To be planned bucket", () => {
  const place = (id: string, city: string, category: string) => ({
    id,
    day_id: null,
    place_id: id,
    title: id,
    note: "",
    start_time: null,
    order_key: id,
    status: "planned",
    created_by: "u1",
    place_name: id,
    google_place_id: null,
    lat: 33.59 + Number(id),
    lng: 130.4,
    city,
    category,
    maps_url: null,
  });

  it("says where a waiting place is, not how far it is from the last one", () => {
    // Two things sitting in the bucket are not one after the other, so a walk
    // between them would measure nothing. design/Planner.dc.html writes the
    // tray card as `Fukuoka · shopping`.
    const rows = stopsForDay(
      [place("1", "Fukuoka", "shopping"), place("2", "Kagoshima", "garden")],
      null,
    );
    expect(rows.map((r) => r.description)).toEqual([
      "Fukuoka · shopping",
      "Kagoshima · garden",
    ]);
  });

  it("leaves out the half it does not know", () => {
    const row = stopsForDay([{ ...place("1", "Fukuoka", "shopping"), city: null }], null);
    expect(row[0]?.description).toBe("shopping");
  });
});
