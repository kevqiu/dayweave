/**
 * Parses the KML a Google My Map serves at
 *   https://www.google.com/maps/d/kml?mid=<mid>&forcekml=1
 *
 * Without `forcekml=1` the endpoint returns a KMZ (a zipped KML), so the
 * parameter is not optional for us.
 *
 * Deliberately hand-rolled rather than pulling a DOM parser: Workers have no
 * DOMParser, the shape we need is small, and every XML library that runs on
 * workerd is either large or unmaintained.
 */

export interface KmlPlace {
  /** `<name>`, trimmed. Placemarks without one are dropped. */
  name: string;
  /** `<description>`, tags stripped, entities decoded. Empty string if absent. */
  description: string;
  lat: number;
  lng: number;
  /** The enclosing `<Folder><name>`, which is the layer in the My Maps UI. */
  layer: string | null;
}

export interface KmlMap {
  /** The `<Document><name>`, which is what the map is called. */
  name: string | null;
  places: KmlPlace[];
  /**
   * Placemarks we could not use, with the reason. Surfaced rather than
   * swallowed so an import can tell someone what it skipped.
   */
  skipped: { name: string | null; reason: SkipReason }[];
}

export type SkipReason = "no-name" | "no-point" | "bad-coordinates";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code: string) => {
    const named = ENTITIES[code];
    if (named !== undefined) return named;
    if (code.startsWith("#x") || code.startsWith("#X")) {
      const n = Number.parseInt(code.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    if (code.startsWith("#")) {
      const n = Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return whole;
  });
}

/** Reads the text of the first `<tag>` in `xml`, CDATA and entities handled. */
function tagText(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!m || m[1] === undefined) return null;
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1]);
  const raw = cdata?.[1] ?? m[1];
  return decodeEntities(raw).trim();
}

/** `lng,lat` or `lng,lat,alt`. KML is long-first, which is the usual trap. */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const parts = text.trim().split(/\s+/)[0]?.split(",");
  if (!parts || parts.length < 2) return null;
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function parseKml(xml: string): KmlMap {
  const doc = /<Document(?:\s[^>]*)?>([\s\S]*)<\/Document>/.exec(xml);
  const body = doc?.[1] ?? xml;

  const places: KmlPlace[] = [];
  const skipped: KmlMap["skipped"] = [];

  // Walk folders so each placemark knows its layer. Placemarks outside any
  // folder still count, with a null layer.
  const segments: { layer: string | null; xml: string }[] = [];
  const folder = /<Folder(?:\s[^>]*)?>([\s\S]*?)<\/Folder>/g;
  let lastEnd = 0;
  let f: RegExpExecArray | null;
  while ((f = folder.exec(body)) !== null) {
    segments.push({ layer: null, xml: body.slice(lastEnd, f.index) });
    const inner = f[1] ?? "";
    segments.push({ layer: tagText(inner, "name"), xml: inner });
    lastEnd = folder.lastIndex;
  }
  segments.push({ layer: null, xml: body.slice(lastEnd) });

  for (const segment of segments) {
    const placemark = /<Placemark(?:\s[^>]*)?>([\s\S]*?)<\/Placemark>/g;
    let p: RegExpExecArray | null;
    while ((p = placemark.exec(segment.xml)) !== null) {
      const inner = p[1] ?? "";
      const name = tagText(inner, "name");

      if (!name) {
        skipped.push({ name: null, reason: "no-name" });
        continue;
      }
      // Lines and shapes are legitimate My Maps content but are not stops.
      if (!/<Point(?:\s[^>]*)?>/.test(inner)) {
        skipped.push({ name, reason: "no-point" });
        continue;
      }
      const coordinates = tagText(inner, "coordinates");
      const point = coordinates ? parseCoordinates(coordinates) : null;
      if (!point) {
        skipped.push({ name, reason: "bad-coordinates" });
        continue;
      }

      places.push({
        name,
        description: stripTags(tagText(inner, "description") ?? ""),
        lat: point.lat,
        lng: point.lng,
        layer: segment.layer,
      });
    }
  }

  return { name: tagText(body, "name"), places, skipped };
}

/** My Maps descriptions often carry HTML from the place card. */
function stripTags(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function kmlUrl(mid: string): string {
  return `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`;
}

/**
 * Pulls a My Map. Returns a tagged failure rather than throwing, because the
 * caller is a Workflow step that has to decide whether to retry.
 */
export async function fetchMyMap(
  mid: string,
  fetcher: typeof fetch = fetch,
): Promise<
  | { ok: true; map: KmlMap }
  | { ok: false; reason: "http"; status: number }
  | { ok: false; reason: "not-kml"; contentType: string | null; sample: string }
> {
  const response = await fetcher(kmlUrl(mid), {
    headers: { accept: "application/vnd.google-earth.kml+xml, application/xml" },
    redirect: "follow",
  });

  if (!response.ok) return { ok: false, reason: "http", status: response.status };

  const text = await response.text();
  const contentType = response.headers.get("content-type");
  if (!text.includes("<kml") && !text.includes("<Document")) {
    return { ok: false, reason: "not-kml", contentType, sample: text.slice(0, 400) };
  }
  return { ok: true, map: parseKml(text) };
}
