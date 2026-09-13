import { COLOR as C, FRAME, SANS, SERIF } from "./tokens.ts";

/**
 * The stylesheet, transcribed from `design/*.dc.html`.
 *
 * The artboards hold their styles inline on each element. Collecting them into
 * classes here is the only liberty taken: the values themselves are copied,
 * including the ones that look odd on their own — 13.5px row titles, 10.5px
 * secondary lines, a 1.5px field border — because those are what the design
 * actually specifies.
 */
export function styles(): string {
  return `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: ${C.map};
  color: ${C.ink};
  font-family: ${SANS};
  display: flex; align-items: center; justify-content: center; min-height: 100vh;
}
a { color: ${C.link}; text-decoration: none; }
button { font-family: ${SANS}; cursor: pointer; }
[hidden] { display: none !important; }

/* Every phone artboard is 375x667 and clips. On a real phone it fills. */
#frame {
  position: relative; width: ${FRAME.width}px; height: ${FRAME.height}px;
  overflow: hidden; background: ${C.paper};
}
@media (max-width: 420px), (max-height: 700px) {
  body { display: block; }
  #frame { width: 100vw; height: 100dvh; }
}

.screen { position: absolute; inset: 0; display: flex; flex-direction: column; background: ${C.paper}; }
.serif { font-family: ${SERIF}; font-weight: 500; }

/* ---- Trips (design/Trips.dc.html) ---- */
.trips-bar { display: flex; align-items: center; gap: 12px; height: 52px; padding: 0 16px; flex-shrink: 0; }
.trips-title { font-family: ${SERIF}; font-size: 21px; font-weight: 500; flex-grow: 1; }
.me-avatar {
  width: 32px; height: 32px; border-radius: 50%; border: 1px solid ${C.border};
  background: ${C.accent}; color: #FFF9F0; font-size: 12px; font-weight: 700; padding: 0;
}
.trips-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 76px; }
.section-label {
  padding: 0 16px 6px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.1em; color: ${C.greyer};
}
.section-label.spaced { padding-top: 10px; }

.trip-card {
  margin: 0 14px 12px; border-radius: 16px; border: 1.5px solid #C6DBC2;
  background: ${C.card}; overflow: hidden; width: calc(100% - 28px);
  padding: 0; text-align: left; display: block; color: inherit; font: inherit;
}
.trip-card-map { height: 62px; background: #E9F1E6; position: relative; overflow: hidden; }
.trip-card-day {
  position: absolute; right: 12px; top: 11px; font-size: 9.5px; font-weight: 700;
  letter-spacing: 0.07em; color: ${C.todayInk}; background: rgba(255,252,246,0.92);
  border-radius: 5px; padding: 3px 7px;
}
.trip-card-body { padding: 11px 13px 13px; }
.trip-card-name { font-family: ${SERIF}; font-size: 17px; font-weight: 500; }
.trip-card-sub { font-size: 11.5px; color: ${C.grey}; margin-top: 3px; }
.trip-card-foot { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.trip-card-count { font-size: 11px; color: ${C.grey}; font-variant-numeric: tabular-nums; }
.progress { height: 5px; border-radius: 3px; background: #EFE6D6; margin-top: 8px; overflow: hidden; }
.progress > div { height: 100%; background: ${C.today}; }

.trip-row {
  margin: 0 14px 10px; border-radius: 14px; border: 1px solid ${C.borderWarm};
  background: ${C.card}; padding: 10px 13px; display: flex; align-items: center; gap: 11px;
  width: calc(100% - 28px); text-align: left; color: inherit; font: inherit;
}
.trip-row.past { border-color: ${C.line}; background: transparent; opacity: 0.7; padding: 9px 13px; }
.date-tile {
  width: 42px; height: 42px; border-radius: 11px; background: ${C.yellowTile};
  display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;
}
.date-tile.past { width: 38px; height: 38px; background: ${C.greyTile}; }
.date-tile .m { font-size: 8.5px; font-weight: 700; color: ${C.aheadInk}; letter-spacing: 0.06em; }
.date-tile .d { font-size: 14px; font-weight: 700; color: #6B5426; line-height: 1; }
.date-tile.past .m { font-size: 8px; color: ${C.greyer}; }
.date-tile.past .d { font-size: 13px; color: #8C8479; }
.trip-row-text { display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0; }
.trip-row-name { font-size: 14.5px; font-weight: 600; }
.trip-row.past .trip-row-name { font-size: 13.5px; font-weight: 500; color: ${C.inkSoft}; }
.trip-row-sub { font-size: 11px; color: ${C.grey}; }
.trip-row.past .trip-row-sub { font-size: 10.5px; color: ${C.greyer}; }

.avatars { display: flex; }
.avatars > span {
  width: 24px; height: 24px; border-radius: 50%; color: #FFF9F0; font-size: 9px;
  font-weight: 700; display: flex; align-items: center; justify-content: center;
  border: 2px solid ${C.card};
}
.avatars > span + span { margin-left: -8px; }
.avatars.small > span { width: 22px; height: 22px; font-size: 8.5px; margin-left: 0; }
.avatars.small > span + span { margin-left: -7px; }

.trips-foot {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 14px 18px;
  background: linear-gradient(to top, ${C.paper} 68%, rgba(251,246,238,0));
}
.btn-dark {
  width: 100%; height: 40px; border-radius: 10px; border: none; background: ${C.ink};
  color: ${C.paper}; font-size: 14px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.btn-dark:disabled { opacity: 0.4; }

/* ---- New trip (design/NewTrip.dc.html) ---- */
.top-bar { display: flex; align-items: center; gap: 10px; height: 48px; flex-shrink: 0; padding: 0 12px; }
.icon-btn {
  width: 30px; height: 30px; border-radius: 9px; border: 1px solid ${C.border};
  background: ${C.card}; display: flex; align-items: center; justify-content: center; padding: 0;
}
.top-bar-title { font-family: ${SERIF}; font-size: 17px; font-weight: 500; flex-grow: 1; }
.ask { font-family: ${SERIF}; font-size: 23px; font-weight: 500; line-height: 1.15; margin-bottom: 11px; }
.ask.small { font-size: 17px; margin-bottom: 0; }
.underlined { border-bottom: 1.5px solid ${C.ink}; padding-bottom: 9px; }
.underlined input {
  width: 100%; border: 0; background: transparent; padding: 0; outline: none;
  font-family: ${SANS}; font-size: 16px; font-weight: 500; color: ${C.ink};
  caret-color: ${C.accent};
}
.underlined input::placeholder { color: ${C.faint}; }

.cal { display: grid; grid-template-columns: repeat(7, 1fr); }
.dw { height: 22px; display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; color: ${C.greyer}; }
.cal button {
  height: 34px; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: #4A443C; font-variant-numeric: tabular-nums;
  background: transparent; border: 0; padding: 0; font-family: ${SANS};
}
.cal button.off { color: #CFC6B8; pointer-events: none; }
.cal button.in { background: #F3EAD8; }
.cal button.s { background: #F3EAD8; border-radius: 999px 0 0 999px; }
.cal button.e { background: #F3EAD8; border-radius: 0 999px 999px 0; }
.cal button.s.e { border-radius: 999px; }
.cal .cap {
  width: 28px; height: 28px; border-radius: 50%; background: ${C.ink}; color: ${C.paper};
  font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.month-name { font-size: 13px; font-weight: 700; padding: 16px 4px 2px; }
.new-trip-foot {
  flex-shrink: 0; border-top: 1px solid ${C.sheetEdge}; background: ${C.paper}; padding: 12px 14px 16px;
}
.range-line { display: flex; align-items: center; gap: 9px; margin-bottom: 16px; }
.range-line .r { font-size: 14px; font-weight: 600; flex-grow: 1; }
.range-line .n { font-size: 12px; color: ${C.grey}; }

/* ---- Trip: top bar, map, sheet (design/Main.dc.html, EmptyTrip.dc.html) ---- */
.trip-bar {
  position: absolute; top: 0; left: 0; right: 0; height: 50px; z-index: 30;
  display: flex; align-items: center; gap: 9px; padding: 0 12px;
  background: ${C.paper}; border-bottom: 1px solid ${C.border};
}
.trip-bar-text { display: flex; flex-direction: column; gap: 1px; flex-grow: 1; min-width: 0; }
.trip-bar-name {
  font-family: ${SERIF}; font-size: 17px; font-weight: 500; letter-spacing: -0.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.trip-bar-sub { font-size: 10.5px; color: #8C8479; letter-spacing: 0.01em; }
.trip-bar .avatars > span { border-color: ${C.paper}; font-size: 10.5px; font-weight: 600; }
.round-btn {
  width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%; border: 1px solid ${C.borderWarm};
  background: ${C.card}; display: flex; align-items: center; justify-content: center; padding: 0;
}
.map { position: absolute; top: 50px; left: 0; right: 0; bottom: 0; background: ${C.map}; overflow: hidden; }
.map-chip {
  position: absolute; left: 10px; top: 10px; display: flex; align-items: center; gap: 8px;
  background: rgba(255,252,246,0.94); border: 1px solid ${C.borderWarm}; border-radius: 999px;
  padding: 5px 10px 5px 9px; box-shadow: 0 1px 3px rgba(80,66,44,0.08);
}
.map-chip .k { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; }
.map-chip .k i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.map-chip .empty { font-size: 10.5px; color: ${C.grey}; }
.map-controls { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 7px; }
.map-controls button {
  width: 34px; height: 34px; border-radius: 10px; border: 1px solid ${C.borderWarm};
  background: ${C.card}; box-shadow: 0 1px 3px rgba(80,66,44,0.10);
  display: flex; align-items: center; justify-content: center; padding: 0;
}
/* Centred on the point, like the real map's markers. */
.pin { position: absolute; transform: translate(-50%, -50%); }
.pin > i {
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; border: 2.5px solid ${C.card};
  box-shadow: 0 2px 6px rgba(70,58,40,0.22);
  color: ${C.card}; font-family: ${SANS}; font-weight: 700; line-height: 1;
  font-style: normal;
}
.pin > i > svg { display: block; }

.sheet {
  position: absolute; left: 0; right: 0; bottom: 0; background: ${C.paper};
  border-radius: 20px 20px 0 0; box-shadow: 0 -6px 24px rgba(84,68,44,0.16);
  display: flex; flex-direction: column; z-index: 20; border-top: 1px solid ${C.sheetEdge};
}
.grabber {
  padding: 7px 0 4px; display: flex; justify-content: center; flex-shrink: 0;
  cursor: grab; position: relative; touch-action: none;
}
.grabber:active { cursor: grabbing; }
/* The bar the artboard draws is 38x4 inside a 15px row, which is far under
   both the Apple and Google tap floors (PLAN.md section 11, item 5). This
   extends what a thumb can catch to about 34px without moving anything. */
.grabber::after { content: ""; position: absolute; left: 0; right: 0; top: -9px; bottom: -10px; }
.grabber > i { width: 38px; height: 4px; border-radius: 3px; background: #DCD1BD; display: block; }
.sheet.full .grabber > i { background: #C9BDA6; }

/* Main.dc.html toggles the sheet between 312 and 617 of its 667, so the full
   state is everything below the 50px top bar. Kept as a ratio and a calc so a
   phone that is not 667 tall gets the same proportions. */
.sheet.stops { height: 46.8%; transition: height 160ms ease; }
.sheet.stops.full { height: calc(100% - 50px); }
.sheet.stops.dragging { transition: none; }

/* Pulling a sheet down to put it away, iOS-style: the handle follows the
   thumb, and a pull that does not get far enough springs back. The transform
   is only animated on the way back, so the drag itself is not lagged. */
.sheet { transition: transform 180ms cubic-bezier(0.2, 0.8, 0.3, 1); }
.sheet.dragging { transition: none; }

/* The header the sheet grows into (design/SheetFull.dc.html). */
/* SheetFull.dc.html's header row, without its "All stops" title — see the
   note in client.ts. The pill keeps the row's own padding and sits where the
   artboard puts it, at the right. */
.all-stops {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 10px; padding: 2px 14px 10px; flex-shrink: 0;
}
.filter-pill {
  height: 28px; border-radius: 999px; border: 1px solid ${C.border}; background: ${C.card};
  color: ${C.inkSoft}; font-size: 11.5px; font-weight: 600; padding: 0 11px; font-family: ${SANS};
}
.filter-pill[aria-pressed="true"] {
  background: ${C.greenTile}; border-color: #BFD4BB; color: ${C.todayInk};
}
.sheet-scroll { flex-grow: 1; overflow-y: auto; padding: 0 0 16px; }

.day-head {
  display: flex; align-items: center; gap: 9px; padding: 0 14px; height: 40px;
  width: 100%; background: transparent; border: 0; text-align: left; font-family: ${SANS};
}
.day-head.open { background: ${C.highlight}; }
.day-hue { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; opacity: 0.45; }
.day-head.open .day-hue { opacity: 1; }
.day-head-text { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
.day-head-top { display: flex; align-items: baseline; gap: 7px; }
.day-label { font-size: 12.5px; font-weight: 500; color: ${C.inkSoft}; }
.day-head.open .day-label { font-weight: 700; color: ${C.ink}; }
.today-tag {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.07em; color: ${C.todayInk};
  background: ${C.greenTile}; border-radius: 4px; padding: 2px 5px;
}
.day-place { font-size: 10px; color: ${C.greyer}; }
.day-progress { font-size: 10px; color: ${C.greyer}; font-variant-numeric: tabular-nums; }
.day-wrap { border-bottom: 1px solid ${C.line}; }
.day-wrap.open { border-bottom-color: ${C.sheetEdge}; }
.day-body { padding: 0 0 8px; }

.stop { margin: 0 9px 3px; border-radius: 10px; background: transparent; border: 1px solid transparent; }
.stop.selected { background: ${C.card}; border-color: ${C.borderWarm}; }
.stop-row {
  display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 10px 0 6px;
  width: 100%; background: transparent; border: 1px solid transparent;
}
.stop-time { font-size: 11px; font-weight: 600; width: 36px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.stop-text { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
.stop-name {
  font-size: 12.5px; font-weight: 500; color: ${C.ink};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stop.done .stop-name { text-decoration: line-through; color: ${C.greyer}; }
.stop-meta {
  font-size: 9.5px; color: ${C.meta};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stop-meta:empty { display: none; }
.stop-author {
  width: 17px; height: 17px; border-radius: 50%; color: #FFF9F0; font-size: 7.5px;
  font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.stop.done .stop-author { opacity: 0.45; }
.stop-dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid; flex-shrink: 0; }

/*
 * The row's half of the map's numbered pin.
 *
 * Transparent, so it reads as a reference to the dot on the map rather than
 * as a second dot. 17px is the smallest circle two digits still sit in at
 * 9.5px, which is the size the artboards use for their smallest meta.
 */
.stop-index {
  width: 17px; height: 17px; border-radius: 50%; border: 1.2px solid;
  background: transparent; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 9.5px; font-weight: 700; line-height: 1;
}
.stop-index.bed { border-style: solid; }
.stop-index > svg { display: block; }

/* ---- Dragging a stop (design/SheetFull.dc.html, PLAN.md section 4e) ---- */

/* The handle is its own target, outside the row's tap area, so grabbing it
   never reads as selecting the stop. 11x15 of ink in a 30px reach. */
.grip {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 22px; height: 30px; margin: 0 -4px; background: none; border: 0; padding: 0;
  touch-action: none; cursor: grab;
}
.grip:active { cursor: grabbing; }
.stop-tap {
  display: flex; align-items: center; gap: 8px; flex-grow: 1; min-width: 0; height: 42px;
  background: transparent; border: 0; padding: 0; text-align: left; font-family: ${SANS};
}

/* The slot the row came from, held open while it is in the air. */
.stop.ghost { opacity: 0.45; }
.stop.ghost .stop-row {
  border: 1px dashed #C7B98F; border-radius: 10px; background: transparent;
}

/* The row itself, in the air and following the finger. */
.lifted {
  position: absolute; z-index: 60; left: 9px; right: 9px; pointer-events: none;
  display: flex; align-items: center; gap: 10px; height: 46px; padding: 0 10px 0 7px;
  border-radius: 12px; background: ${C.card}; border: 1px solid ${C.borderWarm};
  box-shadow: 0 10px 22px rgba(84,68,44,0.20); transform: rotate(-1.1deg) scale(1.015);
}
.lifted .stop-name { font-weight: 600; }

/* Where it would land: a green thread with the walk it would add. */
.drop-line { display: flex; align-items: center; gap: 8px; padding: 0 8px; height: 14px; }
.drop-line .dot { width: 7px; height: 7px; border-radius: 50%; background: ${C.today}; flex-shrink: 0; }
.drop-line .thread { flex-grow: 1; height: 2px; border-radius: 2px; background: ${C.today}; }
.drop-line .when {
  font-size: 10px; font-weight: 700; color: ${C.todayInk}; letter-spacing: 0.04em; white-space: nowrap;
}

/* A collapsed day the stop can be dropped on to. */
.day-head.droppable { background: #FCF6E6; border-bottom: 1px dashed #C7B98F; }
.day-head .drop-here {
  font-size: 10.5px; font-weight: 700; color: ${C.aheadInk}; letter-spacing: 0.04em; white-space: nowrap;
}

/* Holding a dragged stop over a collapsed day springs it open.
   No artboard draws this — SheetFull.dc.html only shows the static DROP HERE
   TO MOVE state — so it is built from the palette. The skeleton grows as you
   hold, so the opening itself is the progress bar. */
.day-skeleton { overflow: hidden; will-change: height; }
.skel-row {
  height: 42px; margin: 0 9px 3px; border-radius: 10px;
  background: linear-gradient(90deg, ${C.line} 0%, ${C.paper} 50%, ${C.line} 100%);
  background-size: 300px 100%;
  animation: shimmer 1.15s linear infinite;
}
.skel-row:nth-child(2) { animation-delay: 0.12s; }
.skel-row:nth-child(3) { animation-delay: 0.24s; }
@keyframes shimmer {
  from { background-position: -150px 0; }
  to { background-position: 150px 0; }
}

/* The card shrinks as it is held, so it reads as going *into* the list rather
   than sitting on top of it. Set frame by frame while the finger is still. */
.lifted { transition: none; }

@media (prefers-reduced-motion: reduce) {
  .skel-row { animation: none; background: ${C.line}; }
  .sheet.stops { transition: none; }
}

.stop-actions { padding: 0 7px 7px 36px; position: relative; }
.stop-note { display: flex; gap: 6px; padding-bottom: 7px; }
.stop-note > i { width: 2px; border-radius: 2px; background: #E0D5BF; flex-shrink: 0; }
.stop-note > span { font-size: 10.5px; color: #736C62; line-height: 1.4; }
.action-row { display: flex; gap: 6px; }
.action {
  flex-grow: 1; flex-basis: 0; min-width: 0; height: 30px; border-radius: 8px;
  border: 1px solid ${C.border}; background: ${C.card}; color: ${C.inkSoft};
  font-size: 11px; font-weight: 600; display: flex; align-items: center;
  justify-content: center; gap: 4px; padding: 0;
}
.action.dark { border: none; background: ${C.ink}; color: ${C.paper}; }
.action.on { background: ${C.greenTile}; border-color: #BFD4BB; color: ${C.todayInk}; }
.action.kebab { width: 34px; flex-grow: 0; flex-basis: auto; flex-shrink: 0; }
.add-stop {
  margin: 3px 9px 2px; width: calc(100% - 18px); height: 22px; border-radius: 8px;
  border: none; background: ${C.line}; display: flex; align-items: center;
  justify-content: center; padding: 0;
}

.empty-state { padding: 22px 20px 16px; text-align: center; }
.empty-state h3 { font-family: ${SERIF}; font-size: 17px; font-weight: 500; margin: 0; }
.empty-state p { font-size: 11.5px; color: ${C.grey}; line-height: 1.5; margin: 5px 0 0; }
.empty-actions { display: flex; gap: 7px; margin-top: 15px; }
.empty-actions button {
  flex-grow: 1; height: 38px; border-radius: 10px; font-size: 12.5px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.empty-actions .primary { border: none; background: ${C.ink}; color: ${C.paper}; }
.empty-actions .secondary { border: 1px solid ${C.border}; background: ${C.card}; color: ${C.inkSoft}; }

/* ---- Place search (design/PlaceSearch.dc.html) ---- */

/* The artboard has no top bar on this screen: the map header runs to the top
   of the frame and the sheet sits over its lower 28px. */
.screen.searching .trip-bar { display: none; }
.screen.searching .map { top: 0; }

/* The bias circle, dashed in the terracotta the accent already uses. */
.bias-circle {
  position: absolute; border-radius: 50%; border: 1.5px dashed ${C.accent};
  background: rgba(196,130,106,0.06); transform: translate(-50%, -50%);
  pointer-events: none;
}
/* The result being looked at. Bigger than a trip pin, and the only
   terracotta thing on the map. */
.result-pin {
  position: absolute; width: 22px; height: 22px; border-radius: 50%;
  background: ${C.accent}; border: 3px solid ${C.card};
  box-shadow: 0 2px 8px rgba(70,58,40,0.25);
  transform: translate(-50%, -50%); pointer-events: none;
}
/* A stop already on the trip, behind the circle. */
.trip-pin {
  position: absolute; width: 15px; height: 15px; border-radius: 50%;
  background: ${C.today}; border: 2.5px solid ${C.card};
  transform: translate(-50%, -50%); pointer-events: none;
}
.pin-halo {
  position: absolute; width: 34px; height: 34px; border-radius: 50%;
  background: rgba(111,154,107,0.20); transform: translate(-50%, -50%); pointer-events: none;
}

.result.looking { background: ${C.highlight}; }

.search-head { padding: 6px 13px 8px; flex-shrink: 0; }

/* Leaving the search, said in words rather than drawn as an X in the field.
   Matches the Back to trips item in design/TripMenu.dc.html: the same arrow at
   16px and the same 13px label. */
/*
 * What the search is adding to. Where the "Back to trip" button used to be:
 * the same place in the sheet, saying what this is for rather than what is
 * behind it. The grabber above it is the way out.
 */
.search-target {
  display: flex; align-items: center; gap: 6px; padding: 0 4px 8px;
  font-size: 11.5px; font-weight: 600; color: ${C.grey};
}
.search-target svg { opacity: 0.75; }
.search-field {
  height: 40px; border-radius: 10px; border: 1.5px solid ${C.ink}; background: ${C.card};
  display: flex; align-items: center; gap: 10px; padding: 0 13px;
}
.search-field input {
  flex-grow: 1; border: 0; background: transparent; outline: none; padding: 0;
  font-family: ${SANS}; font-size: 14px; font-weight: 500; color: ${C.ink};
  caret-color: ${C.accent}; min-width: 0;
}
.search-field input::placeholder { color: ${C.faint}; font-weight: 400; }

.chips { display: flex; align-items: center; gap: 7px; margin-top: 10px; min-width: 0; }
.chip {
  display: flex; align-items: center; gap: 6px; height: 28px; border-radius: 999px;
  background: ${C.highlight}; border: 1px solid ${C.borderWarm}; padding: 0 11px;
  font-size: 11px; font-weight: 600; color: ${C.inkSoft}; font-family: ${SANS};
  /* One line, always. A wrapped chip is 28px twice over and breaks the row. */
  white-space: nowrap; min-width: 0;
}
.chip > span { overflow: hidden; text-overflow: ellipsis; }
.chip.plain { background: transparent; border-color: ${C.border}; color: ${C.grey}; flex-shrink: 0; }
.results { flex-grow: 1; overflow-y: auto; }

.result {
  display: flex; align-items: center; gap: 11px; padding: 0 16px; height: 52px;
  border-top: 1px solid ${C.line}; width: 100%; background: transparent;
  border-left: 0; border-right: 0; border-bottom: 0; text-align: left; font-family: ${SANS};
}
.result.on-trip { background: ${C.highlight}; }
.result.far { height: 50px; opacity: 0.65; }
.result-tile {
  width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center;
  justify-content: center; flex-shrink: 0; background: ${C.greenTile};
}
.result-tile.yellow { background: ${C.yellowTile}; }
.result-tile.grey { background: ${C.greyTile}; }
.result-tap {
  display: flex; align-items: center; gap: 11px; flex-grow: 1; min-width: 0;
  background: transparent; border: 0; padding: 0; text-align: left; font-family: ${SANS};
}
.result-text { display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0; }
.result-name {
  font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.result.far .result-name { font-size: 13px; font-weight: 500; color: ${C.inkSoft}; }
.result-meta { font-size: 10.5px; color: ${C.grey}; }
.result.on-trip .result-meta { color: ${C.aheadInk}; }
.result.far .result-meta { color: #A8A093; }
.result-add {
  width: 32px; height: 32px; border-radius: 9px; border: 1px solid ${C.border};
  background: ${C.card}; display: flex; align-items: center; justify-content: center;
  padding: 0; flex-shrink: 0;
}
.result-tag { font-size: 11px; font-weight: 600; color: ${C.grey}; flex-shrink: 0; }
.result-hint { padding: 14px 16px; font-size: 11.5px; color: ${C.grey}; }

/* ---- Move to day (design/MoveToDay.dc.html) ---- */
.scrim { position: absolute; inset: 0; background: rgba(51,48,43,0.34); z-index: 40; }
.scrim.light { background: rgba(51,48,43,0.22); }
.sheet.modal {
  z-index: 41; box-shadow: 0 -8px 30px rgba(60,48,30,0.30); padding: 8px 0 16px;
  border-top: 0; max-height: 100%;
}
.modal-head { padding: 0 16px 11px; flex-shrink: 0; }
.modal-title { font-family: ${SERIF}; font-size: 16.5px; font-weight: 500; }
.modal-sub { font-size: 12.5px; color: #8C8479; margin-top: 3px; }

.best {
  margin: 0 12px 8px; border-radius: 13px; border: 1.5px solid #BFD4BB;
  background: #F2F7F0; padding: 11px 12px; flex-shrink: 0;
}
.best-tag { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.best-tag span {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: ${C.todayInk};
}
.best-day { display: flex; align-items: baseline; gap: 8px; }
.best-day .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; align-self: center; }
.best-day .label { font-size: 15px; font-weight: 600; }
.best-day .shape { font-size: 12px; color: #7A7268; }
.best-detail { font-size: 12px; color: #5E7A5C; line-height: 1.5; margin-top: 8px; }
.best-detail strong { font-weight: 600; }
.best-actions { display: flex; gap: 8px; margin-top: 12px; }
.best-actions .go {
  flex-grow: 1; height: 40px; border-radius: 10px; border: none; background: ${C.todayInk};
  color: #F6FBF5; font-size: 13.5px; font-weight: 600;
}
.best-actions .preview {
  height: 40px; border-radius: 10px; border: 1px solid #C6D6C2; background: transparent;
  color: ${C.todayInk}; font-size: 13px; font-weight: 600; padding: 0 14px;
}
.best-actions .preview[aria-pressed="true"] { background: #E4EEE1; }

.pick-label {
  padding: 4px 16px 6px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.1em; color: ${C.greyer}; flex-shrink: 0;
}
.pick-list { overflow-y: auto; }
.pick {
  display: flex; align-items: center; gap: 11px; height: 46px; padding: 0 16px;
  border-top: 1px solid ${C.line}; width: 100%; background: transparent;
  border-left: 0; border-right: 0; border-bottom: 0; text-align: left; font-family: ${SANS};
}
.pick .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.pick-text { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
.pick-name {
  font-size: 13.5px; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pick-why { font-size: 10.5px; color: ${C.meta}; }
.pick.past .dot { opacity: 0.45; }
.pick.past .pick-name { color: ${C.greyer}; }
.pick.past .pick-why { color: #B5ACA0; }
.pick.other-city .pick-why { color: #C08A6E; }

/* ---- Trip menu (design/TripMenu.dc.html) ---- */
.trip-menu {
  position: absolute; left: 10px; top: 46px; width: 208px; border-radius: 12px;
  background: ${C.card}; border: 1px solid ${C.borderWarm};
  box-shadow: 0 10px 30px rgba(84,68,44,0.26); overflow: hidden; z-index: 41;
}
.trip-menu button {
  display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 13px;
  width: 100%; background: transparent; border: 0; text-align: left; font-family: ${SANS};
  font-size: 13px; font-weight: 500; color: ${C.ink};
}
.trip-menu button.on { background: ${C.highlight}; font-weight: 600; }
/* Only the label grows. The icon spans are flex items too, and letting them
   stretch pushes the text off its left alignment. */
.trip-menu button .label { flex-grow: 1; text-align: left; }
.trip-menu .rule { height: 1px; background: ${C.sheetEdge}; }

/* ---- Note editor ----
   No artboard draws this. AddNote.dc.html only shows the button reading
   "Add note" rather than "Edit note", so the editor itself is written in the
   system's own language rather than copied from anywhere. */
.note-editor { padding: 0 16px; flex-shrink: 0; }
.note-editor textarea {
  width: 100%; min-height: 96px; resize: none; border-radius: 10px;
  border: 1.5px solid ${C.ink}; background: ${C.card}; padding: 10px 12px;
  font-family: ${SANS}; font-size: 13.5px; line-height: 1.5; color: ${C.ink};
  caret-color: ${C.accent}; outline: none;
}
.note-editor textarea::placeholder { color: ${C.faint}; }
.note-actions { display: flex; gap: 8px; margin-top: 12px; }
.note-actions button { height: 40px; border-radius: 10px; font-size: 13.5px; font-weight: 600; }
.note-actions .save { flex-grow: 1; border: none; background: ${C.ink}; color: ${C.paper}; }
.note-actions .cancel {
  border: 1px solid ${C.border}; background: ${C.card}; color: ${C.inkSoft}; padding: 0 14px;
}

/* Something an optimistic write could not finish, said once and dismissable.
   No artboard draws this: PLAN.md section 4g settles on last-writer-wins and
   never shows a conflict, but a write that failed outright still has to be
   admitted rather than silently dropped. Built from the palette. */
.toast {
  position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 45;
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-radius: 12px; background: ${C.card}; border: 1px solid #E0C2B4;
  box-shadow: 0 6px 20px rgba(84,68,44,0.20);
}
.toast span { flex-grow: 1; font-size: 11.5px; color: #8A5230; line-height: 1.4; }
.toast button {
  background: none; border: 0; padding: 0; font-family: ${SANS};
  font-size: 11.5px; font-weight: 700; color: ${C.link};
}


/* ---- The Plan view, one day a screen (design/PlannerMobile.dc.html) ---- */
.screen.plan { background: ${C.paper}; }
/* Main.dc.html floats the bar over the map. Here it is the first row of a
   column with nothing behind it, so it takes its own space. */
.screen.plan .trip-bar { position: static; flex-shrink: 0; }
/* The way into an empty stretch of the day, in the dashed language of the
   free slot rather than the sheet's filled pill. */
.clock-list .add-stop {
  margin: 12px 0 16px; width: 100%; border-radius: 7px;
  border: 1.2px dashed #E2D8C6; background: transparent; height: 26px;
}

.day-rail {
  height: 46px; flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  padding: 0 12px; border-bottom: 1px solid ${C.sheetEdge};
  overflow-x: auto; scrollbar-width: none;
}
.day-rail::-webkit-scrollbar { display: none; }
.rail-pill {
  height: 26px; border-radius: 999px; border: 1.2px solid ${C.borderWarm};
  background: transparent; display: flex; align-items: center; gap: 5px;
  padding: 0 9px; flex-shrink: 0; font-family: ${SANS}; font-size: 10px;
  color: ${C.inkSoft};
}
.rail-pill.past { border-color: transparent; background: ${C.doneRing}; color: ${C.greyer}; }
.rail-pill.on {
  height: 30px; border-color: transparent; background: ${C.ink}; color: ${C.paper};
  font-size: 11.5px; font-weight: 700; padding: 0 12px; gap: 6px;
}
.rail-hue { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

/* The day as a clock: the time down the side, the rows beside it, the gaps
   drawn to scale. */
.day-clock {
  flex-grow: 1; overflow-y: auto; display: flex; padding: 10px 12px 0 0; min-height: 0;
}
.clock-gutter {
  width: 44px; flex-shrink: 0; display: flex; flex-direction: column;
  align-items: flex-end; padding-right: 8px;
}
.clock-time {
  background: none; border: 0; padding: 0; width: 100%;
  display: flex; align-items: flex-start; justify-content: flex-end;
  font-family: ${SANS}; font-size: 9.5px; color: ${C.faint};
  font-variant-numeric: tabular-nums;
}
.clock-time.unset { opacity: 0.55; }
.clock-rule { width: 1.5px; background: ${C.sheetEdge}; flex-shrink: 0; margin-right: 11px; }
.clock-list { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; }

.plan-row { display: flex; flex-direction: column; }
.plan-row-top { display: flex; align-items: flex-start; gap: 7px; }
.plan-row .grip { margin-top: 3px; opacity: 0.35; }
.plan-name {
  font-size: 12.5px; font-weight: 500; display: block;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.plan-row.done .plan-name { color: ${C.greyer}; font-weight: 400; text-decoration: line-through; }
.plan-meta {
  font-size: 9.5px; color: ${C.meta}; margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.plan-meta:empty { display: none; }
.plan-meta.note { color: #736C62; }
.plan-author {
  width: 15px; height: 15px; border-radius: 50%; color: #FFF9F0; font-size: 6.5px;
  font-weight: 700; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.plan-row.done .plan-author { opacity: 0.45; }
.plan-row.ghost { opacity: 0.45; }

/* The gap the day is holding open, and the plus that fills it. */
.free-slot {
  margin-top: 9px; height: 22px; border-radius: 7px; border: 1.2px dashed #E2D8C6;
  background: transparent; display: flex; align-items: center; justify-content: center;
  gap: 6px; font-family: ${SANS}; font-size: 9.5px; color: ${C.faint};
}

/* The tray, which is why the Plan view is worth building on a phone. */
.plan-tray {
  flex-shrink: 0; border-top: 1px solid ${C.border}; background: ${C.highlight};
  padding: 8px 12px 12px; max-height: 38%; display: flex; flex-direction: column;
}
.plan-tray.full { max-height: 72%; }
.plan-tray .grabber { height: auto; padding-bottom: 8px; }
.tray-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.tray-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: ${C.greyer}; }
.tray-count { font-size: 10.5px; color: ${C.greyer}; font-variant-numeric: tabular-nums; }
.tray-more {
  background: none; border: 0; padding: 0; font-family: ${SANS};
  font-size: 10.5px; font-weight: 600; color: ${C.link};
}
.tray-sep { width: 1px; height: 12px; background: #E0D5BF; }
.round-btn.small { width: 22px; height: 22px; border-radius: 6px; }
.tray-strip { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.tray-strip::-webkit-scrollbar { display: none; }
.tray-list { display: flex; flex-direction: column; gap: 5px; overflow-y: auto; min-height: 0; }
.tray-empty { font-size: 10.5px; color: ${C.faint}; line-height: 1.5; }
.tray-card {
  border-radius: 9px; border: 1px solid ${C.borderWarm}; background: ${C.card};
  padding: 7px 9px; display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}
.tray-card .grip { opacity: 0.4; }
.tray-card.ghost { opacity: 0.45; border-style: dashed; }
.tray-name { font-size: 11px; font-weight: 600; white-space: nowrap; }
.tray-meta { font-size: 9px; color: ${C.meta}; white-space: nowrap; }
.tray-list .tray-name, .tray-list .tray-meta {
  overflow: hidden; text-overflow: ellipsis; display: block;
}
.tray-put { background: none; border: 0; padding: 0 2px; display: flex; }

/* No artboard draws a time editor; this is the note editor's shape. */
.time-editor { padding: 4px 16px 18px; }
.time-field {
  width: 100%; height: 44px; border: 0; border-bottom: 1.5px solid ${C.ink};
  background: transparent; font-family: ${SANS}; font-size: 17px; color: ${C.ink};
  padding: 0; outline: none;
}

/* ---- The Planner at a desk (design/Planner.dc.html) ---- */
#frame.wide { width: min(1440px, 100vw); height: min(900px, 100dvh); }
.screen.desk { background: ${C.paper}; }

.desk-bar {
  height: 60px; flex-shrink: 0; display: flex; align-items: center; gap: 16px;
  padding: 0 22px; border-bottom: 1px solid ${C.border};
}
.desk-name {
  font-family: ${SERIF}; font-size: 21px; font-weight: 500; color: ${C.ink};
  background: none; border: 0; padding: 0;
}
.segmented { display: flex; background: ${C.mapFill}; border-radius: 9px; padding: 3px; gap: 2px; }
.segmented button {
  font-family: ${SANS}; font-size: 12px; font-weight: 600; color: #8C8479;
  padding: 5px 13px; border-radius: 7px; border: 0; background: none;
}
.segmented button.on { color: ${C.ink}; background: ${C.card}; box-shadow: 0 1px 2px rgba(80,66,44,0.10); }
.segmented button:disabled { opacity: 0.45; }
.desk-pager { display: flex; align-items: center; gap: 4px; }
.sq-btn {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid ${C.border};
  background: ${C.card}; display: flex; align-items: center; justify-content: center; padding: 0;
}
.sq-btn:disabled { opacity: 0.4; }
.desk-range {
  font-size: 11px; color: ${C.grey}; font-variant-numeric: tabular-nums;
  min-width: 92px; text-align: center;
}
.desk-share {
  height: 35px; border-radius: 10px; border: none; background: ${C.ink}; color: ${C.paper};
  font-family: ${SANS}; font-size: 12.5px; font-weight: 600; padding: 0 14px;
}

.grid-main { flex-grow: 1; display: flex; min-height: 0; }
.grid-days { flex-grow: 1; display: flex; flex-direction: column; min-width: 0; }
/* 58 at the artboard's width. A narrower column puts the TODAY tag on a
   second line rather than breaking the date into three, and every column
   grows with it, so the hours below still start level. */
.grid-head {
  min-height: 58px; flex-shrink: 0; display: flex; border-bottom: 1px solid ${C.border};
}
.grid-gutter-head { width: 56px; flex-shrink: 0; border-right: 1px solid ${C.sheetEdge}; }
.gcol-head {
  flex: 1 1 0; min-width: 0; border-right: 1px solid ${C.sheetEdge}; padding: 8px 10px;
}
.gcol-head.past { opacity: 0.5; }
.gcol-head.today { background: ${C.highlight}; }
.gcol-top { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.gcol-hue { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.gcol-label { font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.gcol-head.today .gcol-label { font-weight: 700; }
.gcol-sub {
  font-size: 10.5px; color: ${C.grey}; margin-top: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gcol-sub.nothing { color: #C08A6E; }

/* 10px of air so the 08:00 label, which the artboard hangs at -6px, is not
   sliced in half by the top of the scroller. */
.grid-scroll { flex-grow: 1; overflow-y: auto; min-height: 0; padding-top: 10px; }
.grid-inner { display: flex; position: relative; }
.grid-gutter { width: 56px; flex-shrink: 0; border-right: 1px solid ${C.sheetEdge}; position: relative; z-index: 2; }
.hour-label { position: absolute; right: 9px; font-size: 10px; color: ${C.faint}; }
.band-label {
  position: absolute; right: 9px; font-size: 8.5px; font-weight: 700;
  letter-spacing: 0.07em; color: ${C.faint};
}
.grid-lines { position: absolute; left: 56px; right: 0; top: 0; bottom: 0; pointer-events: none; }
.grid-lines i { position: absolute; left: 0; right: 0; height: 1px; background: ${C.line}; }
.grid-lines i.band-rule { background: ${C.sheetEdge}; }

.gcol { flex: 1 1 0; min-width: 0; border-right: 1px solid ${C.sheetEdge}; position: relative; }
.gcol.past { opacity: 0.45; }
.gcol.today { background: #FBF5E9; }
.now-line { position: absolute; left: 0; right: 0; height: 1.5px; background: ${C.accent}; z-index: 3; }
.now-dot {
  position: absolute; left: -3px; width: 8px; height: 8px; border-radius: 50%;
  background: #3F6B4A; z-index: 3;
}

.gcard {
  position: absolute; left: 5px; right: 5px; border-radius: 8px; padding: 6px 8px;
  overflow: hidden; display: flex; align-items: flex-start; gap: 6px;
  background: #FBF2DC; border: 1px solid #E6D5A8;
}
.gcard.done { background: ${C.doneRing}; border-color: #DFD6C7; }
.gcard.now { background: #E9F1E6; border-color: #C6DBC2; }
.gcard.untimed { background: transparent; border: 1.5px dashed #DFD3BE; }
.gcard.selected {
  border: 1.5px solid ${C.ink}; box-shadow: 0 4px 14px rgba(84,68,44,0.20);
  z-index: 8; overflow: visible;
}
.gcard.ghost { opacity: 0.4; border-style: dashed; }
.gcard .grip { opacity: 0.45; margin-top: 1px; }
.gcard-text { min-width: 0; flex-grow: 1; }
.gcard-top { display: flex; align-items: center; gap: 5px; min-width: 0; }
.gcard-title {
  font-size: 11.5px; font-weight: 600; line-height: 1.25; color: #6B5426;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; min-width: 0;
}
.gcard.done .gcard-title { color: #8C8479; text-decoration: line-through; }
.gcard.now .gcard-title { color: #35502F; }
.gcard.untimed .gcard-title { color: ${C.inkSoft}; }
.gcard-author {
  width: 15px; height: 15px; border-radius: 50%; color: #FFF9F0; font-size: 6.5px;
  font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.gcard.done .gcard-author { opacity: 0.45; }
.gcard-sub {
  display: block; font-size: 9.5px; margin-top: 2px; color: #97803F;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gcard.done .gcard-sub { color: ${C.greyer}; }
.gcard.now .gcard-sub { color: #6C8A66; }
.gcard.untimed .gcard-sub { color: ${C.meta}; }

/* design/PlannerStop.dc.html: the three edits, and nothing else. */
.gpop {
  position: absolute; left: calc(100% + 7px); top: -8px; width: 194px;
  border-radius: 11px; background: ${C.card}; border: 1px solid ${C.borderWarm};
  box-shadow: 0 10px 28px rgba(84,68,44,0.24); overflow: hidden; z-index: 30;
  cursor: default;
}
.gpop-head { padding: 10px 13px 8px; border-bottom: 1px solid ${C.line}; }
.gpop-title { font-size: 12.5px; font-weight: 700; }
.gpop-sub { font-size: 10px; color: ${C.meta}; margin-top: 2px; }
.gpop-item {
  display: flex; align-items: center; gap: 9px; height: 42px; padding: 0 13px;
  width: 100%; background: none; border: 0; border-top: 1px solid ${C.line};
  font-family: ${SANS}; font-size: 13px; font-weight: 500; color: ${C.ink};
}
.gpop-item:first-of-type { border-top: 0; }
.gpop-item.danger { color: #A06B52; }
.gcol.flip .gpop { left: auto; right: calc(100% + 7px); }

/* The bar a dragged card would land on, and the hour it would land at. */
.grid-drop { position: absolute; height: 3px; border-radius: 2px; background: ${C.today}; z-index: 61; }
.grid-drop span {
  position: absolute; left: 0; top: -16px; font-size: 9.5px; font-weight: 700;
  color: ${C.todayInk}; letter-spacing: 0.04em; white-space: nowrap;
}

.tray-side {
  /* 252 at the artboard's width, and a quarter of a narrower one, so the
     columns keep the room they need on a tablet. */
  width: min(252px, 26vw); flex-shrink: 0; border-left: 1px solid ${C.border};
  display: flex; flex-direction: column; min-height: 0;
}
.tray-side-head {
  padding: 13px 15px 11px; border-bottom: 1px solid ${C.sheetEdge};
  display: flex; align-items: center; gap: 8px;
}
.tray-side-list {
  flex-grow: 1; overflow-y: auto; padding: 8px; display: flex;
  flex-direction: column; gap: 5px;
}
.tray-side-list .tray-card { padding: 8px 9px; gap: 7px; }
.tray-side-list .tray-name { font-size: 11.5px; }
.tray-side-list .tray-meta { font-size: 9.5px; }
.tray-side-foot { padding: 8px 10px 10px; border-top: 1px solid ${C.sheetEdge}; }
.add-place {
  width: 100%; height: 36px; border-radius: 10px; border: 1.5px dashed #DFD3BE;
  background: transparent; color: ${C.grey}; font-family: ${SANS}; font-size: 12px;
  font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px;
}

/* The Plan view's row is a card too: the tap target that opens its actions. */
.plan-tap {
  flex-grow: 1; min-width: 0; display: flex; align-items: center; gap: 8px;
  background: none; border: 0; padding: 0; text-align: left;
}
.plan-row.selected {
  background: ${C.highlight}; border-radius: 12px;
}
.plan-row.selected .stop-actions { padding-left: 0; }

/* A quiet inline error, in the terracotta the palette already uses. */
.err { padding: 10px 16px; font-size: 11.5px; color: ${C.link}; }

/* ---- Sign in (design/SignIn.dc.html) ---- */
.signin { justify-content: flex-start; }
.signin-map { height: 272px; flex-shrink: 0; position: relative; background: ${C.mapFill}; }
.signin-pin {
  position: absolute; border-radius: 50%; border: 3px solid ${C.paper};
  transform: translate(-50%, -50%);
}
.signin-fade {
  position: absolute; left: 0; right: 0; bottom: 0; height: 90px;
  background: linear-gradient(to bottom, rgba(251,246,238,0), ${C.paper});
}
/*
 * Above the map band, not behind it.
 *
 * The artboard pulls the heading up 16px so it sits *in* the fade at the foot
 * of the map. The map band is positioned and the body is not, so without this
 * the band paints over those 16px and the first line reads as cut in half —
 * which is exactly how it came out on the deployed page.
 */
.signin-body {
  position: relative; flex-grow: 1; display: flex; flex-direction: column;
  padding: 0 26px 26px;
}
.signin-head { margin-top: -16px; }
.signin-title {
  font-family: ${SERIF}; font-size: 31px; font-weight: 500;
  letter-spacing: -0.015em; line-height: 1.12;
}
.signin-sub {
  font-size: 13px; color: #8C8479; line-height: 1.5; margin-top: 11px;
  max-width: 280px; text-wrap: pretty;
}
.signin-google {
  width: 100%; height: 48px; border-radius: 12px; border: 1px solid ${C.borderWarm};
  background: ${C.card}; display: flex; align-items: center; justify-content: center;
  gap: 11px; box-shadow: 0 1px 3px rgba(80,66,44,0.08); padding: 0;
}
.signin-google[disabled] { opacity: 0.6; }
.signin-google span:last-child { font-size: 15px; font-weight: 600; color: ${C.ink}; }
/*
 * The G, and it is Google's now.
 *
 * The artboard drew a dashed circle round a letter and PLAN.md section 5 said
 * so: a placeholder, with the real asset to come from Google. It has come. The
 * dashed ring goes with the placeholder — a border round their mark is a
 * restyling of it, which their branding terms do not allow — and what is left
 * is the artboard's 22px box holding the mark at its own size.
 */
.signin-g {
  width: 22px; height: 22px; display: flex;
  align-items: center; justify-content: center;
}
.signin-promise {
  display: flex; align-items: flex-start; gap: 8px; margin-top: 13px;
}
.signin-promise svg { flex-shrink: 0; margin-top: 1px; }
.signin-promise span { font-size: 11.5px; color: ${C.grey}; line-height: 1.5; }

/* The account menu behind the header avatar, in the trip menu's own shape. */
.me-menu {
  position: absolute; top: 46px; right: 14px; z-index: 40; min-width: 148px;
  border-radius: 12px; border: 1px solid ${C.border}; background: ${C.card};
  box-shadow: 0 10px 24px rgba(80,66,44,0.14); overflow: hidden;
}
.me-menu-who {
  padding: 9px 13px 8px; border-bottom: 1px solid ${C.line};
  font-size: 11px; color: ${C.grey}; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.me-menu button {
  display: block; width: 100%; text-align: left; padding: 10px 13px;
  border: 0; background: none; font-size: 13px; color: ${C.ink};
}
`;
}
