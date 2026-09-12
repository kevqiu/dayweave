import { CLIENT } from "./client.ts";
import * as icons from "./icons.ts";
import { cardMap, mapBackground } from "./map.ts";
import { styles } from "./styles.ts";
import { COLOR as C, FONTS_HREF } from "./tokens.ts";

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
    closeFaint: icons.close({ size: 15, color: "#A59C90", width: 2.2 }),
    plus: icons.plus({ size: 15, color: C.inkSoft }),
    plusGrey: icons.plus({ size: 14, color: C.grey, width: 2.6 }),
    chevron: icons.chevron({ size: 13 }),
    chevronSmall: icons.chevron({ size: 11 }),
    calendar: icons.calendar({ size: 15, color: C.inkSoft }),
    invite: icons.invite({ size: 15, color: C.inkSoft }),
    navigateLight: icons.navigate({ size: 12, color: C.paper }),
    check: icons.check({ size: 12, color: C.inkSoft }),
    checkOn: icons.check({ size: 12, color: C.todayInk }),
    pencil: icons.pencil({ size: 12, color: C.inkSoft }),
    kebab: icons.kebab({ size: 15 }),
    grip: icons.grip(),
    gripDark: icons.grip({ color: C.inkSoft }),
    trash: icons.trash({ size: 15 }),
    layers: icons.layers({ size: 18, color: C.inkSoft }),
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
    pinInk: icons.pinDot({ size: 16, color: C.ink }),
    checkGreen: icons.check({ size: 14, color: C.todayInk }),
  };
}

export function page(): string {
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
</script>
<script type="module">
${CLIENT}
</script>
</body>
</html>`;
}
