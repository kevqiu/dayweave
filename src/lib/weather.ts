/**
 * The day's weather, for the chip on a day header (`design/weather-options.html`,
 * option B): what the sky is doing, the chance of rain, and the day's high.
 *
 * It comes from Open-Meteo, which needs no key and forecasts sixteen days
 * ahead. One request covers a whole trip: every place the trip's days happen
 * in, over the dates the forecast reaches. Everything that decides what is
 * asked for, and what an answer means, is here so it can be tested without a
 * network; the Worker only sends the request and caches the reply.
 */

import { centroid, type LatLng } from "./geo.ts";

/** The six skies the chip draws an icon for. */
export type Sky = "sun" | "part" | "cloud" | "rain" | "snow" | "storm";

export interface DayWeather {
  sky: Sky;
  /** Chance of rain as a whole percent, or null when there is no figure (a day gone by). */
  rain: number | null;
  /** The day's high in °C. The browser converts it if you asked for °F. */
  high: number;
}

/**
 * How far the forecast endpoint reaches either side of today. Open-Meteo
 * serves up to 92 days back and 16 ahead, today included. A day outside that
 * gets no chip: no badge is better than a made-up one.
 */
export const PAST_DAYS = 92;
export const FORECAST_DAYS = 16;

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/**
 * A WMO weather code, as Open-Meteo reports it, reduced to one of the six.
 * Fog reads as cloud and drizzle as rain: the chip is 13px across and says
 * whether to pack an umbrella, not which kind of grey it will be. A code
 * outside the table is null, and a null day is not drawn.
 */
export function skyOf(code: number): Sky | null {
  if (code === 0 || code === 1) return "sun";
  if (code === 2) return "part";
  if (code === 3 || code === 45 || code === 48) return "cloud";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code === 95 || code === 96 || code === 99) return "storm";
  return null;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The first and last dates a request may ask about, today being `today`. */
export function forecastWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -PAST_DAYS), to: addDays(today, FORECAST_DAYS - 1) };
}

/** A stay, as far as the weather needs one: where, and which nights. */
export interface WeatherStay {
  lat?: number | null;
  lng?: number | null;
  check_in: string;
  check_out: string;
}

/**
 * Where a day's weather is taken: the centroid of the day's own located
 * stops. A day with none takes the place you sleep that night instead, so a
 * day nobody has planned yet still gets a forecast if you know where you will
 * be. A day with neither has no point, and no chip.
 *
 * Stays are only the fallback, and only for the night itself (check-out day
 * excluded). Mixing them in with the stops would put a travel day's weather
 * halfway between two cities.
 */
export function dayPoint(date: string, stops: readonly LatLng[], stays: readonly WeatherStay[]): LatLng | null {
  if (stops.length) return centroid(stops);
  const nights = stays
    .filter((s) => typeof s.lat === "number" && typeof s.lng === "number" && Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .filter((s) => s.check_in <= date && date < s.check_out)
    .map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
  return centroid(nights);
}

export interface WeatherDay {
  id: string;
  date: string;
  point: LatLng | null;
}

export interface WeatherQuery {
  url: string;
  /** Which location in the reply each day reads, by index. */
  days: { id: string; date: string; at: number }[];
}

/**
 * A point rounded to a tenth of a degree, about 11 km. Weather does not change
 * across a city, and rounding means the days in one city share a location in
 * the request, and adding a stop down the road does not miss the cache.
 */
const round = (n: number) => Math.round(n * 10) / 10;

/**
 * The one request that covers a trip, or null when there is nothing to ask:
 * no day inside the window has a point.
 *
 * Open-Meteo takes several locations at once, but one date range for all of
 * them, so the range runs from the first asked-about day to the last and each
 * location is asked for all of it. A trip is a few weeks at most, so that is
 * a few dozen numbers too many, not a second request.
 */
export function weatherQuery(days: readonly WeatherDay[], today: string): WeatherQuery | null {
  const window = forecastWindow(today);
  const keys: string[] = [];
  const points: LatLng[] = [];
  const asked: WeatherQuery["days"] = [];

  for (const day of days) {
    if (!day.point || day.date < window.from || day.date > window.to) continue;
    const point = { lat: round(day.point.lat), lng: round(day.point.lng) };
    const key = `${point.lat},${point.lng}`;
    let at = keys.indexOf(key);
    if (at === -1) {
      at = keys.push(key) - 1;
      points.push(point);
    }
    asked.push({ id: day.id, date: day.date, at });
  }
  if (!asked.length) return null;

  const dates = asked.map((d) => d.date).sort();
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(","),
    longitude: points.map((p) => p.lng).join(","),
    daily: "weather_code,temperature_2m_max,precipitation_probability_max",
    // Each location's own calendar, so "Oct 3" is Oct 3 where the day is.
    timezone: "auto",
    start_date: dates[0] as string,
    end_date: dates[dates.length - 1] as string,
  });
  return { url: `${FORECAST_URL}?${params}`, days: asked };
}

interface Daily {
  time?: unknown;
  weather_code?: unknown;
  temperature_2m_max?: unknown;
  precipitation_probability_max?: unknown;
}

const numberAt = (list: unknown, i: number): number | null => {
  const value = Array.isArray(list) ? list[i] : null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/**
 * Open-Meteo's reply, read into one entry per day that has a forecast.
 *
 * A single location comes back as an object and several as a list, in the
 * order they were asked. A day missing its code or its high is left out
 * rather than drawn half-known. A missing chance of rain is kept as null,
 * because that is normal for a day that is already over.
 */
export function readForecast(query: WeatherQuery, body: unknown): Record<string, DayWeather> {
  const locations = (Array.isArray(body) ? body : [body]) as { daily?: Daily }[];
  const out: Record<string, DayWeather> = {};

  for (const day of query.days) {
    const daily = locations[day.at]?.daily;
    if (!daily || !Array.isArray(daily.time)) continue;
    const i = daily.time.indexOf(day.date);
    if (i === -1) continue;

    const code = numberAt(daily.weather_code, i);
    const high = numberAt(daily.temperature_2m_max, i);
    const sky = code === null ? null : skyOf(code);
    if (!sky || high === null) continue;

    const rain = numberAt(daily.precipitation_probability_max, i);
    out[day.id] = {
      sky,
      rain: rain === null ? null : Math.round(Math.min(100, Math.max(0, rain))),
      high: Math.round(high * 10) / 10,
    };
  }
  return out;
}
