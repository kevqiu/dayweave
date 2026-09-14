import { COLOR as C } from "./tokens.ts";

/**
 * The Google map, styled down to the artboards' palette.
 *
 * PLAN.md section 2 rejected Google's tiles in favour of MapLibre over a
 * self-hosted Protomaps basemap, for three reasons: per-load cost, tiles that
 * cannot be restyled past Google's presets, and Google's own UI pushed into a
 * design meant to be calm. That decision has been overridden.
 *
 * Two of the three are answered here: the style below takes the map down to
 * the same creams and greens as the rest of the app, and every default control
 * is off so the only furniture on the map is ours. The per-load cost is real
 * and remains.
 *
 * The style is the classic JSON form on purpose. A cloud-based `mapId` would
 * move the palette out of this repo and into a console, where it could drift
 * away from `tokens.ts` with nothing here to show it had.
 */
export function mapStyle(): unknown[] {
  const paint = (color: string) => [{ color }];

  return [
    // Nothing Google labels by default; the app says what a place is.
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },

    { elementType: "geometry", stylers: paint(C.mapFill) },
    { elementType: "labels.text.fill", stylers: paint(C.grey) },
    { elementType: "labels.text.stroke", stylers: paint(C.mapFill) },

    { featureType: "landscape.natural", elementType: "geometry", stylers: paint("#E2E9D7") },
    { featureType: "poi.park", elementType: "geometry", stylers: paint("#E2E9D7") },
    { featureType: "water", elementType: "geometry", stylers: paint("#D9E4E3") },
    { featureType: "water", elementType: "labels.text.fill", stylers: paint("#7C9491") },

    // The artboards draw roads as pale cream ribbons, wider for the bigger ones.
    { featureType: "road", elementType: "geometry", stylers: paint("#FCF9F2") },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: paint("#FFFCF6") },
    { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "administrative", elementType: "geometry", stylers: paint("#E7DFD0") },
  ];
}

/**
 * A pin, as a data URI. Same shape the artboards draw: a status-coloured disc
 * inside a cream ring, bigger and ink-ringed when it is the selected stop.
 */
export function pinIcon(fill: string, selected: boolean): string {
  const size = selected ? 26 : 20;
  const ring = selected ? C.ink : C.card;
  const box = size + 6;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">` +
    `<circle cx="${box / 2}" cy="${box / 2}" r="${size / 2}" fill="${fill}" ` +
    `stroke="${ring}" stroke-width="2.5"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * Where the phone says it is.
 *
 * Deliberately not a pin: a pin is a thing on the trip, and this is not one.
 * A ringed dot in the accent, the shape every map has used for "here" since
 * before any of this.
 */
export function meIcon(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">` +
    `<circle cx="13" cy="13" r="11" fill="${C.accent}" fill-opacity="0.22"/>` +
    `<circle cx="13" cy="13" r="5.5" fill="${C.accent}" stroke="${C.card}" stroke-width="2.5"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** The result being looked at: the one terracotta pin the artboard draws. */
export function lookPinIcon(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">` +
    `<circle cx="17" cy="17" r="11" fill="${C.accent}" stroke="${C.card}" stroke-width="3"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
