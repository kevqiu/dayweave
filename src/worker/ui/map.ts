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

import { COLOR as C } from "./tokens.ts";

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
