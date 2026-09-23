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
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid ${C.brand}; outline-offset: 3px; }

/* Every phone artboard is 375x667 and clips. On a real phone it fills. */
/*
 * The frame is the phone, and only while there is a phone to be.
 *
 * It used to be 375 x 667 at every size above a phone, so a 2560px monitor got
 * a business card of an app floating in the middle of an ocean of cream, with
 * the Planner as the one exception — and even that was capped at 1440 x 900
 * and floated too. There is no reading of "the artboards are 375 wide" that
 * makes that right: the artboards are drawn at the size of the device they are
 * for, and a desk is a different device.
 *
 * So: below 780px it is the phone, filling whatever the phone gives it. At or
 * above, it fills the window, and each screen lays itself out for the room —
 * see the desk rules below, and design/Desktop.dc.html.
 */
#frame {
  position: relative; width: ${FRAME.width}px; height: ${FRAME.height}px;
  overflow: hidden; background: ${C.paper};
}
/* 420 was too narrow to be "a phone": an iPhone Pro Max is 430 CSS pixels
   across and 932 down, so it matched neither half of the query and got the
   375x667 artboard floating in the middle of the screen. The threshold is
   now the width at which the Planner's grid starts working (see WIDE in
   client.ts), so anything narrower than a small tablet fills. */
@media (max-width: 779px), (max-height: 700px) {
  body { display: block; }
  #frame { width: 100vw; height: 100dvh; }
}
@media (min-width: 780px) and (min-height: 560px) {
  body { display: block; }
  #frame { width: 100vw; height: 100dvh; }
}

/* The home indicator sits over the bottom of the viewport once Safari hides
   its toolbar, so everything anchored to the floor keeps clear of it. On a
   browser without an inset these all resolve to the padding they already had. */
.trips-foot { padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px)); }
.new-trip-foot { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
.sheet-scroll { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
.sheet.modal { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
.plan-tray { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }

.screen { position: absolute; inset: 0; display: flex; flex-direction: column; background: ${C.paper}; }
/* A one-column screen. On a phone the column is the screen; the desk rules
   further down turn it into a card the window holds. */
.card-column {
  flex-grow: 1; min-height: 0; width: 100%;
  display: flex; flex-direction: column; position: relative;
}
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
  position: relative;
  margin: 0 14px 12px; border-radius: 16px; border: 1.5px solid ${C.brandLight};
  background: ${C.card}; overflow: hidden; width: calc(100% - 28px);
  padding: 0; text-align: left; display: block; color: inherit; font: inherit;
}
.trip-card-map { height: 62px; background: #E9F1E6; position: relative; overflow: hidden; }
.trip-card-tools { position: absolute; top: 8px; right: 8px; z-index: 3; }
.trip-card-settings { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 1px solid ${C.border}; border-radius: 6px; background: ${C.card}; color: ${C.ink}; box-shadow: 0 2px 8px #33302B18; font-size: 20px; line-height: 1; }
.trip-card-menu { box-sizing: border-box; position: fixed; margin: 0; padding: 3px; width: 144px; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.card}; box-shadow: 0 8px 24px #33302B24; }
.trip-card-menu button { display: flex; align-items: center; gap: 7px; width: 100%; min-height: 32px; padding: 6px 8px; border: 0; border-radius: 5px; background: transparent; color: #963F32; font: inherit; font-size: 12px; }
.trip-card-menu button svg { width: 13px; height: 13px; }
.trip-card-settings:hover, .trip-card-menu button:hover { background: ${C.highlight}; }
.trip-card-settings:focus-visible, .trip-card-menu button:focus-visible, .trip-delete-actions button:focus-visible { outline: 2px solid ${C.brandInk}; outline-offset: 2px; }
.trip-delete-dialog { box-sizing: border-box; width: min(420px, calc(100% - 32px)); margin: auto; padding: 24px; border: 1px solid ${C.border}; border-radius: 20px; background: ${C.card}; color: ${C.ink}; box-shadow: 0 16px 64px #33302B33; }
.trip-delete-dialog::backdrop { background: #33302B80; }
.trip-delete-dialog h2 { margin: 0 0 12px; font-family: ${SERIF}; font-size: 25px; font-weight: 500; overflow-wrap: anywhere; }
.trip-delete-dialog p { font-size: 14px; line-height: 1.6; color: ${C.inkSoft}; }
.trip-delete-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.trip-delete-actions button { min-height: 44px; padding: 10px 16px; border: 1px solid ${C.border}; border-radius: 10px; background: ${C.paper}; color: ${C.ink}; font: inherit; }
.trip-delete-actions .trip-delete-confirm { background: #963F32; border-color: #963F32; color: white; }
.trip-delete-actions button:disabled { opacity: .6; cursor: wait; }
.trip-delete-dialog .trip-delete-error { color: #963F32; }
/* A day of the trip, placed on the strip by src/lib/preview.ts. 15px on a
   2.5px ring of the card's own cream, which is what the artboard draws. */
.trip-card-node {
  position: absolute; width: 15px; height: 15px; border-radius: 50%;
  border: 2.5px solid ${C.card}; transform: translate(-50%, -50%);
}
.trip-card-node.now { z-index: 2; }
/* Over the nodes: the chip is a label on a map, and it carries the near-opaque
   ground the artboard gives it for exactly that reason. */
.trip-card-day {
  position: absolute; right: 12px; top: 11px; font-size: 9.5px; font-weight: 700;
  letter-spacing: 0.07em; color: ${C.todayInk}; background: rgba(255,252,246,0.92);
  border-radius: 5px; padding: 3px 7px; z-index: 3;
}
.trip-card-body { padding: 11px 13px 13px; }
.trip-card-name { font-family: ${SERIF}; font-size: 17px; font-weight: 500; }
.trip-card-sub { font-size: 11.5px; color: ${C.grey}; margin-top: 3px; }
.trip-card-foot { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.trip-card-count { font-size: 11px; color: ${C.grey}; font-variant-numeric: tabular-nums; }
.progress { height: 5px; border-radius: 3px; background: #EFE6D6; margin-top: 8px; overflow: hidden; }
.progress > div { height: 100%; background: ${C.brandSolid}; }

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
.date-tile .d { font-size: 14px; font-weight: 700; color: ${C.ink}; line-height: 1; }
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
/* "+2" when the stack is longer than the bar can hold. design/Main.dc.html. */
.avatars > span.more { background: #EFE7DA; color: #8C8479; }

.trips-foot {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 14px 18px;
  background: linear-gradient(to top, ${C.paper} 68%, rgba(251,246,238,0));
}
.btn-dark {
  width: 100%; height: 40px; border-radius: 10px; border: none; background: ${C.brandButton};
  color: ${C.ink}; font-size: 14px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.btn-dark:disabled { opacity: 0.4; }
.btn-dark svg, .action.dark svg, .detail-btn.dark svg, .empty-actions .primary svg, .best-actions .go svg { stroke: currentColor; }
.btn-dark svg [stroke]:not([stroke="none"]), .action.dark svg [stroke]:not([stroke="none"]), .detail-btn.dark svg [stroke]:not([stroke="none"]) { stroke: currentColor; }

/* ---- Sign in (design/SignIn.dc.html) ----

   One button, and it goes to Google (PLAN.md section 5). Two things the
   artboard draws are left out: the divider and the "Open it without an
   account" line under it, which is the view-only share link. Nothing behind it
   is built, and CLAUDE.md's rule about furniture with nothing behind it
   applies to a door as much as to a row. */
/* ---- The pending invite (design/Trips.dc.html, and the same card on sign in) ---- */
.invite-card {
  margin: 0 14px 12px; border-radius: 14px; border: 1.5px solid ${C.noticeBorder};
  background: ${C.noticeBg}; padding: 10px 12px; display: flex; align-items: center; gap: 10px;
}
.invite-card > .who {
  width: 32px; height: 32px; border-radius: 50%; color: #FFF9F0; font-size: 11px;
  font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.invite-text { display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0; }
.invite-text .line { font-size: 12.5px; font-weight: 600; }
.invite-text .when { font-size: 10.5px; color: ${C.noticeInk}; }
.invite-join {
  height: 30px; border-radius: 8px; border: none; background: ${C.brandButton}; color: ${C.ink};
  font-family: ${SANS}; font-size: 12px; font-weight: 600; padding: 0 13px; flex-shrink: 0;
}
.invite-join:disabled { opacity: 0.5; }
/* On sign in the card is not in a scrolling list — the sign-in body already
   has the 26px gutter — so it drops the side margin the list gives it. */
.signin-body .invite-card { margin: 0 0 12px; }

/* ---- Who is on this trip (design/Members.dc.html) ---- */
.people-screen { z-index: 42; }
/* The Planner at a desk grows the frame (PLAN.md 4f); this screen is still a
   phone screen, so it keeps its width there rather than stretching a 52px row
   across 1440px. */
#frame.wide .people-screen {
  left: 50%; right: auto; width: ${FRAME.width}px; transform: translateX(-50%);
  border-left: 1px solid ${C.border}; border-right: 1px solid ${C.border};
}
.people-bar { height: 50px; border-bottom: 1px solid ${C.border}; gap: 10px; }
.people-bar-text { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
.people-bar-text .t { font-family: ${SERIF}; font-size: 16.5px; font-weight: 500; }
.people-bar-text .s { font-size: 11px; color: ${C.grey}; }
.people-scroll { flex-grow: 1; overflow-y: auto; padding-bottom: 16px; }
.link-card {
  margin: 13px 14px 0; border-radius: 12px; border: 1px solid ${C.borderWarm};
  background: ${C.card}; padding: 11px 12px;
}
.link-head { display: flex; align-items: center; gap: 10px; }
.link-head-text { display: flex; flex-direction: column; gap: 1px; flex-grow: 1; min-width: 0; }
.link-head-text .t { font-size: 13px; font-weight: 600; }
.link-head-text .s { font-size: 10.5px; color: ${C.grey}; }
.toggle {
  width: 42px; height: 25px; border-radius: 999px; background: #E4D9C5; border: 0; padding: 2px;
  display: flex; align-items: center; justify-content: flex-start; flex-shrink: 0;
}
.toggle[aria-pressed="true"] { background: ${C.brandButton}; justify-content: flex-end; }
.toggle > i { width: 21px; height: 21px; border-radius: 50%; background: ${C.card}; display: block; }
.link-row {
  margin-top: 11px; display: flex; align-items: center; gap: 8px;
  border-radius: 9px; background: ${C.highlight}; padding: 9px 11px;
}
.link-row .url {
  font-size: 11px; color: #8C8479; flex-grow: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.link-row button {
  background: none; border: 0; padding: 0; flex-shrink: 0;
  font-family: ${SANS}; font-size: 11px; font-weight: 600; color: ${C.link};
}
.link-row button.done { color: ${C.todayInk}; }
.link-when { margin-top: 7px; font-size: 10.5px; color: ${C.greyer}; }
.person-row {
  display: flex; align-items: center; gap: 11px; min-height: 52px; padding: 6px 16px;
  border-top: 1px solid ${C.line};
}
.person-row > .who {
  width: 32px; height: 32px; border-radius: 50%; color: #FFF9F0; font-size: 12px;
  font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.person-text { display: flex; flex-direction: column; gap: 1px; flex-grow: 1; min-width: 0; }
.person-text .n { font-size: 13.5px; font-weight: 600; }
.person-text .n em { font-size: 11px; font-weight: 400; font-style: normal; color: ${C.greyer}; }
.person-text .s { font-size: 11px; color: ${C.grey}; }

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

/* ---- The date fields, and the one calendar behind all of them ----
   NewTrip.dc.html opens six months of calendar and asks for two taps on it.
   Two fields say which end is being picked and what has been chosen so far,
   and each opens the calendar on its own month. */
.date-fields { display: flex; align-items: stretch; gap: 8px; }
.date-field {
  flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 3px;
  border-radius: 12px; border: 1.5px solid ${C.borderWarm}; background: ${C.card};
  padding: 9px 12px 10px; text-align: left; font-family: ${SANS};
}
.date-field.set { border-color: ${C.ink}; }
.date-field-label { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: ${C.greyer}; }
.date-field-value {
  font-size: 14px; font-weight: 600; color: ${C.faint};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.date-field.set .date-field-value { color: ${C.ink}; }
.date-field-arrow { display: flex; align-items: center; opacity: 0.6; flex-shrink: 0; }

.sheet.modal.picker { padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }
.month-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px 6px; flex-shrink: 0;
}
.sheet.modal .cal { padding: 0 10px; }

.cal { display: grid; grid-template-columns: repeat(7, 1fr); }
.dw { height: 22px; display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; color: ${C.greyer}; }
.cal button {
  height: 34px; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: #4A443C; font-variant-numeric: tabular-nums;
  background: transparent; border: 0; padding: 0; font-family: ${SANS};
}
.cal button.off { color: #CFC6B8; pointer-events: none; }
.cal button.in { background: ${C.brandWash}; }
.cal button.s { background: ${C.brandWash}; border-radius: 999px 0 0 999px; }
.cal button.e { background: ${C.brandWash}; border-radius: 0 999px 999px 0; }
.cal button.s.e { border-radius: 999px; }
.cal .cap {
  width: 28px; height: 28px; border-radius: 50%; background: ${C.brandButton}; color: ${C.ink};
  font-weight: 700; display: flex; align-items: center; justify-content: center;
}
/* Today, so a calendar opened on a month you did not choose still says where
   you are in it. */
.cal button.now { font-weight: 700; color: ${C.brandInk}; }
.cal button.off { opacity: 0.55; }
.month-name { font-size: 13.5px; font-weight: 700; }
.new-trip-foot {
  flex-shrink: 0; border-top: 1px solid ${C.sheetEdge}; background: ${C.paper}; padding: 12px 14px 16px;
}
.range-note {
  margin-top: 11px; font-size: 11px; color: ${C.meta}; line-height: 1.5;
}

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
.map-chip .empty { font-size: 10.5px; color: ${C.grey}; }
.map-controls { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 7px; }
.map-controls button {
  width: 34px; height: 34px; border-radius: 10px; border: 1px solid ${C.borderWarm};
  background: ${C.card}; box-shadow: 0 1px 3px rgba(80,66,44,0.10);
  display: flex; align-items: center; justify-content: center; padding: 0;
}
.map-controls button.busy { opacity: 0.5; }
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

.sheet-scroll { flex-grow: 1; overflow-y: auto; padding: 0 0 16px; }

/* The header is a row of three targets now — open the day, change the day,
   open the day — rather than one button, because the pencil cannot be nested
   inside a button. */
.day-head { display: flex; align-items: center; padding: 0 10px 0 14px; height: 44px; }
.day-head.open { background: ${C.highlight}; }
.day-head-tap {
  display: flex; align-items: center; gap: 10px; flex-grow: 1; min-width: 0; height: 44px;
  background: transparent; border: 0; padding: 0; text-align: left; font-family: ${SANS};
}
/* The day's colour, drawn the size it is drawn on the map: a disc in a cream
   ring. It is the thing that says which day a pin belongs to, so it is not a
   4px detail on a header and it does not dim when the day is closed. */
.day-hue {
  width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;
  border: 2.5px solid ${C.card}; box-shadow: 0 1px 3px rgba(70,58,40,0.22);
}
.day-head-text { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
.day-head-top { display: flex; align-items: baseline; gap: 7px; }
.day-label { font-size: 12.5px; font-weight: 500; color: ${C.inkSoft}; }
.day-head.open .day-label { font-weight: 700; color: ${C.ink}; }
.today-tag {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.07em; color: ${C.todayInk};
  background: ${C.greenTile}; border-radius: 4px; padding: 2px 5px;
}
.day-place {
  font-size: 10px; color: ${C.greyer};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.day-progress { font-size: 10px; color: ${C.greyer}; font-variant-numeric: tabular-nums; }
.day-pencil, .day-chevron {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 30px; height: 40px; background: none; border: 0; padding: 0;
}
.day-pencil { opacity: 0.7; }
.day-pencil.on { opacity: 1; }
.day-pencil.on > span { background: ${C.card}; border-radius: 6px; padding: 4px; margin: -4px; }

/* The panel the pencil opens, under the header it belongs to. No artboard
   draws it; it is the note editor's field and a row of discs. */
.day-edit-panel {
  background: ${C.highlight}; padding: 2px 14px 12px; border-bottom: 1px solid ${C.sheetEdge};
}
.day-edit-row { display: flex; align-items: center; gap: 9px; }
.day-name-field {
  flex-grow: 1; min-width: 0; height: 34px; border-radius: 9px;
  border: 1.5px solid ${C.borderWarm}; background: ${C.card}; padding: 0 11px;
  font-family: ${SANS}; font-size: 13px; font-weight: 500; color: ${C.ink};
  caret-color: ${C.accent}; outline: none;
}
.day-name-field:focus { border-color: ${C.brandInk}; }
.day-name-field::placeholder { color: ${C.faint}; font-weight: 400; }
.day-edit-done {
  background: none; border: 0; padding: 0 2px; font-family: ${SANS};
  font-size: 12px; font-weight: 700; color: ${C.link};
}
.swatches { display: flex; align-items: center; gap: 7px; margin-top: 10px; flex-wrap: wrap; }
.swatch {
  width: 26px; height: 26px; border-radius: 50%; padding: 0; flex-shrink: 0;
  border: 2.5px solid ${C.card}; box-shadow: 0 0 0 1px rgba(120,108,90,0.22);
  display: flex; align-items: center; justify-content: center;
}
/* The chosen one wears the ink ring a selected pin wears. */
.swatch.on { box-shadow: 0 0 0 2px ${C.ink}; }
/* White, and anything near it, cannot carry a cream tick. */
.swatch.pale { box-shadow: 0 0 0 1px ${C.borderWarm}; }
.swatch.pale.on { box-shadow: 0 0 0 2px ${C.ink}; }
/* Any other colour at all: the wheel stands for the rest of them. */
.swatch.custom {
  position: relative; overflow: hidden; cursor: pointer;
  background: conic-gradient(#C4826A, #C0913C, #7E8C42, #3F6B4A, #2F7D86, #3F6BA6, #6A5FA6, #9C5E8E, #C4826A);
}
.swatch.custom input {
  position: absolute; left: -8px; top: -8px; width: 44px; height: 44px;
  opacity: 0; border: 0; padding: 0; cursor: pointer;
}

/* ---- The sheet's two lists ---- */
.sheet-tabs {
  display: flex; gap: 6px; padding: 2px 12px 8px; flex-shrink: 0;
  border-bottom: 1px solid ${C.line};
}
.sheet-tab {
  flex-grow: 1; flex-basis: 0; height: 30px; border-radius: 999px;
  border: 1px solid ${C.border}; background: transparent; font-family: ${SANS};
  font-size: 11.5px; font-weight: 600; color: ${C.inkSoft}; padding: 0 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sheet-tab.on { background: ${C.brandButton}; border-color: ${C.brandInk}; color: ${C.ink}; }

.stay-row {
  display: flex; align-items: center; gap: 11px; padding: 0 14px; height: 52px;
  border-bottom: 1px solid ${C.line};
}
.stay-icon { flex-shrink: 0; opacity: 0.8; }
.stay-tap {
  display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0;
  background: none; border: 0; padding: 0; text-align: left; font-family: ${SANS};
}
.stay-name {
  font-size: 13.5px; font-weight: 600; color: ${C.ink};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stay-when { font-size: 10.5px; color: ${C.grey}; }
.stay-remove {
  width: 32px; height: 32px; border-radius: 9px; border: 1px solid ${C.border};
  background: ${C.card}; display: flex; align-items: center; justify-content: center;
  padding: 0; flex-shrink: 0;
}
.stay-gap { padding: 10px 16px 0; font-size: 10.5px; color: ${C.meta}; line-height: 1.5; }
.stay-results {
  border-radius: 10px; border: 1px solid ${C.border}; background: ${C.card};
  overflow: hidden; margin-top: 10px;
}
.stay-result {
  display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 8px 12px;
  background: none; border: 0; border-top: 1px solid ${C.line}; text-align: left;
  font-family: ${SANS};
}
.stay-result:first-child { border-top: 0; }
.stay-result-name { font-size: 12.5px; font-weight: 600; }
.stay-result-meta { font-size: 10px; color: ${C.grey}; }

/* The trip and the stay are asked for in the same shape: a name, then dates. */
.trip-edit { padding: 0 16px; flex-shrink: 0; }
.trip-edit .date-fields { margin-top: 16px; }
.trip-edit-note { font-size: 10.5px; color: ${C.meta}; line-height: 1.5; margin-top: 12px; }
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
.day-head.droppable { background: ${C.noticeBg}; border-bottom: 1px dashed #C7B98F; }
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
.action.dark { border: none; background: ${C.brandButton}; color: ${C.ink}; }
.action.on { background: ${C.brandWash}; border-color: ${C.brandLight}; color: ${C.brandInk}; }
.action.kebab { width: 34px; flex-grow: 0; flex-basis: auto; flex-shrink: 0; }

/* ---- Opening hours (src/lib/hours.ts) ----
   A stop somewhere shut says so on its second line, in the ink the app writes
   Remove in, behind a struck clock. Opened, the day's hours are a bar: the
   open hours filled in the green the app uses for "fine", the rest hatched,
   the stop's time a tick. When something is wrong a notice in the warm
   attention card sits under it, with the fix. */
.hours-flag { color: ${C.shut}; font-weight: 600; }
.hours-flag-icon { display: inline-block; vertical-align: -1px; margin-right: 3px; line-height: 0; }
.hours-flag-icon > svg { display: block; }
.hours { padding-bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
.hours-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.hours-day { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; color: ${C.greyer}; flex-shrink: 0; }
.hours-label { font-size: 10.5px; color: ${C.inkSoft}; text-align: right; }
.hours-track {
  position: relative; height: 10px; border-radius: 5px;
  background: repeating-linear-gradient(135deg, ${C.doneRing} 0 3px, ${C.highlight} 3px 6px);
}
.hours-open {
  position: absolute; top: 0; bottom: 0; border-radius: 5px; box-sizing: border-box;
  background: ${C.todayRing}; border: 1px solid #CBDCC6;
}
.hours-tick {
  position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px;
  border-radius: 1px; background: ${C.ink};
}
.hours-tick.shut { background: ${C.shut}; }
.hours-scale { position: relative; height: 12px; font-size: 9px; color: ${C.greyer}; font-variant-numeric: tabular-nums; }
.hours-scale > span { position: absolute; top: 0; }
.hours-notice {
  margin-bottom: 8px; border-radius: 8px; background: ${C.noticeBg};
  border: 1px solid ${C.noticeBorder}; padding: 8px 10px;
  display: flex; flex-direction: column; gap: 5px;
}
.hours-notice-title { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: ${C.shut}; }
.hours-notice-body { font-size: 10.5px; color: ${C.inkSoft}; line-height: 1.45; }
.hours-notice-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.hours-notice-actions > button {
  height: 30px; border-radius: 8px; border: 1px solid ${C.noticeBorder}; background: ${C.card};
  color: ${C.ink}; font-family: ${SANS}; font-size: 11px; font-weight: 600; padding: 0 10px;
}
.hours-notice-actions > button.primary { border: none; background: ${C.brandButton}; }
.detail-block .hours { padding-bottom: 0; }
.detail-block .hours-label { font-size: 12px; }
.detail-block .hours-notice { margin: 12px 0 0; }
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
.empty-actions .primary { border: none; background: ${C.brandButton}; color: ${C.ink}; }
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
  flex-grow: 1; height: 40px; border-radius: 10px; border: none; background: ${C.brandButton};
  color: ${C.ink}; font-size: 13.5px; font-weight: 600;
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
.trip-menu button.on { background: ${C.brandWash}; font-weight: 600; }
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
.note-actions .save { flex-grow: 1; border: none; background: ${C.brandButton}; color: ${C.ink}; }
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


/* ---- The trip at a desk (design/Desktop.dc.html) ---- */

.desk-body { flex-grow: 1; display: flex; min-height: 0; }
.desk-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.desk-sub { font-size: 12.5px; color: ${C.grey}; white-space: nowrap; }

/* The itinerary. 316 at the artboard's width. */
.desk-rail {
  width: 316px; flex-shrink: 0; border-right: 1px solid ${C.border};
  display: flex; flex-direction: column; min-height: 0; background: ${C.paper};
}
.rail-head { padding: 14px 16px 10px; display: flex; align-items: center; gap: 8px; }
.rail-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: ${C.greyer}; }
.rail-done { font-size: 11px; color: ${C.grey}; }
.rail-list { flex-grow: 1; overflow-y: auto; min-height: 0; }

.rail-day {
  width: 100%; display: flex; align-items: center; gap: 10px; height: 42px;
  padding: 0 16px; border-top: 1px solid ${C.line}; background: none; border-left: 0;
  border-right: 0; border-bottom: 0; text-align: left; font-family: ${SANS};
}
.rail-day.open {
  height: 44px; background: ${C.highlight};
  border-top: 1px solid ${C.sheetEdge}; border-bottom: 1px solid ${C.sheetEdge};
}
.rail-day.past .rail-hue { opacity: 0.45; }
.rail-day.past .rail-label { color: ${C.greyer}; }
.rail-day.droppable { background: #FCF6E6; border-bottom: 1px dashed #C7B98F; }
.rail-hue { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.rail-label {
  font-size: 13px; color: ${C.inkSoft}; flex-grow: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rail-day.open .rail-label { font-weight: 700; color: ${C.ink}; }
.rail-count { font-size: 11px; color: ${C.greyer}; font-variant-numeric: tabular-nums; }
.rail-day .drop-here {
  font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: #96752F;
}

.rail-stops { padding: 6px 10px; }
.rail-stop { display: flex; align-items: center; gap: 4px; border-radius: 10px; }
.rail-stop.selected { background: ${C.card}; border: 1px solid ${C.borderWarm}; }
.rail-stop.ghost { opacity: 0.45; }
.rail-stop .grip { opacity: 0.35; }
.rail-stop-tap {
  flex-grow: 1; min-width: 0; display: flex; align-items: center; gap: 10px;
  height: 46px; padding: 0 8px 0 2px; background: none; border: 0; text-align: left;
}
.rail-time {
  width: 38px; flex-shrink: 0; font-size: 11.5px; font-weight: 600;
  color: ${C.todayInk}; font-variant-numeric: tabular-nums;
}
.rail-time.unset { color: ${C.faint}; }
.rail-name {
  display: block; font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rail-meta {
  display: block; font-size: 10.5px; color: ${C.meta};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rail-stop.done .rail-name {
  color: ${C.greyer}; font-weight: 400; text-decoration: line-through;
}
.rail-stop.done .rail-time { color: ${C.faint}; }
.rail-stops .add-place { margin-top: 4px; }

.desk-map { position: relative; flex-grow: 1; min-width: 0; }

/* The stop being looked at. 334 at the artboard's width. */
.desk-detail {
  width: 334px; flex-shrink: 0; border-left: 1px solid ${C.border};
  background: ${C.paper}; display: flex; flex-direction: column;
  overflow-y: auto; min-height: 0;
}
.detail-head { padding: 18px 18px 14px; border-bottom: 1px solid ${C.sheetEdge}; }
.detail-when {
  display: flex; align-items: center; gap: 7px; margin-bottom: 7px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.07em; color: ${C.todayInk};
}
.detail-dot { width: 9px; height: 9px; border-radius: 50%; }
.detail-name {
  font-family: ${SERIF}; font-size: 25px; font-weight: 500; line-height: 1.2;
}
.detail-sub { font-size: 12.5px; color: ${C.grey}; margin-top: 5px; }
.detail-actions { display: flex; gap: 7px; margin-top: 14px; }
.detail-btn {
  flex-grow: 1; height: 40px; border-radius: 10px; border: 1px solid ${C.border};
  background: ${C.card}; color: ${C.inkSoft}; font-family: ${SANS};
  font-size: 13px; font-weight: 600; display: flex; align-items: center;
  justify-content: center; text-decoration: none;
}
.detail-btn.dark { border: none; background: ${C.brandButton}; color: ${C.ink}; }
.detail-btn.on { background: ${C.todayRing}; border-color: #CBDCC6; color: ${C.todayInk}; }
.detail-btn.square { flex-grow: 0; width: 40px; }
.detail-block { padding: 16px 18px; border-bottom: 1px solid ${C.sheetEdge}; }
.detail-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: ${C.greyer};
  margin-bottom: 9px;
}
.detail-note { font-size: 12.5px; color: #55504A; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.stop-note > span { white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-close { margin-left: auto; background: none; border: 0; min-width: 44px; min-height: 44px; display: grid; place-items: center; }
.field-error { color: ${C.ink}; font-size: 13px; line-height: 1.5; }
.rail-name, .stop-name { white-space: normal; overflow-wrap: anywhere; }
.stop-row, .rail-stop-tap { height: auto; min-height: 46px; padding-top: 7px; padding-bottom: 7px; }
.stop-name { font-size: 13.5px; }
.gcard-sub { line-height: 14px; }
.detail-empty { font-size: 12.5px; color: ${C.faint}; }
.detail-link {
  margin-top: 10px; background: none; border: 0; padding: 0;
  font-family: ${SANS}; font-size: 12px; font-weight: 600; color: ${C.link};
}

/*
 * The screens with no desk artboard, given room rather than left stranded.
 *
 * Trips, New trip and Sign in are one column of content each; there is no
 * second pane for them to grow into, and inventing one would be furniture. So
 * the column keeps its width and the window holds it, centred, on a card —
 * which is what it always was, minus the pretence that the browser window is
 * a phone.
 */
@media (min-width: 780px) and (min-height: 560px) {
  .screen.centred {
    align-items: center; justify-content: center;
    background: ${C.map};
  }
  .screen.centred > .card-column {
    /* Hugs its content: a trip list with one trip on it should not hold 700px
       of cream open underneath. */
    /* flex-grow: 0 undoes the base rule, which stretches the column down the
       main axis of the screen and was holding the card open to full height. */
    flex-grow: 0;
    width: 420px; max-width: 100%; height: auto; max-height: min(760px, 100%);
    display: flex; flex-direction: column; background: ${C.paper};
    border: 1px solid ${C.border}; border-radius: 18px; overflow: hidden;
    box-shadow: 0 12px 40px rgba(84,68,44,0.10);
  }
  .screen.centred.roomy > .card-column { width: 560px; }
  /* Except where the design is anchored to the bottom of a full height — the
     sign-in button sits under a spacer, and New trip scrolls its months. */
  .screen.centred.tall > .card-column { height: min(760px, 100%); }
}

/* ---- The Plan view on a phone: the trip bar, the rail, one column ---- */
/* Main.dc.html floats the bar over the map. Here it is the first row of a
   column with nothing behind it, so it takes its own space — without this the
   rail slides up underneath it. */
.screen.desk.narrow .trip-bar { position: static; flex-shrink: 0; }

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
  height: 30px; border-color: transparent; background: ${C.brandButton}; color: ${C.ink};
  font-size: 11.5px; font-weight: 700; padding: 0 12px; gap: 6px;
}
.rail-hue { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

/* Shared by the drawer and the desk panel: the label, the count and the card
   To be planned is a list of. The phone's own tray — a strip under the day's
   clock, with a grabber and a pull-up — went with the clock it sat under. */
.tray-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: ${C.greyer}; }
.tray-count { font-size: 10.5px; color: ${C.greyer}; font-variant-numeric: tabular-nums; }
.tray-empty { font-size: 10.5px; color: ${C.faint}; line-height: 1.5; }
.tray-card {
  border-radius: 9px; border: 1px solid ${C.borderWarm}; background: ${C.card};
  padding: 7px 9px; display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}
.tray-card .grip { opacity: 0.4; }
.tray-card.ghost { opacity: 0.45; border-style: dashed; }
.tray-name { font-size: 11px; font-weight: 600; white-space: nowrap; }
.tray-meta { font-size: 9px; color: ${C.meta}; white-space: nowrap; }
.tray-side-list .tray-name, .tray-side-list .tray-meta {
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
/* The Planner used to be the one screen that grew, to 1440 x 900 and no
   further, which left a hard-edged box on a bare page. Every screen fills the
   window now — see the media query at the top — so it needs no class. */
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
.segmented button.on { color: ${C.brandInk}; background: ${C.brandWash}; box-shadow: 0 1px 2px rgba(80,66,44,0.10); }
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
  height: 35px; border-radius: 10px; border: none; background: ${C.brandButton}; color: ${C.ink};
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
/* pan-y: the column scrolls vertically and a sideways drag is the day swipe,
   so the browser must not claim the horizontal axis for a scroll of its own. */
.grid-scroll {
  flex-grow: 1; overflow-y: auto; min-height: 0; padding-top: 10px;
  touch-action: pan-y;
}
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
  background: #FFFAE9; border: 1px solid #E9DAB2;
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
  font-size: 11.5px; font-weight: 600; line-height: 1.25; color: ${C.ink};
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
  display: block; font-size: 9.5px; margin-top: 2px; color: #817969;
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
.gpop-head .hours { padding: 8px 0 0; }
/* 194px holds a day's name or its hours on a line, not both. */
.gpop-head .hours-head { flex-direction: column; align-items: flex-start; gap: 1px; }
.gpop-head .hours-label { text-align: left; }
.gpop-shut { font-size: 10px; margin-top: 2px; }
.gpop-item {
  display: flex; align-items: center; gap: 9px; height: 42px; padding: 0 13px;
  width: 100%; background: none; border: 0; border-top: 1px solid ${C.line};
  font-family: ${SANS}; font-size: 13px; font-weight: 500; color: ${C.ink};
}
.gpop-item:first-of-type { border-top: 0; }
.gpop-item.danger { color: #A06B52; }
.gcol.flip .gpop { left: auto; right: calc(100% + 7px); }

/*
 * One column: below the card, not beside it.
 *
 * Beside it means off the screen at 375px — the popover hung to the right of a
 * card that already reaches the right edge, and the flip rule (meant for the
 * last columns of a week) then hung it off the left instead. There is no room
 * either side of a single column, and there is plenty underneath.
 */
.screen.desk.narrow .gpop,
.screen.desk.narrow .gcol.flip .gpop {
  left: 4px; right: 4px; top: calc(100% + 6px); width: auto;
}

/* The bar a dragged card would land on, and the hour it would land at. */
.grid-drop { position: absolute; height: 3px; border-radius: 2px; background: ${C.today}; z-index: 61; }
.grid-drop.shut { background: ${C.shut}; }
.grid-drop.shut span { color: ${C.shut}; }
/* The hours a place in the air is shut, on each column it could land in. */
.gshut {
  position: absolute; left: 0; right: 0; pointer-events: none;
  background: repeating-linear-gradient(135deg, rgba(160,107,82,0.10) 0 4px, transparent 4px 9px);
}
.gshut > span {
  position: absolute; left: 6px; top: 3px; font-size: 9px; font-weight: 700;
  letter-spacing: 0.06em; color: ${C.greyer}; white-space: nowrap;
}
/*
 * Centred, not left-aligned.
 *
 * The card is held by the grip on its left edge, so a hand dragging one sits
 * exactly over the left end of the line it is about to land on — which is
 * where the time was. In the middle of the column it is clear of the finger
 * whichever hand is holding the phone.
 */
.grid-drop span {
  position: absolute; left: 50%; transform: translateX(-50%); top: -16px;
  font-size: 9.5px; font-weight: 700; color: ${C.todayInk};
  letter-spacing: 0.04em; white-space: nowrap;
  background: ${C.paper}; padding: 0 5px; border-radius: 4px;
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

/* ---- The Plan view on a phone: one column, and a drawer ---- */

/* One day, so the header has nothing to line up with and can breathe. */
.screen.desk.narrow .grid-head { height: auto; min-height: 30px; }
.screen.desk.narrow .gcol-head { padding: 5px 12px 7px; }
.screen.desk.narrow .grid-main { position: relative; }

/*
 * Where you are sleeping, above the hours and outside the scroller.
 *
 * A hotel is not an event at a time — it is the fact the whole day hangs off —
 * so it does not scroll away with the morning.
 */
.lodging-row {
  display: flex; flex-shrink: 0; border-bottom: 1px solid ${C.sheetEdge};
  background: ${C.card};
}
.lodging-gutter {
  width: 56px; flex-shrink: 0; display: flex; align-items: center;
  justify-content: center; opacity: 0.7;
}
.lodging-cell {
  flex: 1 1 0; min-width: 0; padding: 6px 6px; display: flex; gap: 5px;
  border-left: 1px solid ${C.line};
}
.lodging-card {
  flex-grow: 1; min-width: 0; text-align: left; padding: 5px 9px;
  border-radius: 9px; border: 1px solid #CBDCC6; background: #EEF4EC;
}
.lodging-card.selected { border-color: ${C.todayInk}; }
.lodging-name {
  display: block; font-size: 11.5px; font-weight: 600; color: #3F6B4A;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/*
 * To be planned, as a drawer over the calendar.
 *
 * Shut, it is a tab on the right edge carrying the count. Open, it slides over
 * the grid — there is no room beside it at 375px, and the grid is what the
 * screen is for.
 */
/* Above the grid, below any sheet: a sheet is the topmost thing on the screen,
   and the tab used to float over the search field. */
.tray-dock { position: absolute; inset: 0; pointer-events: none; z-index: 15; }
.tray-tab {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%);
  pointer-events: auto; display: flex; flex-direction: column; align-items: center;
  gap: 6px; padding: 12px 5px; border: 1px solid ${C.border}; border-right: 0;
  border-radius: 10px 0 0 10px; background: ${C.card};
  box-shadow: -2px 0 10px rgba(84,68,44,0.10);
}
.tray-tab-label {
  writing-mode: vertical-rl; font-size: 8.5px; font-weight: 700;
  letter-spacing: 0.12em; color: ${C.greyer};
}
.tray-tab-count {
  min-width: 17px; height: 17px; border-radius: 9px; background: ${C.highlight};
  color: ${C.inkSoft}; font-size: 9.5px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.tray-dock.open .tray-tab { opacity: 0; pointer-events: none; }
.tray-scrim {
  position: absolute; inset: 0; pointer-events: auto;
  background: rgba(51,48,43,0.14);
}
.tray-side.drawer {
  position: absolute; top: 0; right: 0; bottom: 0; pointer-events: auto;
  width: min(280px, 78%); background: ${C.paper};
  box-shadow: -8px 0 24px rgba(84,68,44,0.18);
  transform: translateX(101%); transition: transform 200ms cubic-bezier(0.2, 0.8, 0.3, 1);
}
.tray-side.drawer.open { transform: translateX(0); }
.tray-close { background: none; border: 0; padding: 2px; display: flex; }

/* ---- Where you are sleeping ----
   design/Planner.dc.html rules a 48px strip at the foot of the grid and
   writes the hotel's name into every column it covers. It sits under the day
   headers here instead, above the hours, where it is not below the fold of a
   column that has been scrolled. A stay is one thing spanning days, so it is
   drawn as one bar; the arithmetic, including the half-cell a changeover day
   gets, is in src/lib/plan.ts. */
.lodging-strip {
  height: 42px; flex-shrink: 0; display: flex;
  border-bottom: 1px solid ${C.border}; background: ${C.highlight};
}
.stay-gutter {
  width: 56px; flex-shrink: 0; border-right: 1px solid ${C.sheetEdge};
  display: flex; align-items: center; justify-content: center;
}
.stay-lane { flex-grow: 1; position: relative; min-width: 0; cursor: pointer; }
.stay-bar {
  position: absolute; top: 6px; bottom: 6px; border-radius: 8px;
  border: 1px solid ${C.borderWarm}; background: ${C.card};
  display: flex; align-items: center; gap: 6px; padding: 0 10px;
  font-family: ${SANS}; overflow: hidden;
}
/* A stay that carries on past the page squares off at that end, so the bar
   reads as cut rather than as ending there. */
.stay-bar.open-left { border-top-left-radius: 2px; border-bottom-left-radius: 2px; border-left-style: dashed; }
.stay-bar.open-right { border-top-right-radius: 2px; border-bottom-right-radius: 2px; border-right-style: dashed; }
.stay-bar-name {
  font-size: 11px; font-weight: 600; color: ${C.inkSoft};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stay-lane-empty {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  font-size: 10.5px; color: ${C.faint};
}

/* The same thing on a phone, where one day is showing so there is nothing to
   span. On the day you change hotels both are named, in order. */
.stay-line {
  flex-shrink: 0; display: flex; align-items: center; gap: 7px;
  padding: 7px 12px; border-bottom: 1px solid ${C.sheetEdge}; background: ${C.highlight};
  overflow-x: auto; scrollbar-width: none;
}
.stay-line::-webkit-scrollbar { display: none; }
.stay-line-icon { flex-shrink: 0; opacity: 0.75; }
.stay-chip {
  height: 24px; border-radius: 999px; border: 1px solid ${C.borderWarm};
  background: ${C.card}; padding: 0 10px; flex-shrink: 0;
  font-family: ${SANS}; font-size: 10.5px; font-weight: 600; color: ${C.inkSoft};
  white-space: nowrap;
}

/* A quiet inline error, in the terracotta the palette already uses. */
.err { padding: 10px 16px; font-size: 11.5px; color: ${C.link}; }

/* ---- Sign in (design/SignIn.dc.html) ---- */
.signin-map {
  height: 272px; flex-shrink: 0; position: relative; background: ${C.mapFill};
  /* The drawing is 375 wide; a narrower frame must clip it, not scroll. */
  overflow: hidden;
}
/* 272 of the artboard's 667. On a shorter phone that becomes a proportion
   rather than a number, so the button underneath stays above the fold instead
   of the picture pushing it off. Only where the frame fills the screen — on a
   desktop it is a 667px frame in a taller window, where dvh means nothing. */
@media (max-width: 420px), (max-height: 700px) {
  .signin-map { height: min(272px, 40dvh); }
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
.signin-local { max-width: 360px; margin-top: 12px; flex-shrink: 0; }
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
  font-size: 13px; color: ${C.grey}; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.desk-rail .day-wrap { position: relative; }
.desk-rail .rail-day { padding-right: 38px; }
.desk-rail .day-wrap > .day-pencil { position: absolute; right: 2px; top: 4px; }
.gcol-head { position: relative; padding-right: 32px; }
.gcol-head > .day-pencil { position: absolute; right: 1px; top: 50%; transform: translateY(-50%); }
.screen.desk.narrow .gcol-head { padding-right: 36px; }
.grid-days > .day-edit { flex-shrink: 0; }
.me-menu button {
  display: block; width: 100%; text-align: left; padding: 10px 13px;
  border: 0; background: none; font-size: 13px; color: ${C.ink};
}
.sheet-tab { display: flex; align-items: center; justify-content: center; gap: 7px; }
.sheet-tab svg { width: 16px; height: 16px; stroke: currentColor; }
.sheet-tab svg [stroke]:not([stroke="none"]) { stroke: currentColor; }
.sheet-tab svg [fill]:not([fill="none"]) { fill: currentColor; }
.stay-search-field { display: flex; align-items: center; gap: 12px; }
.stay-search-field input { min-width: 0; flex: 1; }
.stay-skeleton { width: 64px; height: 18px; flex-shrink: 0; border-radius: 5px; background: linear-gradient(90deg, ${C.line} 20%, ${C.card} 50%, ${C.line} 80%); background-size: 220% 100%; animation: skeleton-shimmer 1.1s ease-in-out infinite; }
@keyframes skeleton-shimmer { to { background-position: -220% 0; } }
.tray-scrim { opacity: 0; pointer-events: none; transition: opacity 150ms ease-out; }
.tray-dock.open .tray-scrim { opacity: 1; pointer-events: auto; }
.tray-side.drawer { transition: transform 160ms cubic-bezier(.16, 1, .3, 1); visibility: hidden; }
.tray-side.drawer.open { visibility: visible; }
.tray-side.drawer:not(.open) { transition: transform 140ms ease-in, visibility 0s 140ms; }
.pin { border: 0; padding: 0; background: transparent; }
.gcard { border-left-color: var(--day-color); }
.gcard.done { border-left-color: var(--visited-color); }
.gcard-time { font-variant-numeric: tabular-nums; font-weight: 600; }
.grid-days { min-height: 0; }
.grid-scroll { flex: 1 1 0; }
.inline-search { position: relative; background: ${C.card}; border: 1px solid ${C.border}; border-radius: 12px; margin: 8px; overflow: hidden; }
.inline-search .search-head { padding: 14px 12px 6px; }
.inline-search .results { max-height: 300px; overflow-y: auto; padding-bottom: 8px; }
.inline-search .search-target { padding-right: 24px; }
.inline-stay .grabber { display: none; }
.inline-stay .modal-head { padding-top: 18px; }
.inline-stay .date-field { min-width: 0; }
.inline-stay { padding-bottom: 16px; }
.stay-details { flex-shrink: 0; }
.stay-actions { margin-bottom: 0; }
.detail-btn { gap: 7px; }
.stay-card .stay-row { border: 0; padding: 7px; height: auto; min-height: 52px; }
.stay-card .stay-name { font-weight: 500; }
.stay-menu-anchor { position: relative; flex: 0 0 34px; }
.stay-menu { position: fixed; width: 180px; border-radius: 11px; background: ${C.card}; border: 1px solid ${C.borderWarm}; box-shadow: 0 6px 20px rgba(84,68,44,.2); overflow-y: auto; z-index: 121; }
.stay-popover { position: fixed; width: 340px; border-radius: 12px; border: 1px solid ${C.borderWarm}; background: ${C.card}; box-shadow: 0 10px 28px rgba(84,68,44,.2); overflow-y: auto; z-index: 120; padding: 12px; }
.stay-popover-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.stay-popover .stay-details { padding: 0; }
.stay-popover .stay-actions { flex-wrap: nowrap; }
.day-stay-bar { display: flex; align-items: center; gap: 9px; padding: 6px 12px; background: ${C.highlight}; border-bottom: 1px solid ${C.sheetEdge}; }
.day-stay-bar > span { flex-shrink: 0; }
.day-stay-bar .stay-bar { position: static; height: 30px; min-width: 0; flex: 1; text-align: left; }
.day-stay-bar .stay-bar[aria-expanded="true"], .stay-lane .stay-bar[aria-expanded="true"] { border-color: ${C.ink}; }
.day-stay-end { margin-top: 6px; border-radius: 8px; }
.stay-menu button { display: flex; align-items: center; gap: 9px; width: 100%; height: 40px; border: 0; padding: 0 12px; background: none; text-align: left; font-size: 13px; font-weight: 500; }
.stay-menu button + button { border-top: 1px solid ${C.line}; color: #A06B52; }
.stay-menu button:hover, .stay-menu button:focus-visible { background: ${C.brandWash}; }
.stay-note-editor { margin-top: 8px; }
.stay-note-editor textarea { width: 100%; min-height: 90px; resize: vertical; border: 1px solid ${C.border}; border-radius: 8px; padding: 10px; font: inherit; background: ${C.card}; }
.suggestion-pin { position: absolute; z-index: 20; width: 22px; height: 28px; padding: 0; transform: translate(-50%, -100%); border: 2px solid white; border-radius: 18px; background: ${C.card}; display: grid; place-items: center; box-shadow: 0 2px 5px #0003; }
.suggestion-pin.selected { width: 26px; height: 33px; z-index: 21; }
.suggestion-pin::after { content: ""; position: absolute; width: 44px; height: 44px; left: 50%; top: 50%; transform: translate(-50%, -50%); }
.search-skeleton { padding: 10px 12px; }
.search-skeleton-row { display: flex; gap: 12px; align-items: center; height: 52px; }
.search-skeleton-row > i, .search-skeleton-row span { background: linear-gradient(90deg, ${C.line} 20%, ${C.card} 50%, ${C.line} 80%); background-size: 220% 100%; animation: skeleton-shimmer 1.1s ease-in-out infinite; border-radius: 5px; }
.search-skeleton-row > i { width: 30px; height: 30px; flex-shrink: 0; }
.search-skeleton-row > div { flex: 1; }
.search-skeleton-row span { display: block; height: 9px; width: 70%; margin: 7px 0; }
.search-skeleton-row span + span { width: 90%; height: 7px; }
.stop.done .stop-name, .rail-stop.done .rail-name, .gcard.done .gcard-title { text-decoration: none; }
.desk-map { top: 0; left: auto; right: auto; bottom: auto; cursor: pointer; }
.day-pencil { display: flex; align-items: center; justify-content: center; padding: 0; }
.desk-rail .day-wrap > .day-pencil { top: 2px; }
.inline-search .results { padding-bottom: 0; }
.inline-search .search-head { padding: 12px 42px 6px 12px; }
.inline-search .chips { flex-wrap: wrap; }
.search-close { min-width: 32px; min-height: 32px; align-items: center; justify-content: center; }
.rail-pill.hovering { background: linear-gradient(to right, ${C.highlight} var(--hover-progress), transparent var(--hover-progress)); outline: 2px solid ${C.accent}; }
.trip-card-body { display: block; width: 100%; text-align: left; border: 0; color: inherit; background: ${C.card}; }
.trip-card-map { min-height: 150px; background: ${C.map}; }
.map-preview-empty { display: flex; align-items: center; justify-content: center; height: 100%; padding: 16px; font-size: 12px; color: ${C.inkSoft}; }
.trip-card-map { cursor: pointer; }
.trip-card-map:focus-visible { outline: 2px solid ${C.brand}; outline-offset: -3px; }
.trip-card-map .gm-style { font-family: ${SANS}; }
.search-close { position: absolute; right: 6px; top: 6px; z-index: 2; display: flex; padding: 7px; border: 0; background: transparent; border-radius: 8px; }
.search-close:hover { background: ${C.highlight}; }
.inline-search .search-close { top: 16px; }
.result-add-anyway { flex-shrink: 0; align-self: center; border: 0; border-radius: 8px; background: transparent; color: ${C.inkSoft}; padding: 8px; font-size: 11px; font-weight: 600; }
.result-add-anyway:hover { background: ${C.card}; }
.signin-error { font-size: 13px; color: ${C.link}; padding-bottom: 10px; }
.trips-scroll { min-height: 0; }
@media (min-width: 780px) and (min-height: 560px) {
  .screen.centred.roomy { padding: clamp(20px, 4vw, 56px); background: ${C.paper}; }
  .screen.centred.roomy > .card-column { width: min(1200px, 100%); height: 100%; max-height: none; border: 0; border-radius: 0; box-shadow: none; }
  .roomy .trips-bar { height: 54px; padding: 0; flex-shrink: 0; order: -2; }
  .roomy .trips-title { font-size: 40px; }
  .roomy .trips-scroll { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 16px 24px; padding-bottom: 24px; }
  .roomy .section-label, .roomy .invite-card, .roomy .empty-state { grid-column: 1 / -1; padding-left: 0; }
  .roomy .section-label { padding-top: 12px; font-size: 11px; }
  .roomy .trip-card { margin: 0; width: 100%; border-color: ${C.brandLight}; border-radius: 18px; }
  .roomy .trip-card:not(.trip-card + .trip-card):not(:has(+ .trip-card)) { grid-column: 1 / -1; display: grid; grid-template-columns: 42% 1fr; }
  .roomy .trip-card:not(.trip-card + .trip-card):not(:has(+ .trip-card)) .trip-card-map { height: 100%; min-height: 190px; }
  .roomy .trip-card-map { height: 130px; }
  .trip-card-map > svg { width: 100%; height: 100%; }
  .roomy .trip-card-body { padding: 18px 20px; }
  .roomy .trip-card-name { font-size: 26px; }
  .roomy .trip-card-sub { font-size: 13px; }
  .roomy .trip-card-foot { margin-top: 20px; }
  .roomy .trips-foot { position: static; display: flex; justify-content: flex-end; flex-shrink: 0; order: -1; padding: 12px 0 18px; background: none; }
  .roomy .trips-foot .btn-dark { width: 220px; }
  .screen.centred.splash { padding: 0; background: ${C.paper}; }
  .screen.centred.splash > .card-column { display: grid; grid-template-columns: 1.1fr 1fr; width: 100%; height: 100%; max-height: none; border: 0; border-radius: 0; box-shadow: none; }
  .splash .signin-map { height: 100%; width: 100%; min-height: 0; order: 2; border-radius: 0; }
  .splash .signin-map > svg { width: 100%; height: 100%; object-fit: cover; }
  .splash .signin-body { padding: clamp(32px, 6vw, 100px); justify-content: center; max-width: 740px; width: 100%; margin: auto; }
  .splash .signin-head { margin: 0 0 40px; }
  .splash .signin-title { font-size: clamp(48px, 5.5vw, 84px); line-height: 1.02; letter-spacing: -0.035em; }
  .splash .signin-sub { font-size: 17px; line-height: 1.65; max-width: 380px; margin-top: 24px; }
  .splash .signin-body > span { flex-grow: 0 !important; }
  .splash .signin-google { max-width: 360px; }
  .splash .signin-promise { max-width: 340px; margin-top: 20px; }
  .desk-title { flex-direction: row; align-items: center; gap: 16px; min-width: 0; }
  .desk-name { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .desk-trip-date, .desk-sub { color: ${C.grey}; font-size: 12px; white-space: nowrap; }
  #frame > .sheet { right: auto; bottom: auto; border: 1px solid ${C.border}; border-radius: 14px; box-shadow: 0 12px 40px rgba(51,48,43,.18); overflow-y: auto; padding-bottom: 16px; }
  #frame > .sheet .grabber { display: none; }
  #frame > .sheet .modal-head { padding-top: 20px; }
  #search-sheet.sheet { min-height: 0; }
  #search-sheet.sheet .search-head { padding-top: 24px; }
  .desk-rail { width: 340px; }
  .tray-side { width: 300px; }
  .tray-side-foot:has(.inline-search) { padding: 0; }
}
@media (min-width: 780px) and (max-width: 1050px) {
  .desk-bar { gap: 10px; }
  .desk-name { max-width: 170px; font-size: 20px; }
  .desk-bar > .avatars { display: none; }
  .desk-pager { margin-left: 0; }
  .desk-trip-date, .desk-sub { font-size: 10px; }
}
.stay-color { width: 16px; height: 16px; border: 2px solid white; border-radius: 50%; flex-shrink: 0; box-shadow: 0 1px 3px #0002; }
.stay-actions > .action { flex: 1 1 0; }
.stay-actions .action.kebab { width: 34px; padding: 0; }
.stay-name { font-size: 13px; }
.stay-remove { width: 32px; height: 32px; padding: 6px; }
.rail-stop .stop-index { width: 19px; height: 19px; font-size: 10px; }
.desk-name { display: inline-flex; align-items: center; gap: 8px; }
.desk-name > span:first-child { overflow: hidden; text-overflow: ellipsis; }
.desk-name > span:last-child { flex-shrink: 0; }
#search-sheet .search-head { padding-bottom: 8px; }
#search-sheet.sheet .search-close { top: 17px; }
#search-sheet .search-target { min-height: 32px; padding-right: 32px; margin-bottom: 4px; }
.grid-add-ghost { position: absolute; left: 5px; right: 5px; height: 40px; border: 2px dashed; border-radius: 9px; display: grid; place-items: center; background: ${C.card}; pointer-events: none; }
@media (min-width: 780px) { #search-sheet.sheet .search-close { top: 24px; } }
@media (prefers-reduced-motion: reduce) {
  .tray-side.drawer, .tray-side.drawer:not(.open), .tray-scrim { transition: none; }
  .stay-skeleton, .search-skeleton-row > i, .search-skeleton-row span { animation: none; }
}

.splash .signin-map { display: grid; place-items: center; perspective: 900px; background: ${C.mapFill}; overflow: hidden; }
.trail-wave-dot { opacity: .24; animation: trail-wave-opacity linear infinite; }
@keyframes trail-wave-opacity { 0%,100% { opacity: .68; } 14% { opacity: .44; } 35%,90% { opacity: .24; } }
@media (prefers-reduced-motion: reduce) { .trail-wave-dot { animation: none; opacity: .55; } }
.map-trail-layer { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.dayweave-scene { width: min(88%, 640px); aspect-ratio: 400 / 360; perspective: 900px; position: relative; }
.dayweave-scene { transform-style: preserve-3d; transform: rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)); animation: trail-center 4.8s cubic-bezier(.42,0,.22,1) .6s both; }
@keyframes trail-center { from { translate: 8.25% 0; } to { translate: calc(14% - 15px) 0; } }
.dayweave-plane { width: 100%; height: 100%; position: relative; transform-style: preserve-3d; animation: trail-isometric 4.8s cubic-bezier(.42,0,.22,1) .6s both; }
.trail-ground { position: absolute; left: -300%; top: -300%; width: 700%; height: 700%; max-width: none; }
.trail-block { position: absolute; width: 1.5%; height: 1.667%; transform: translate(-50%, -50%) rotateZ(var(--block-angle)); transform-style: preserve-3d; pointer-events: none; }
.trail-block-solid { position: absolute; inset: 0; transform-style: preserve-3d; }
.trail-block-solid i { position: absolute; display: block; background: ${C.brandSolid}; animation: trail-face-in 1.2s ease-in-out var(--reveal-delay) both, splash-trail-opacity 5.5s linear var(--opacity-delay) infinite; }
.block-top { inset: 0; transform: translateZ(8px); background: ${C.brandLight} !important; }
.block-front, .block-back { left: 0; width: 100%; height: 8px; transform-origin: top; transform: rotateX(90deg); }
.block-front { top: 100%; }
.block-back { top: 0; }
.block-left, .block-right { top: 0; width: 8px; height: 100%; transform-origin: left; transform: rotateY(-90deg); }
.block-left { left: 0; }
.block-right { left: 100%; }
@keyframes trail-face-in { from { opacity: 0; } to { opacity: .35; } }
@keyframes splash-trail-opacity { 0%,90.909%,100% { opacity: .35; filter: brightness(1); } 3.636% { opacity: 1; filter: brightness(1.15); } 7.273% { opacity: .905; filter: brightness(1.12); } 10.909% { opacity: .687; filter: brightness(1.06); } 14.545% { opacity: .471; filter: brightness(1); } 21.818% { opacity: .268; filter: brightness(.95); } 35.455%,89.091% { opacity: .24; filter: brightness(.94); } }
.trail-shadow { opacity: .12; filter: blur(3px); animation: trail-shadow-in 1.2s ease-in-out 1.6s both; }
@keyframes trail-shadow-in { from { opacity: 0; } to { opacity: .12; } }
.trail-layer { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; transform: translateZ(0); animation: trail-lift 2.5s cubic-bezier(.42,0,.22,1) 2.5s both; }
.trail-marker { position: absolute; width: 6%; height: 6.667%; transform: translate(-50%, -50%); transform-style: preserve-3d; pointer-events: none; }
.trail-marker-lift { width: 100%; height: 100%; transform-style: preserve-3d; animation: trail-lift 2.5s cubic-bezier(.42,0,.22,1) 2.5s both; }
.trail-number-bob { width: 100%; height: 100%; transform-style: preserve-3d; animation: trail-node-wave 5.5s ease-in-out var(--node-wave-delay) infinite; }
.trail-marker-art { display: block; width: 300%; height: 300%; overflow: visible; transform: scale(.3333333333); transform-origin: 0 0; }
@keyframes trail-node-wave { 0%,25.455%,100% { transform: translateZ(0); } 9.091% { transform: translateZ(5px); } }
.trail-depth { stroke: ${C.brand}; opacity: 0; animation: trail-lift 2.5s cubic-bezier(.42,0,.22,1) 2.5s both, trail-depth-in .6s 1.8s forwards; }
.trail-surface { stroke: #ADA394; animation: trail-gold 1.3s 1.8s both; }
.trail-number circle { fill: var(--node-color); stroke: ${C.paper}; stroke-width: 2.5; animation: node-gold 1.2s var(--marker-delay) both; }
.trail-pin { position: absolute; width: 6.5%; height: 9.444%; transform-origin: 50% 91.176%; transform-style: preserve-3d; pointer-events: none; animation: trail-pin-rise 8s cubic-bezier(.42,0,.22,1) .6s both; }
@keyframes trail-pin-rise { from { transform: translate(-50%, -91.176%) rotateX(0); } to { transform: translate(-50%, -91.176%) rotateX(-90deg); } }
.trail-location { width: 100%; height: 100%; overflow: visible; animation: trail-pin-out 1.2s ease-in-out var(--marker-delay) both; }
.trail-location svg { display: block; width: 300%; height: 300%; overflow: visible; transform: scale(.3333333333); transform-origin: 0 0; }
.trail-location path { fill: var(--node-color); stroke: ${C.paper}; stroke-width: 2.5; stroke-linejoin: round; }
.trail-location circle { fill: ${C.paper}; }
.trail-number { animation: trail-number-in 1.2s ease-in-out var(--marker-delay) both; }
@keyframes trail-pin-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.65); } }
@keyframes trail-number-in { from { opacity: 0; transform: scale(.65); } to { opacity: 1; transform: scale(1); } }
.trail-nodes text { fill: white; font: 600 11px ${SANS}; user-select: none; -webkit-user-select: none; pointer-events: none; }
.trail-glint { opacity: 0; animation: trail-depth-in 1s 3s forwards; }
.signin-brand { display: flex; align-items: center; gap: 12px; font-family: ${SERIF}; font-size: 25px; color: ${C.brand}; margin-bottom: 18px; animation: splash-fade .7s .15s both; }
.splash .signin-title { margin: 0; animation: splash-fade .9s .35s both; }
.splash .signin-sub { animation: splash-fade .9s .6s both; }
.splash .signin-google { animation: splash-fade .9s .85s both; }
.splash .invite-card { animation: splash-fade .9s .7s both; }
.splash .signin-map { animation: splash-fade 1.4s ease-in-out both; }
@keyframes splash-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes trail-isometric { from { transform: rotateX(0) rotateZ(0) scale(.94); } to { transform: rotateX(42deg) rotateZ(-20deg) scale(1.18); } }
@keyframes trail-lift { from { transform: translateZ(0); } to { transform: translateZ(var(--lift)); } }
@keyframes trail-depth-in { to { opacity: 1; } }
@keyframes trail-gold { to { stroke: ${C.brandLight}; } }
@keyframes node-gold { to { fill: ${C.brand}; } }
@media (max-width: 779px) {
  .splash .signin-map { height: min(330px, 42dvh); }
  .splash .signin-head { margin-top: 0; }
  .splash .signin-title { font-size: 38px; }
  .splash .signin-body { padding-top: 12px; }
  .signin-brand { font-size: 23px; margin-bottom: 12px; }
}
@media (min-width: 780px) {
  .splash .signin-title { font-size: clamp(44px, 4.8vw, 72px); }
  .splash .signin-head { margin-bottom: 32px; }
  .signin-brand { font-size: 32px; margin-bottom: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .splash *, .trail-layer { animation: none !important; }
  .dayweave-scene { translate: calc(14% - 15px) 0; }
  .dayweave-plane { transform: rotateX(42deg) rotateZ(-20deg) scale(1.18); }
  .trail-layer { transform: translateZ(var(--lift)); }
  .trail-marker-lift { transform: translateZ(var(--lift)); }
  .trail-number-bob { transform: none; }
  .trail-depth, .trail-glint { opacity: 1; }
  .trail-surface { stroke: ${C.brandLight}; }
  .trail-number circle { fill: ${C.brand}; }
  .trail-pin { display: none; }
  .trail-block-solid i { opacity: .55; filter: none; }
  .trail-number { opacity: 1; transform: none; }
}

.desk .gcard, .desk .tray-card, .desk .lodging-card { cursor: pointer; }
.smart-plan { display:flex; align-items:center; justify-content:center; gap:7px; min-height:44px; padding:8px; border:1px solid ${C.border}; border-radius:10px; background:${C.card}; color:${C.ink}; font-size:12px; font-weight:600; }
.smart-plan:hover { background:${C.paper}; }
.smart-plan:disabled { opacity:.55; cursor:wait; }
.tray-side > .smart-plan { margin:0 12px 10px; flex-shrink:0; }
.settings-content { padding:24px 20px; overflow:auto; }
.settings-intro { color:${C.inkSoft}; font-size:14px; line-height:1.5; margin:12px 0 28px; }
.setting-row { margin:0 0 24px; padding:16px; border:1px solid ${C.border}; border-radius:14px; background:${C.card}; }
.setting-row legend { font-size:16px; font-weight:600; padding:0 6px; }
.setting-row p { margin:0 0 16px; font-size:13px; line-height:1.5; color:${C.inkSoft}; }
.unit-options { display:flex; gap:8px; flex-wrap:wrap; }
.unit-options label { flex:1; min-width:120px; display:flex; align-items:center; gap:8px; min-height:48px; padding:10px; border:1px solid ${C.border}; border-radius:9px; cursor:pointer; font-size:13px; }
.unit-options label:has(:checked) { background:${C.paper}; border-color:${C.inkSoft}; }
.unit-options input { accent-color:${C.ink}; }
.unit-options label:focus-within { outline:2px solid ${C.inkSoft}; outline-offset:2px; }
.member-menu-button { position:relative; flex-shrink:0; width:28px; height:28px; border-radius:7px; margin-left:auto; }
.member-menu-button::before { content:""; position:absolute; inset:-8px; }
.member-menu-button svg { width:13px; height:13px; }
.member-menu { position:fixed; margin:0; width:144px; padding:4px; background:${C.card}; border:1px solid ${C.border}; border-radius:12px; box-shadow:0 6px 20px rgba(84,68,44,.2); }
.member-menu .gpop-item { min-height:44px; }
.screen.desk.narrow .grid-days { overflow:hidden; }
.manual-note-title { display:block; width:100%; min-width:0; box-sizing:border-box; font:inherit; color:inherit; background:${C.card}; border:1px solid ${C.border}; border-radius:4px; padding:2px 4px; }
.manual-note-title:focus { outline:2px solid #1976D2; outline-offset:2px; }
`;
}
