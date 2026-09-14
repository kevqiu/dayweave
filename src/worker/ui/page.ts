import { CLIENT } from "./client.ts";
import * as icons from "./icons.ts";
import { cardMap, mapBackground, signInMap } from "./map.ts";
import { lookPinIcon, mapStyle, meIcon } from "./gmap.ts";
import { PLAN_CLIENT } from "./plan-client.ts";
import { styles } from "./styles.ts";
import { COLOR as C, DAY_PALETTE, DAY_BLACK, FONTS_HREF } from "./tokens.ts";

/**
 * The document.
 *
 * Icons and the drawn map are rendered here, server side, and handed to the
 * client as markup. That keeps every SVG in `icons.ts` and `map.ts`, where
 * they can be checked against the artboard they came from, rather than
 * scattered through the script.
 */

/** Each icon in the size and colour the artboard that uses it specifies. */
function iconSet(): Record<string, string> {
  return {
    daytrail: icons.daytrail({ size: 40 }),
    search: icons.search({ size: 17, color: C.inkSoft }),
    searchLight: icons.search({ size: 14, color: C.paper }),
    close: icons.close({ size: 17, color: C.inkSoft }),
    plus: icons.plus({ size: 15, color: C.inkSoft }),
    plusGrey: icons.plus({ size: 14, color: C.grey, width: 2.6 }),
    // The plus on a free slot and in the Plan view's time gutter, both 11px
    // in design/PlannerMobile.dc.html.
    plusTiny: icons.plus({ size: 11, color: C.faint, width: 2.6 }),
    chevron: icons.chevron({ size: 13 }),
    chevronLeft: icons.chevronLeft({ size: 17, color: C.inkSoft }),
    chevronSmall: icons.chevron({ size: 11 }),
    calendar: icons.calendar({ size: 15, color: C.inkSoft }),
    invite: icons.invite({ size: 15, color: C.inkSoft }),
    navigateLight: icons.navigate({ size: 12, color: C.paper }),
    check: icons.check({ size: 12, color: C.inkSoft }),
    checkOn: icons.check({ size: 12, color: C.todayInk }),
    pencil: icons.pencil({ size: 12, color: C.inkSoft }),
    // The pencil on a day header, which opens its name and its colour.
    pencilDay: icons.pencil({ size: 12, color: C.greyer }),
    house: icons.lodgingHouse({ size: 15 }),
    pencilInk: icons.pencil({ size: 15, color: C.inkSoft }),
    houseInk: icons.house({ size: 14, color: C.inkSoft }),
    kebab: icons.kebab({ size: 15 }),
    grip: icons.grip(),
    gripDark: icons.grip({ color: C.inkSoft }),
    trash: icons.trash({ size: 15 }),
    frameAll: icons.frameAll({ size: 17, color: C.inkSoft }),
    locate: icons.locate({ size: 18, color: C.inkSoft }),
    bowl: icons.bowl({ size: 17, color: C.greenStroke }),
    bowlGrey: icons.bowl({ size: 17, color: C.greyStroke }),
    pinDot: icons.pinDot({ size: 17, color: C.yellowStroke }),
    pinChip: icons.pin({ size: 12, color: "#8C8479" }),
    pinFaint: icons.pin({ size: 12, color: "#A59C90" }),
    linkGrey: icons.link({ size: 16, color: "#8C8479" }),
    star: icons.star({ size: 15 }),
    chevronRight: icons.chevronRight({ size: 14 }),
    grid: icons.grid({ size: 16, color: C.inkSoft }),
    arrowLeft: icons.arrowLeft({ size: 16, color: C.inkSoft }),
    arrowLeftSoft: icons.arrowLeft({ size: 16, color: C.inkSoft, width: 2.2 }),
    pinInk: icons.pinDot({ size: 16, color: C.ink }),
    checkGreen: icons.check({ size: 14, color: C.todayInk }),
    // design/Members.dc.html: the chain beside "Anyone with this link".
    chain: icons.link({ size: 17, color: C.inkSoft }),
    // SignIn draws it at 14px in #A59C90.
    shield: icons.shield({ size: 14, color: "#A59C90" }),
    // Google's, at the size of the circle the artboard drew around a letter.
    googleG: icons.googleG({ size: 18 }),
    // The roof on a bed: cream inside a pin, the day's own green in a row.
    houseWhite: icons.house({ size: 13, color: C.card }),
    // In a row's chip the roof takes the chip's own colour, so it is drawn in
    // the bed green rather than inheriting a stroke it cannot inherit.
    houseHue: icons.house({ size: 11, color: "#3F6B4A" }),
    // The search row that makes a stop with no place behind it.
    pencilGrey: icons.pencil({ size: 16, color: "#8C8479" }),
    checkSwatch: icons.check({ size: 12, color: "#FFFCF6", width: 3 }),
    // The same tick on the white swatch, where cream on cream is invisible.
    checkSwatchInk: icons.check({ size: 12, color: C.ink, width: 3 }),
    trashSmall: icons.trash({ size: 13 }),
  };
}

const FAVICON = `data:image/svg+xml,${encodeURIComponent(icons.daytrail())}`;

export function page(mapsKey = ""): string {
  const boot = {
    icons: iconSet(),
    map: mapBackground(),
    cardMap: cardMap(),
    signInMap: signInMap(),
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${C.paper}">
<title>Daytrail — Bring your daytrails to life</title>
<meta name="description" content="Bring your daytrails to life. Map the places you dream of, plan each day, and explore together with Daytrail.">
<meta name="application-name" content="Daytrail">
<meta name="apple-mobile-web-app-title" content="Daytrail">
<meta property="og:site_name" content="Daytrail">
<meta property="og:title" content="Daytrail — Bring your daytrails to life">
<meta property="og:description" content="Map the places you dream of, plan each day, and explore together.">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Daytrail — Bring your daytrails to life">
<meta name="twitter:description" content="Map the places you dream of, plan each day, and explore together.">
<link rel="icon" type="image/svg+xml" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}">
<style>${styles()}</style>
</head>
<body>
<div id="frame"></div>
<script>
window.__ICONS__ = ${JSON.stringify(boot.icons)};
window.__MAP__ = ${JSON.stringify(boot.map)};
window.__CARD_MAP__ = ${JSON.stringify(boot.cardMap)};
window.__SIGNIN_MAP__ = ${JSON.stringify(boot.signInMap)};
// Provisioned and deployed (INFRA.md item 5). Empty only if the binding is,
// and then the drawn map stands in — as it also does if the script does not
// load within 8 seconds.
window.__MAPS_KEY__ = ${JSON.stringify(mapsKey)};
window.__MAP_STYLE__ = ${JSON.stringify(mapStyle())};
window.__LOOK_PIN__ = ${JSON.stringify(lookPinIcon())};
window.__ME_PIN__ = ${JSON.stringify(meIcon())};
// The nine swatches a day's pencil offers: the palette, then white.
window.__DAY_SWATCHES__ = ${JSON.stringify([...DAY_PALETTE, DAY_BLACK])};
</script>
<!-- The Plan view's arithmetic, checked against src/lib/plan.ts by a test. -->
<script>${PLAN_CLIENT}</script>
<script type="module">
${CLIENT}
</script>
</body>
</html>`;
}
