/**
 * Google Places API (New), the two calls PLAN.md section 4b asks for:
 * Autocomplete while typing, then Place Details on the one you pick.
 *
 * Both carry the same session token, which is the whole point — it bills as
 * one session rather than one call per keystroke. The caller mints a token
 * when a search opens and discards it when the search closes.
 *
 * Nothing in here runs in the browser. The key is a Worker binding, restricted
 * by API to Places, and the responses are reshaped before they are returned,
 * so the browser never sees a raw Google payload either.
 */

import type { Bias, LatLng } from "./geo.ts";
import { locality } from "./locality.ts";

const BASE = "https://places.googleapis.com/v1";

/** Place Details requires a field mask; asking for less costs less. */
const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "shortFormattedAddress",
  "location",
  "rating",
  "primaryType",
  "primaryTypeDisplayName",
  "addressComponents",
  "googleMapsUri",
];

const DETAILS_FIELDS = PLACE_FIELDS.join(",");

/** The same fields, spelled the way Text Search wants them. */
const SEARCH_FIELDS = PLACE_FIELDS.map((f) => `places.${f}`).join(",");

export interface PlacesConfig {
  /**
   * A server key, restricted by API to Places and by nothing else.
   *
   * An earlier key was restricted by HTTP referrer, which is a browser
   * restriction, so the proxy had to send a `Referer` of its own to be
   * allowed through — a header the server writes about itself, which
   * protects nobody. The key was replaced; the header went with it.
   */
  apiKey: string;
}

export interface Suggestion {
  placeId: string;
  /** The bold half in the list: "Ichiran Ramen". */
  primary: string;
  /** The grey half: "Hakata, Fukuoka". */
  secondary: string;
  /** Metres from the bias centre, when we sent one. Drives the greyed rows. */
  distanceMetres: number | null;
  types: string[];
}

export interface PlaceDetails {
  googlePlaceId: string;
  name: string;
  /** The local-language name when Google gives us one, else null. */
  nameLocal: string | null;
  lat: number;
  lng: number;
  address: string | null;
  city: string | null;
  countryCode: string | null;
  /** Already shortened to the form section 4c wants: `ramen`, not `Ramen Restaurant`. */
  category: string | null;
  /** Google's star rating, which the search rows show. Null when unrated. */
  rating: number | null;
  mapsUrl: string | null;
}

export class PlacesError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlacesError";
  }
}

function headers(config: PlacesConfig, extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": config.apiKey,
    ...extra,
  };
}

async function readError(response: Response): Promise<string> {
  const body = (await response.text()).slice(0, 500);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? body;
  } catch {
    return body;
  }
}

export interface AutocompleteInput {
  query: string;
  sessionToken: string;
  /** Omitted for "Search anywhere", which is the whole of section 4b's argument for bias. */
  bias?: Bias | null;
  /** Language for the returned text. */
  languageCode?: string;
}

export async function autocomplete(
  config: PlacesConfig,
  input: AutocompleteInput,
): Promise<Suggestion[]> {
  const body: Record<string, unknown> = {
    input: input.query,
    sessionToken: input.sessionToken,
  };
  if (input.languageCode) body.languageCode = input.languageCode;

  if (input.bias) {
    // Bias, never restriction: you plan a Hakone teahouse while sitting in
    // Fukuoka, and restriction would return nothing. PLAN.md section 4b.
    body.locationBias = {
      circle: {
        center: { latitude: input.bias.center.lat, longitude: input.bias.center.lng },
        radius: input.bias.radius,
      },
    };
    // `origin` is what makes Google return distanceMetres, which is what the
    // distant rows are greyed and labelled with.
    body.origin = { latitude: input.bias.center.lat, longitude: input.bias.center.lng };
  }

  const response = await fetch(`${BASE}/places:autocomplete`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new PlacesError(response.status, await readError(response));
  }

  const payload = (await response.json()) as AutocompleteResponse;
  return (payload.suggestions ?? [])
    .map(toSuggestion)
    .filter((s): s is Suggestion => s !== null);
}

/**
 * Text Search (New).
 *
 * This is what the Add a place screen actually runs on, and the artboard is
 * why: `design/PlaceSearch.dc.html` shows a list of results carrying a
 * category, a rating and a distance. Autocomplete returns none of those — it
 * returns completions — so a screen built on it could not be drawn. PLAN.md
 * section 4b names Text Search for exactly this case, "where you want a list
 * rather than a completion".
 *
 * One call returns everything needed to show the row *and* to write the place,
 * so picking one costs nothing further. Autocomplete and Place Details are
 * still here, still session-token paired, for a completion field that wants
 * the cheaper per-session billing.
 */
export async function textSearch(
  config: PlacesConfig,
  input: { query: string; bias?: Bias | null; languageCode?: string; maxResults?: number },
): Promise<PlaceDetails[]> {
  const body: Record<string, unknown> = {
    textQuery: input.query,
    maxResultCount: Math.min(20, Math.max(1, input.maxResults ?? 10)),
  };
  if (input.languageCode) body.languageCode = input.languageCode;

  if (input.bias) {
    // Bias, never restriction: a Hakone teahouse has to stay findable from
    // Fukuoka. Distant results come back and are dimmed instead.
    body.locationBias = {
      circle: {
        center: { latitude: input.bias.center.lat, longitude: input.bias.center.lng },
        radius: input.bias.radius,
      },
    };
  }

  const response = await fetch(`${BASE}/places:searchText`, {
    method: "POST",
    headers: headers(config, { "X-Goog-FieldMask": SEARCH_FIELDS }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new PlacesError(response.status, await readError(response));
  }

  const payload = (await response.json()) as { places?: DetailsResponse[] };
  return (payload.places ?? []).flatMap((place) => {
    try {
      return [toDetails(place)];
    } catch {
      // A result with no id or no location cannot become a stop, so drop it
      // rather than failing the whole search.
      return [];
    }
  });
}

export async function placeDetails(
  config: PlacesConfig,
  placeId: string,
  sessionToken: string,
  languageCode?: string,
): Promise<PlaceDetails> {
  const url = new URL(`${BASE}/places/${encodeURIComponent(placeId)}`);
  // Details takes the token on the query string, Autocomplete in the body.
  // Same token, two spellings; sending the wrong one silently splits the
  // session into two billable ones.
  url.searchParams.set("sessionToken", sessionToken);
  if (languageCode) url.searchParams.set("languageCode", languageCode);

  const response = await fetch(url, {
    headers: headers(config, { "X-Goog-FieldMask": DETAILS_FIELDS }),
  });

  if (!response.ok) {
    throw new PlacesError(response.status, await readError(response));
  }

  return toDetails((await response.json()) as DetailsResponse);
}

// --- response shaping -------------------------------------------------------

interface AutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      types?: string[];
      distanceMeters?: number;
    };
  }[];
}

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface DetailsResponse {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  addressComponents?: AddressComponent[];
  googleMapsUri?: string;
}

function toSuggestion(entry: NonNullable<AutocompleteResponse["suggestions"]>[number]): Suggestion | null {
  const p = entry.placePrediction;
  if (!p?.placeId) return null;

  const primary = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
  if (!primary) return null;

  return {
    placeId: p.placeId,
    primary,
    secondary: p.structuredFormat?.secondaryText?.text ?? "",
    distanceMetres: typeof p.distanceMeters === "number" ? p.distanceMeters : null,
    types: p.types ?? [],
  };
}

function toDetails(place: DetailsResponse): PlaceDetails {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!place.id || typeof lat !== "number" || typeof lng !== "number") {
    throw new PlacesError(502, "Place Details came back without an id or a location");
  }

  const components = place.addressComponents ?? [];
  return {
    googlePlaceId: place.id,
    name: place.displayName?.text ?? place.shortFormattedAddress ?? "Unnamed place",
    nameLocal: null,
    lat,
    lng,
    address: place.formattedAddress ?? place.shortFormattedAddress ?? null,
    city: locality(cityFrom(components), { lat, lng }),
    countryCode: countryFrom(components),
    category: shortCategory(place.primaryTypeDisplayName?.text, place.primaryType),
    rating: typeof place.rating === "number" ? place.rating : null,
    mapsUrl: place.googleMapsUri ?? null,
  };
}

/**
 * The city for the trip card subtitle (PLAN.md section 4d).
 *
 * This is the reverse geocode: Place Details already returns the address
 * components, so resolving a city costs no extra call and no Geocoding key.
 *
 * `locality` is the usual answer. Japanese wards come back as
 * `sublocality_level_1` under a `locality` of Fukuoka, which is the level we
 * want — "Fukuoka", not "Hakata". Some countries have no locality at all, so
 * the town and the admin areas back it up.
 */
const CITY_TYPES = [
  "locality",
  "postal_town",
  "administrative_area_level_2",
  "administrative_area_level_1",
];

export function cityFrom(components: readonly AddressComponent[]): string | null {
  for (const type of CITY_TYPES) {
    const hit = components.find((c) => c.types?.includes(type));
    if (hit?.longText) return hit.longText;
  }
  return null;
}

export function countryFrom(components: readonly AddressComponent[]): string | null {
  const hit = components.find((c) => c.types?.includes("country"));
  return hit?.shortText ?? null;
}

/**
 * `Ramen Restaurant` -> `ramen`, which is the line section 4c specifies.
 *
 * Google's display name is title case and usually ends in the generic noun.
 * Dropping that noun leaves the useful half, unless it is the whole name: a
 * plain `Restaurant` stays `restaurant` rather than becoming empty.
 */
const GENERIC_TAILS = ["restaurant", "store", "shop"];

export function shortCategory(
  displayName: string | undefined,
  primaryType: string | undefined,
): string | null {
  const source = displayName ?? primaryType?.replace(/_/g, " ");
  if (!source) return null;

  const lower = source.toLowerCase().trim();
  if (!lower) return null;

  const words = lower.split(/\s+/);
  const last = words[words.length - 1];
  if (words.length > 1 && last && GENERIC_TAILS.includes(last)) {
    return words.slice(0, -1).join(" ");
  }
  return lower;
}
