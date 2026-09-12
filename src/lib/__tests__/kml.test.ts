import { describe, expect, it } from "vitest";
import { fetchMyMap, kmlUrl, parseCoordinates, parseKml } from "../kml.ts";

/**
 * Shaped after what My Maps actually serves: a Document per map, a Folder per
 * layer, HTML in descriptions, CDATA around them, and long-first coordinates
 * with an altitude the endpoint always emits as 0.
 */
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Japan 2025</name>
    <Folder>
      <name>Fukuoka</name>
      <Placemark>
        <name>Kanetora Rich Soup Ramen</name>
        <description><![CDATA[Tonkotsu &amp; cash only.<br>Queue before 11.]]></description>
        <Point><coordinates>130.4017,33.5902,0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>&#40644;&#33394; &amp; Ohori Park</name>
        <Point><coordinates>130.3785,33.5859,0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>Walking route</name>
        <LineString><coordinates>130.40,33.59,0 130.38,33.58,0</coordinates></LineString>
      </Placemark>
    </Folder>
    <Folder>
      <name>Hakone</name>
      <Placemark>
        <name>Hakone Shrine</name>
        <Point><coordinates>139.0247,35.2046,0</coordinates></Point>
      </Placemark>
    </Folder>
    <Placemark>
      <name>Unfiled place</name>
      <Point><coordinates>135.5023,34.6937,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

describe("parseKml", () => {
  const map = parseKml(SAMPLE);

  it("reads the map name", () => {
    expect(map.name).toBe("Japan 2025");
  });

  it("keeps every point placemark", () => {
    expect(map.places.map((p) => p.name)).toEqual([
      "Kanetora Rich Soup Ramen",
      "黄色 & Ohori Park",
      "Hakone Shrine",
      "Unfiled place",
    ]);
  });

  it("reads coordinates long-first, which is the usual trap", () => {
    const [first] = map.places;
    expect(first?.lat).toBeCloseTo(33.5902, 4);
    expect(first?.lng).toBeCloseTo(130.4017, 4);
  });

  it("attributes each place to its layer, and tolerates none", () => {
    expect(map.places.map((p) => p.layer)).toEqual([
      "Fukuoka",
      "Fukuoka",
      "Hakone",
      null,
    ]);
  });

  it("strips the HTML My Maps puts in descriptions", () => {
    expect(map.places[0]?.description).toBe("Tonkotsu & cash only.\nQueue before 11.");
  });

  it("leaves a place with no description as an empty string", () => {
    expect(map.places[1]?.description).toBe("");
  });

  it("reports what it skipped instead of swallowing it", () => {
    expect(map.skipped).toEqual([{ name: "Walking route", reason: "no-point" }]);
  });
});

describe("parseCoordinates", () => {
  it("accepts a pair without altitude", () => {
    expect(parseCoordinates("130.4,33.6")).toEqual({ lat: 33.6, lng: 130.4 });
  });
  it("takes the first tuple of a multi-point string", () => {
    expect(parseCoordinates("130.4,33.6,0 131.0,34.0,0")).toEqual({ lat: 33.6, lng: 130.4 });
  });
  it("rejects anything off the globe", () => {
    expect(parseCoordinates("200,99,0")).toBeNull();
    expect(parseCoordinates("nope")).toBeNull();
    expect(parseCoordinates("130.4")).toBeNull();
  });
});

describe("kmlUrl", () => {
  it("always forces kml, since the default is a zipped kmz", () => {
    expect(kmlUrl("1abcDEF")).toBe(
      "https://www.google.com/maps/d/kml?mid=1abcDEF&forcekml=1",
    );
  });
});

describe("fetchMyMap", () => {
  it("parses a good response", async () => {
    const result = await fetchMyMap("mid", async () => new Response(SAMPLE));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.map.places).toHaveLength(4);
  });

  it("reports an http failure without throwing", async () => {
    const result = await fetchMyMap("mid", async () => new Response("", { status: 404 }));
    expect(result).toEqual({ ok: false, reason: "http", status: 404 });
  });

  it("catches a map that is private, so Google serves a sign-in page", async () => {
    const result = await fetchMyMap(
      "mid",
      async () =>
        new Response("<!doctype html><html><title>Sign in</title>", {
          headers: { "content-type": "text/html" },
        }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "not-kml") {
      expect(result.contentType).toBe("text/html");
    }
  });
});
