import type { LatLng } from "./geo.ts";

export function locality(city: string | null, point?: LatLng | null): string | null {
  if (!city || !point || point.lat < 40.49 || point.lat > 40.93 || point.lng < -74.26 || point.lng > -73.68) return city;
  return ({ "Kings County": "Brooklyn", "Queens County": "Queens", "New York County": "Manhattan", "Bronx County": "Bronx", "Richmond County": "Staten Island" } as Record<string, string>)[city] || city;
}

export function sameCity(a: string | null, aPoint: LatLng | null, b: string | null, bPoint: LatLng | null): boolean {
  const canonical = (city: string | null, point: LatLng | null) => {
    const label = locality(city, point);
    if (point && point.lat >= 40.49 && point.lat <= 40.93 && point.lng >= -74.26 && point.lng <= -73.68 && ["New York", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"].includes(label || "")) return "New York";
    return label;
  };
  return canonical(a, aPoint) === canonical(b, bPoint);
}
