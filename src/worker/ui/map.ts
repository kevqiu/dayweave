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

/**
 * The 272px band across the top of `design/SignIn.dc.html`.
 *
 * A quiet map with a dashed thread through six pins, which the artboard's own
 * comment calls "the day ramp read left to right". The six are transcribed
 * rather than taken from `dayHue`: they are close to it but not equal, and on
 * this screen they are a drawing of a trip rather than any trip's days, so the
 * artboard is what they answer to.
 *
 * The pins sit on the 375 x 272 box rather than inside the SVG's own
 * coordinate space, which is why this returns a block of markup and not one
 * `<svg>`: the artboard positions them the same way.
 */
export function signInMap(): string {
  /*
   * The pins are drawn *inside* the SVG, in its own coordinates.
   *
   * The artboard positions them as absolutely-placed divs at `left: 58px;
   * top: 236px` while the dashed thread is a path at `M58 236` in a viewBox of
   * `30 60 330 240`. Those are two different coordinate spaces — the viewBox
   * maps 58 to about 32 screen pixels and 236 to about 200 — so the thread
   * misses every pin it is supposed to run through, by tens of pixels, and
   * misses by a different amount at every window size.
   *
   * Putting the circles in the path's own space fixes it at every size and for
   * free. The radii are the artboard's diameters scaled by the same 0.88 the
   * viewBox applies, so they come out the size it drew them.
   */
  const K = 330 / 375;
  const pins = [
    { x: 58, y: 236, d: 17, hex: "#3F6B4A" },
    { x: 118, y: 212, d: 15, hex: "#70864D" },
    { x: 178, y: 214, d: 15, hex: "#AD8A49" },
    { x: 232, y: 232, d: 15, hex: "#CE8845" },
    { x: 282, y: 210, d: 15, hex: "#E0B054" },
    { x: 306, y: 96, d: 14, hex: "#F0DCA6" },
  ];

  const circles = pins
    .map(
      (p) =>
        `<circle cx="${p.x}" cy="${p.y}" r="${((p.d / 2) * K).toFixed(1)}" fill="${p.hex}" ` +
        `stroke="${C.paper}" stroke-width="2.65"></circle>`,
    )
    .join("\n  ");

  return `<svg width="375" height="272" viewBox="30 60 330 240" style="display:block">
  <rect width="390" height="396" fill="${C.mapFill}"></rect>
  <path d="M0 306 C 78 288, 138 322, 208 310 C 282 297, 326 328, 390 314 L390 396 L0 396 Z" fill="#D9E4E3"></path>
  <path d="M232 44 C 292 38, 336 76, 338 128 C 340 182, 292 208, 248 194 C 204 180, 196 110, 232 44 Z" fill="#E2E9D7"></path>
  <g stroke="#E7DFD0" stroke-width="1" fill="none">
    <path d="M0 84 H390 M0 156 H390 M0 232 H390 M64 0 V306 M148 0 V306 M240 0 V306 M320 0 V306"></path>
  </g>
  <g stroke="#FCF9F2" stroke-linecap="round" fill="none">
    <path d="M-10 118 C 90 110, 152 178, 244 172 C 318 167, 352 212, 400 206" stroke-width="9"></path>
    <path d="M100 -10 C 108 84, 84 190, 112 268 C 138 340, 120 360, 132 410" stroke-width="9"></path>
    <path d="M276 -10 C 272 88, 296 168, 274 248 C 256 306, 272 330, 264 380" stroke-width="6"></path>
  </g>
  <path d="M58 236 C 104 200, 134 250, 178 214 C 218 182, 236 246, 282 210 C 316 184, 330 132, 306 96" fill="none" stroke="#B0A794" stroke-width="1.6" stroke-dasharray="1 6" stroke-linecap="round" opacity="0.8"></path>
  ${circles}
</svg>
<div class="signin-fade"></div>`;
}
