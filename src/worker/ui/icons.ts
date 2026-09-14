/**
 * The icons, transcribed from the artboards.
 *
 * Each one keeps the exact path, stroke width and line caps its artboard uses,
 * because that is what makes a 12px icon read correctly. Size and colour are
 * the only things a caller sets.
 */

interface IconOptions {
  size?: number;
  color?: string;
  width?: number;
}

const svg = (
  body: string,
  { size = 16, color = "#6B645B", width = 2 }: IconOptions,
  extra = "",
) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" ${extra}>${body}</svg>`;

/** PlaceSearch: the search field, and the Find a place button. */
export const search = (o: IconOptions = {}) =>
  svg(
    `<circle cx="11" cy="11" r="7"></circle><path d="M16.5 16.5L21 21"></path>`,
    { width: 2.1, ...o },
    'stroke-linecap="round"',
  );

/** PlaceSearch: clearing the field. NewTrip: closing the screen. */
export const close = (o: IconOptions = {}) =>
  svg(`<path d="M6 6l12 12M18 6L6 18"></path>`, { width: 2.2, ...o }, 'stroke-linecap="round"');

/** The map pin, used for the bias chip and the "on trip" tile. */
export const pin = (o: IconOptions = {}) =>
  svg(
    `<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"></path>`,
    { ...o },
    'stroke-linejoin="round"',
  );

/** The same pin with a hole, which marks a place already on the trip. */
export const pinDot = (o: IconOptions = {}) =>
  svg(
    `<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"></path><circle cx="12" cy="10" r="2.4"></circle>`,
    { width: 1.9, ...o },
    'stroke-linejoin="round"',
  );

/** A bowl of ramen: the food tile on a search row. */
export const bowl = (o: IconOptions = {}) =>
  svg(
    `<path d="M4 10h16M5 10a7 7 0 0 1 14 0M6 14h12M7 18h10"></path>`,
    { width: 1.9, ...o },
    'stroke-linecap="round"',
  );

/** A link, for "Paste a Google Maps link". */
export const link = (o: IconOptions = {}) =>
  svg(
    `<path d="M9.5 14.5l5-5M8 16H6.5a4.5 4.5 0 0 1 0-9H8M16 8h1.5a4.5 4.5 0 0 1 0 9H16"></path>`,
    { ...o },
    'stroke-linecap="round"',
  );

export const plus = (o: IconOptions = {}) =>
  svg(`<path d="M12 5v14M5 12h14"></path>`, { width: 2.3, ...o }, 'stroke-linecap="round"');

export const chevron = (o: IconOptions = {}) =>
  svg(
    `<polyline points="6 9 12 15 18 9"></polyline>`,
    { width: 2.4, color: "#A59C90", ...o },
    'stroke-linecap="round" stroke-linejoin="round"',
  );

export const calendar = (o: IconOptions = {}) =>
  svg(
    `<rect x="3" y="4" width="18" height="17" rx="2.5"></rect><path d="M8 2v4M16 2v4M3 10h18"></path>`,
    { ...o },
    'stroke-linecap="round" stroke-linejoin="round"',
  );

/** Inviting someone: a person with a plus. */
export const invite = (o: IconOptions = {}) =>
  svg(
    `<circle cx="9.5" cy="8" r="3.4"></circle><path d="M3.2 19.5a6.6 6.6 0 0 1 12.6 0M18.5 8.5v5M21 11h-5"></path>`,
    { width: 1.9, ...o },
    'stroke-linecap="round" stroke-linejoin="round"',
  );

export const navigate = (o: IconOptions = {}) =>
  svg(
    `<polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>`,
    { width: 2.2, ...o },
    'stroke-linecap="round" stroke-linejoin="round"',
  );

export const check = (o: IconOptions = {}) =>
  svg(
    `<polyline points="20 6 9 17 4 12"></polyline>`,
    { width: 2.6, ...o },
    'stroke-linecap="round" stroke-linejoin="round"',
  );

export const pencil = (o: IconOptions = {}) =>
  svg(
    `<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>`,
    { ...o },
    'stroke-linecap="round" stroke-linejoin="round"',
  );

export const kebab = ({ size = 15, color = "#6B645B" }: IconOptions = {}) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>`;

/**
 * The drag handle on a stop row: two columns of three dots. The artboard dims
 * it to 0.4 in the list and shows it at full strength on the card in the air.
 */
export const grip = ({ color = "#A59C90" }: IconOptions = {}) =>
  `<svg width="11" height="15" viewBox="0 0 12 16" style="flex-shrink:0;opacity:${
    color === "#A59C90" ? "0.4" : "1"
  }"><g fill="${color}"><circle cx="3.5" cy="3" r="1.3"></circle><circle cx="8.5" cy="3" r="1.3"></circle><circle cx="3.5" cy="8" r="1.3"></circle><circle cx="8.5" cy="8" r="1.3"></circle><circle cx="3.5" cy="13" r="1.3"></circle><circle cx="8.5" cy="13" r="1.3"></circle></g></svg>`;

export const trash = (o: IconOptions = {}) =>
  svg(
    `<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"></path>`,
    { color: "#B08070", ...o },
    'stroke-linecap="round"',
  );

/** The layers and locate buttons on the map. */
export const layers = (o: IconOptions = {}) =>
  svg(
    `<polygon points="12 2 22 8.5 12 15 2 8.5 12 2"></polygon><polyline points="2 15.5 12 22 22 15.5"></polyline>`,
    { width: 1.9, ...o },
    'stroke-linejoin="round"',
  );

export const locate = ({ size = 18, color = "#6B645B" }: IconOptions = {}) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.9"><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2" fill="${color}" stroke="none"></circle><path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke-linecap="round"></path></svg>`;

/** MoveToDay: the star on the BEST FIT card. */
export const star = (o: IconOptions = {}) =>
  svg(
    `<path d="M12 2l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 16.7 6.2 19.8l1.6-6.6L2.6 8.8l6.8-.5L12 2z"></path>`,
    { width: 2.1, color: "#4E7A4B", ...o },
    'stroke-linecap="round" stroke-linejoin="round"',
  );

/** The disclosure on a day someone can move a stop to. */
export const chevronRight = (o: IconOptions = {}) =>
  svg(
    `<polyline points="9 6 15 12 9 18"></polyline>`,
    { width: 2.4, color: "#A59C90", ...o },
    'stroke-linecap="round" stroke-linejoin="round"',
  );

/** TripMenu: the day grid behind Plan view. */
export const grid = (o: IconOptions = {}) =>
  svg(
    `<rect x="3" y="4" width="18" height="17" rx="2.5"></rect><path d="M8 2v4M16 2v4M3 10h18M9 10v11M15 10v11"></path>`,
    { width: 1.9, ...o },
    'stroke-linejoin="round"',
  );

/** TripMenu: back to the trip list. */
export const arrowLeft = (o: IconOptions = {}) =>
  svg(
    `<path d="M19 12H5M11 18l-6-6 6-6"></path>`,
    { ...o },
    'stroke-linecap="round" stroke-linejoin="round"',
  );

/** SignIn: the shield beside the line about what we ask for. */
export const shield = (o: IconOptions = {}) =>
  svg(
    `<path d="M12 22s8-3.5 8-10V5.5L12 2 4 5.5V12c0 6.5 8 10 8 10z"></path>`,
    { width: 1.9, ...o },
    'stroke-linejoin="round"',
  );

/**
 * Google's own G, which is the one thing on the sign-in screen we do not get
 * to draw.
 *
 * PLAN.md section 5 said the dashed circle in `design/SignIn.dc.html` was a
 * placeholder and that Google ships the real mark. This is that mark: the four
 * official paths, unaltered. Their branding terms require the logo as supplied
 * — not recoloured, not restyled, not redrawn — so it is the one icon here
 * that takes no colour and does not go through `svg()`, which paints a stroke.
 *
 * The size is the artboard's 22px circle. The mark itself has no padding of
 * its own, so it is drawn a shade smaller and centred by the button.
 */
export const googleG = ({ size = 18 }: { size?: number } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">` +
  `<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>` +
  `<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>` +
  `<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>` +
  `<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>` +
  `</svg>`;

/** The roof on an accommodation pin, and in the row's chip. */
export const house = ({ size = 12, color = "#FFFFFF" }: IconOptions = {}) =>
  svg(
    `<path d="M4 11.5L12 5l8 6.5"></path><path d="M6.5 10.5V19h11v-8.5"></path>`,
    { size, color, width: 2.2 },
    'stroke-linecap="round" stroke-linejoin="round"',
  );

/**
 * The tab icon: a plane, flat and filled rather than drawn in line like the
 * rest of this file. No artboard specifies it — it is browser chrome, not a
 * screen — so it is the one icon here whose colour is its own.
 */
export const airplane = ({ size = 32, color = "#7A4FBF" }: IconOptions = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><path d="M12 .9c1.15 0 1.95 1.7 1.95 3.9v4.4l9.35 5.4V17l-9.35-2.7v5l2.75 2.05v1.85L12 21.9l-4.7 1.3v-1.85l2.75-2.05v-5L.7 17v-2.4l9.35-5.4V4.8C10.05 2.6 10.85.9 12 .9z"/></svg>`;
