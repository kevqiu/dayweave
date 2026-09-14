import { CLIENT } from "./client.ts";
import * as icons from "./icons.ts";
import { cardMap, mapBackground } from "./map.ts";
import { lookPinIcon, mapStyle, meIcon, pinIcon } from "./gmap.ts";
import { PLAN_CLIENT } from "./plan-client.ts";
import { styles } from "./styles.ts";
import { COLOR as C, DAY_PALETTE, DAY_WHITE, FONTS_HREF } from "./tokens.ts";

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
    search: icons.search({ size: 17, color: C.inkSoft }),
    searchLight: icons.search({ size: 14, color: C.paper }),
    close: icons.close({ size: 17, color: C.inkSoft }),
    plus: icons.plus({ size: 15, color: C.inkSoft }),
    plusGrey: icons.plus({ size: 14, color: C.grey, width: 2.6 }),
    // The plus on a free slot and in the Plan view's time gutter, both 11px
    // in design/PlannerMobile.dc.html.
    plusTiny: icons.plus({ size: 11, color: C.faint, width: 2.6 }),
    chevron: icons.chevron({ size: 13 }),
    chevronSmall: icons.chevron({ size: 11 }),
    calendar: icons.calendar({ size: 15, color: C.inkSoft }),
    invite: icons.invite({ size: 15, color: C.inkSoft }),
    navigateLight: icons.navigate({ size: 12, color: C.paper }),
    check: icons.check({ size: 12, color: C.inkSoft }),
    checkOn: icons.check({ size: 12, color: C.todayInk }),
    pencil: icons.pencil({ size: 12, color: C.inkSoft }),
    // The pencil on a day header, which opens its name and its colour.
    pencilDay: icons.pencil({ size: 12, color: C.greyer }),
    house: icons.house({ size: 15 }),
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
    checkSwatch: icons.check({ size: 12, color: "#FFFCF6", width: 3 }),
    // The same tick on the white swatch, where cream on cream is invisible.
    checkSwatchInk: icons.check({ size: 12, color: C.ink, width: 3 }),
    trashSmall: icons.trash({ size: 13 }),
  };
}

/**
 * The tab icon, inlined as a data URI so the Worker serves one document and no
 * second request. A plane, because that is the one thing every trip starts
 * with.
 */
const FAVICON = `data:image/svg+xml,${encodeURIComponent(icons.airplane())}`;

export function page(mapsKey = ""): string {
  const boot = {
    icons: iconSet(),
    map: mapBackground(),
    cardMap: cardMap(),
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${C.paper}">
<title>yvr.kocho.sh</title>
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
// Empty until a browser key is provisioned, and the drawn map stands in.
window.__MAPS_KEY__ = ${JSON.stringify(mapsKey)};
window.__MAP_STYLE__ = ${JSON.stringify(mapStyle())};
// Keyed by what statusOf() in the client actually returns. It used to say
// "today" here and "now" there, so every pin on today's day threw reading
// undefined and the real map came up empty on the one day that matters.
window.__PIN__ = ${JSON.stringify({
  now: { plain: pinIcon(C.today, false), selected: pinIcon(C.today, true) },
  ahead: { plain: pinIcon(C.ahead, false), selected: pinIcon(C.ahead, true) },
  done: { plain: pinIcon(C.done, false), selected: pinIcon(C.done, true) },
})};
window.__LOOK_PIN__ = ${JSON.stringify(lookPinIcon())};
window.__ME_PIN__ = ${JSON.stringify(meIcon())};
// The nine swatches a day's pencil offers: the palette, then white.
window.__DAY_SWATCHES__ = ${JSON.stringify([...DAY_PALETTE, DAY_WHITE])};
</script>
<!-- The Plan view's arithmetic, checked against src/lib/plan.ts by a test. -->
<script>${PLAN_CLIENT}</script>
<script type="module">
${CLIENT}
</script>
</body>
</html>`;
}
