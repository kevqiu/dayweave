/**
 * The drawn map, transcribed from `design/Main.dc.html`.
 *
 * PLAN.md section 2 wants MapLibre over a Protomaps basemap in R2, and the R2
 * bucket is still empty (see INFRA.md). Until a real basemap is there, the
 * artboards' own drawing is what the screen shows — it is the thing the design
 * specifies, and it keeps the palette honest rather than dropping a grey
 * placeholder into a warm page.
 *
 * Stops are projected on to it by their real coordinates, so the pins move
 * with the data even though the ground underneath them is drawn.
 *
 * The artboards label their water and their parks — HAKATA BAY, OHORI PARK,
 * NAKASU — because they draw one specific trip. Those labels are left out
 * here: printing "Hakata Bay" over a trip to Lisbon would be inventing
 * geography, which is the one thing a map must never do.
 */

import { COLOR as C, DAY_PALETTE } from "./tokens.ts";

export function mapBackground(): string {
  return `<svg width="100%" height="100%" viewBox="0 0 390 520" preserveAspectRatio="xMidYMid slice" style="display:block">
  <rect x="0" y="0" width="390" height="520" fill="${C.mapFill}"></rect>
  <path d="M0 392 C 70 372, 128 412, 196 400 C 268 388, 318 424, 390 404 L390 520 L0 520 Z" fill="#D9E4E3"></path>
  <path d="M244 44 C 296 40, 336 70, 340 116 C 344 164, 300 188, 258 178 C 216 168, 204 112, 244 44 Z" fill="#E2E9D7"></path>
  <path d="M28 200 C 62 190, 92 208, 90 236 C 88 262, 54 274, 32 258 C 12 244, 8 212, 28 200 Z" fill="#E2E9D7"></path>
  <g stroke="#E7DFD0" stroke-width="1" fill="none">
    <path d="M0 90 H390 M0 150 H390 M0 250 H390 M0 316 H390 M64 0 V392 M140 0 V392 M226 0 V392 M312 0 V392"></path>
  </g>
  <g stroke="#FCF9F2" stroke-linecap="round" fill="none">
    <path d="M-10 120 C 90 112, 150 178, 240 172 C 316 167, 350 210, 400 204" stroke-width="9"></path>
    <path d="M108 -10 C 116 86, 92 190, 120 268 C 146 340, 128 400, 140 530" stroke-width="9"></path>
    <path d="M272 -10 C 268 90, 292 170, 272 250 C 254 322, 270 366, 262 430" stroke-width="7"></path>
    <path d="M-10 300 C 80 292, 176 322, 268 306 C 330 296, 356 312, 400 306" stroke-width="6"></path>
    <path d="M40 40 C 120 60, 180 44, 236 76" stroke-width="3.5"></path>
    <path d="M60 218 C 130 230, 190 214, 250 236" stroke-width="3.5"></path>
    <path d="M150 356 C 210 344, 250 366, 320 352" stroke-width="3.5"></path>
  </g>
</svg>`;
}

/** The 62px strip across the top of a trip card, from `design/Trips.dc.html`. */
export function cardMap(): string {
  return `<svg width="100%" height="62" viewBox="0 0 360 78" preserveAspectRatio="xMidYMid slice" style="display:block">
  <rect width="360" height="78" fill="${C.greenTile}"></rect>
  <path d="M0 58 C 70 50, 130 66, 200 58 C 268 50, 310 66, 360 58 L360 78 L0 78 Z" fill="#D4E4D0"></path>
  <g stroke="#F4F9F2" stroke-width="5" fill="none" stroke-linecap="round">
    <path d="M-10 26 C 80 20, 140 44, 230 38 C 290 34, 330 46, 370 42"></path>
    <path d="M104 -8 C 110 30, 92 58, 116 86"></path>
  </g>
</svg>`;
}

export function signInMap(): string {
  const nodes = [{ x: 52, y: 252 }, { x: 122, y: 216 }, { x: 188, y: 226 }, { x: 252, y: 212 }, { x: 310, y: 158 }, { x: 282, y: 76 }];
  const route = "M52 252 C72 250 98 218 122 216 C148 214 162 230 188 226 C214 222 226 222 252 212 C278 202 312 186 310 158 C308 130 274 106 282 76";
  const path = `<path d="${route}" fill="none" stroke-width="6" stroke-dasharray="6 11" stroke-linejoin="round"/>`;
  const pins = nodes.map((point, i) => `<div class="trail-pin" style="left:${point.x / 4}%;top:${point.y / 3.6}%;--node-color:${DAY_PALETTE[i]};--marker-delay:${3.2 + i * .12}s"><div class="trail-location"><svg viewBox="-13 -17 26 34" aria-hidden="true"><path d="M0 14 C-3 10 -10 3 -10 -4 A10 10 0 1 1 10 -4 C10 3 3 10 0 14Z"/><circle cy="-4" r="3"/></svg></div></div>`).join("");
  const numbers = nodes.map((point, i) => `<g transform="translate(${point.x} ${point.y})" style="--node-color:${DAY_PALETTE[i]};--marker-delay:${3.2 + i * .12}s"><g class="trail-number"><circle r="10"/><text y="4" text-anchor="middle">${i + 1}</text></g></g>`).join("");
  const layer = (content: string, cls: string, lift: number) => `<svg viewBox="0 0 400 360" class="trail-layer ${cls}" style="--lift:${lift}px" aria-hidden="true">${content}</svg>`;
  const controls: [number, number, number, number][] = [[72, 250, 98, 218], [148, 214, 162, 230], [214, 222, 226, 222], [278, 202, 312, 186], [308, 130, 274, 106]];
  const blocks = controls.flatMap(([x1, y1, x2, y2], leg) => Array.from({ length: 6 }, (_, step) => {
    const a = nodes[leg]!, b = nodes[leg + 1]!, t = (step + .5) / 6, u = 1 - t;
    const x = u ** 3 * a.x + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * b.x;
    const y = u ** 3 * a.y + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * b.y;
    const angle = Math.atan2(3 * u ** 2 * (y1 - a.y) + 6 * u * t * (y2 - y1) + 3 * t ** 2 * (b.y - y2), 3 * u ** 2 * (x1 - a.x) + 6 * u * t * (x2 - x1) + 3 * t ** 2 * (b.x - x2)) * 180 / Math.PI;
    if (nodes.some((node) => Math.hypot(node.x - x, node.y - y) < 16)) return "";
    return `<div class="trail-block" style="left:${x / 4}%;top:${y / 3.6}%;--block-angle:${angle}deg;--reveal-delay:${3.2 + leg * .12}s;--wave-delay:${-(14 - (leg * 6 + step) * .448)}s"><div class="trail-block-solid"><i class="block-top"></i><i class="block-front"></i><i class="block-back"></i><i class="block-left"></i><i class="block-right"></i></div></div>`;
  })).join("");
  return `<div class="daytrail-scene" aria-label="A dotted daytrail rises from a map into a gently waving gold path" role="img">
    <div class="daytrail-plane">
      <svg class="trail-ground" viewBox="-1200 -1080 2800 2520" aria-hidden="true">
        <rect x="-1200" y="-1080" width="2800" height="2520" fill="${C.mapFill}"/>
        <g fill="#E2E9D7">
          <path d="M248 24 Q360 6 372 100 T288 150 Q220 130 248 24 M20 60 Q70 38 100 80 T70 138 Q10 134 20 60"/>
          <path d="M-380 -240 Q-160 -300 -130 -110 T-310 30 Q-440 -60 -380 -240 M570 -420 Q780 -480 810 -290 T640 -180 Q510 -260 570 -420 M650 310 Q840 240 900 430 T700 580 Q580 450 650 310 M-600 430 Q-390 370 -350 550 T-530 720 Q-700 590 -600 430"/>
          <path d="M-1050 -700 Q-800 -820 -740 -560 T-950 -370 Q-1170 -460 -1050 -700 M1060 -720 Q1320 -790 1360 -500 T1170 -330 Q970 -440 1060 -720 M1050 880 Q1260 770 1420 990 T1190 1250 Q1000 1130 1050 880 M-950 990 Q-750 840 -590 1030 T-800 1260 Q-1010 1190 -950 990"/>
        </g>
        <g stroke="#E3DCCD" stroke-width="1" fill="none">
          ${Array.from({ length: 25 }, (_, i) => { const x = -1240 + i * 120; return `<path d="M${x} -1080 Q${x + 80} -350 ${x + 20} 180 T${x + 60} 1440"/>`; }).join("")}
          ${Array.from({ length: 23 }, (_, i) => { const y = -1120 + i * 120; return `<path d="M-1200 ${y} Q-400 ${y + 60} 200 ${y + 10} T1600 ${y + 30}"/>`; }).join("")}
        </g>
        <path transform="translate(0 70)" d="M-1200 480 C-800 250 -420 590 -80 380 S440 260 700 530 S1230 760 1600 470" stroke="#D9E4E3" stroke-width="95" fill="none"/>
        <g stroke="#FFFCF6" stroke-width="9" fill="none">
          ${Array.from({ length: 10 }, (_, i) => { const x = -1140 + i * 310; return `<path d="M${x} -1080 C${x - 130} -610 ${x + 140} -250 ${x + 20} 190 S${x + 130} 970 ${x + 50} 1440"/>`; }).join("")}
          ${Array.from({ length: 9 }, (_, i) => { const y = -1030 + i * 310; return `<path d="M-1200 ${y} C-730 ${y + 120} -370 ${y - 120} 180 ${y + 20} S1120 ${y - 110} 1600 ${y + 40}"/>`; }).join("")}
        </g>
        <g class="trail-shadow" stroke="${C.brand}">${path}</g>
      </svg>
      ${blocks}
      ${pins}
      ${layer(`<g class="trail-nodes">${numbers}</g>`, "trail-top", 12)}
    </div>
  </div>`;
}
