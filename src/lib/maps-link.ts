/**
 * A Google Maps link typed into the search field.
 *
 * The search sheet used to carry a "Paste a Google Maps link" row that opened
 * a second field for the link — a step that only existed because the first
 * field did not know a link when it saw one. It does now: a query that is a
 * Maps link is resolved to the place it names and comes back as an ordinary
 * result row, added by the same plus as any other.
 */

/** Maps hosts: google.tld/maps, maps.google.tld, and the two short-link forms. */
const MAPS_LINK =
  /^(?:https?:\/\/)?(?:(?:www\.)?google\.[a-z.]+\/maps(?:[/?]|$)|maps\.google\.[a-z.]+(?:[/?]|$)|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i;

/** The pattern, for the browser's copy in client.ts to be held to. */
export const MAPS_LINK_SOURCE = MAPS_LINK.source;

export function isMapsLink(raw: string): boolean {
  return MAPS_LINK.test(raw.trim());
}

/** A short link says nothing until it has been followed. */
export function isShortMapsLink(raw: string): boolean {
  return /^(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl)\//i.test(raw.trim());
}

/** With a scheme, so `new URL` and `fetch` can read it. */
export function withScheme(raw: string): string {
  const url = raw.trim();
  return /^https?:\/\//i.test(url) ? url : "https://" + url;
}

/**
 * The name of the place a full Maps URL points at: the `/maps/place/<name>`
 * segment, else the `q` or `query` parameter. Null when it names nothing —
 * a link to a bare map view, say.
 */
export function placeNameInMapsUrl(raw: string): string | null {
  const url = withScheme(raw);

  const inPath = /\/maps\/place\/([^/@?]+)/.exec(url);
  if (inPath?.[1]) {
    try {
      return decodeURIComponent(inPath[1].replace(/\+/g, " ")).trim() || null;
    } catch {
      return inPath[1].replace(/\+/g, " ").trim() || null;
    }
  }

  try {
    const params = new URL(url).searchParams;
    const named = params.get("q") ?? params.get("query");
    return named?.trim() || null;
  } catch {
    return null;
  }
}
