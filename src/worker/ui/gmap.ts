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

/*
 * The trip's own pins used to be built here, one per status, and handed to the
 * page as a fixed set of data URIs. They are built in the browser now
 * (`pinUrl` in `client.ts`): a pin carries its day's colour, its number in the
 * day, and the opacity the current selection leaves it at, so there is no
 * longer a fixed handful to render ahead of time. The geometry moved with it
 * unchanged — a disc in a 2.5px cream ring, ink-ringed and larger when
 * selected.
 */

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
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">` +
    `<path d="M16 37C12 31 3 23 3 15a13 13 0 0 1 26 0c0 8-9 16-13 22Z" fill="${C.card}" stroke="${C.ink}" stroke-width="2.5"/>` +
    `<circle cx="16" cy="15" r="4.5" fill="none" stroke="${C.ink}" stroke-width="2.5"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
