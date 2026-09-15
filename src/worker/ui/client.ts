/**
 * The browser half of the app.
 *
 * Kept as one plain script on purpose: PLAN.md section 2 describes a React and
 * Vite frontend that does not exist yet, and standing one up is a bigger piece
 * of work than the screens themselves. What matters for now is that the
 * screens match `design/*.dc.html` exactly; the framework underneath them is a
 * later decision and none of this markup is wasted when it arrives.
 *
 * Written without template literals, and without backticks anywhere at all —
 * comments included — because the whole file is embedded in one.
 */
export const CLIENT = String.raw`
const $ = (id) => document.getElementById(id);
const ICONS = window.__ICONS__;

/** Minimal element builder. Props starting with "on" become listeners. */
function h(tag, props, children) {
  const el = document.createElement(tag);
  for (const key in props || {}) {
    const value = props[key];
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "style") el.setAttribute("style", value);
    else if (key === "html") el.innerHTML = value;
    else if (key === "text") el.textContent = value;
    else if (key.slice(0, 2) === "on") el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children || []) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

const icon = (name, cls) => h("span", { class: cls || "", html: ICONS[name], style: "display:flex" }, []);

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "request failed");
    error.status = res.status;
    // 401 is not a failure to report, it is a screen to show. Everything
    // under /api needs a signed-in person now (PLAN.md 5), so any call can
    // come back this way when a session runs out mid-trip — and the screen
    // it lands on is the same one whether that happened at boot or halfway
    // through a note. Doing it here means no caller has to remember to.
    if (res.status === 401 && state.screen !== "signIn") showSignIn();
    throw error;
  }
  return data;
}

const post = (path, body) =>
  api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/* ---------------------------------------------------------------- state */

const state = {
  screen: "trips",
  /* The account menu behind the header avatar, and the wait for Google. */
  meMenu: false,
  signingIn: false,
  signingInLocally: false,
  /* Inside a trip: the map and its sheet, or the Plan view (PLAN.md 4f). */
  view: "map",
  trips: [],
  trip: null,
  /* Who you are, and the invitation you are holding (PLAN.md 5). */
  me: null,
  google: true,
  invite: null,
  people: null,
  openDayId: null,
  planDayId: null,
  planPage: 0,
  /* To be planned, on a phone, is a drawer. Shut until it is wanted. */
  trayOpen: false,
  timeFor: null,
  pendingTime: null,
  selectedStopId: null,
  menuOpen: false,
  search: null,
  newTrip: null,
  tripMenu: false,
  sheetFull: false,
  /* The sheet's two tabs: the day list, and the stays that span days. */
  sheetTab: "stops",
  /* The day whose pencil is open, and the panel under its header. */
  dayEdit: null,
  /* Renaming a trip and moving its dates, from the one dropdown. */
  tripEdit: null,
  /* Adding or changing one stay. */
  stayEdit: null,
  selectedStayId: null,
  stayPopover: null,
  stayMenu: null,
  stayNote: null,
  /* The calendar hanging off whichever date field was tapped. */
  picker: null,
  hideVisited: false,
  error: null,
  drag: null,
  move: null,
  noteFor: null,
  preview: null,
};

const frame = $("frame");

/**
 * A screen that is one column of content, wrapped for a window.
 *
 * Trips, New trip and Sign in have nothing to put in a second pane, and
 * inventing one would be furniture. On a phone they fill it; at a desk the
 * window holds the column, centred, as a card — which is what it always was,
 * minus the pretence that a monitor is a phone.
 */
function column(children, opts) {
  const o = opts || {};
  return h("div", {
    class: "screen centred" + (o.roomy ? " roomy" : "") + (o.tall ? " tall" : "") + (state.screen === "signIn" ? " splash" : ""),
  }, [
    h("div", { class: "card-column" }, children),
  ]);
}

/**
 * Where the grid fits. Below this the Plan view is one day a screen.
 *
 * Not the artboard's own 1440: that is the width it was drawn at, not the
 * width the thing needs. What the grid needs is a readable column per day and
 * room for the tray beside them, which comes in a little under 800 — a tablet
 * held either way, and a laptop window that is not full screen. The height
 * keeps a phone on its side out of it, where a 660px column has nowhere to go.
 */
const WIDE = "(min-width: 780px) and (min-height: 560px)";
const wideNow = () => window.matchMedia(WIDE).matches;
const planning = () => state.screen === "trip" && state.view === "plan";

function render() {
  document.title = state.screen === "trip" && state.trip ? state.trip.trip.name + " / Daytrail" : "Daytrail";
  // The Plan view is the grid at every width now — one column on a phone. The
  // frame only grows for the wide one; every other screen stays 375.
  const grid = planning() && wideNow();
  const unplannedScroll = state.openDayId === "unplanned" && document.querySelector(".rail-list, .sheet-scroll");
  const unplannedScrollTop = unplannedScroll ? unplannedScroll.scrollTop : 0;

  stopTrailWave();
  if (splashCleanup) { splashCleanup(); splashCleanup = null; }
  frame.replaceChildren();
  if (state.screen === "signIn") { frame.append(screenSignIn()); initSplashTilt(); return; }
  if (state.screen === "trips") { frame.append(screenTrips()); paintTripMaps(); }
  else if (state.screen === "newTrip") frame.append(screenNewTrip());
  else if (state.screen === "trip") {
    // Three screens, one payload: the Planner, and the trip itself at the two
    // widths design/Desktop.dc.html and design/Main.dc.html each draw.
    frame.append(planning() ? screenGrid() : wideNow() ? screenTripDesk() : screenTrip());
  }
  if (state.people) frame.append(screenPeople());
  if (state.search && !$("search-sheet")) {
    frame.append(sheetSearch());
  }
  if (state.tripMenu) frame.append(...tripMenu());
  if (state.move) frame.append(...sheetMove());
  if (state.noteFor) frame.append(...sheetNote());
  if (state.timeFor) frame.append(...sheetTime());
  if (state.tripEdit) frame.append(...sheetTripEdit());
  if (state.stayEdit && !$("stay-editor")) frame.append(...sheetStay());
  // Last, so the calendar sits over the sheet whose field opened it.
  if (state.picker) frame.append(...sheetCalendar());
  if (wideNow()) positionEditors();
  const mapHost = $("gmap");
  if (mapHost && gmap && gmap.getDiv() !== mapHost) mapHost.replaceWith(gmap.getDiv());
  // The lifted card is created by the render that starts a drag, so it has to
  // be put under the finger before the first paint rather than on the next move.
  if (state.drag) paintDrag();
  if (state.search) paintSearchMap();
  if (state.screen === "trip" && !planning()) paintMap();
  // A resize can cross the breakpoint while the Plan view is showing; the
  // paint above only runs for the map, and settleGrid only for the grid.
  if (planning() && !grid) scrollRailToDay();
  if (planning()) settleGrid();
  if (unplannedScroll) {
    const scroll = document.querySelector(".rail-list, .sheet-scroll");
    if (scroll) scroll.scrollTop = unplannedScrollTop;
  }
  if (state.stayPopover || state.stayMenu) renderStayOverlays();
}

// The two densities are one view, so crossing the width re-renders into the
// other one rather than leaving a phone layout stretched across a desk.
window.matchMedia(WIDE).addEventListener("change", () => { if (!state.drag) render(); });

// Rotating a tablet changes how many days fit, so the grid is re-dealt. Never
// mid-drag: a render would throw away the card under the finger.
let resizeFrame = null;
/*
 * Only a change of density is worth a re-render.
 *
 * This used to re-render on any resize at all while the Plan view was up,
 * which is fine on a desk and wrong on a phone: opening the keyboard resizes
 * the viewport, so tapping into the search field or the note editor rebuilt
 * the frame, threw away the input that had just been focused, and shut the
 * keyboard again. The only thing the Plan view actually needs from a resize is
 * whether it crossed 780px, so that is the only thing that triggers one.
 */
let wasWide = wideNow();

window.addEventListener("resize", () => {
  const wide = wideNow();
  if (wide === wasWide) return;
  wasWide = wide;
  if (!planning() || state.drag) return;
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { resizeFrame = null; render(); });
});

/* -------------------------------------------------------------- history */

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-stay-anchor], .stay-popover, .stay-menu-anchor, .stay-menu")) return;
  if (state.stayMenu || state.stayPopover) {
    state.stayMenu = null;
    if (state.stayPopover) { state.stayPopover = null; state.selectedStayId = null; state.stayNote = null; }
    render();
  }
});
document.addEventListener("scroll", () => positionStayOverlays(), true);
window.addEventListener("resize", () => positionStayOverlays());

/**
 * Back has to mean back.
 *
 * Every screen and every sheet pushes an entry, so the phone's back gesture
 * closes the search, then the stop, then the trip, in the order they were
 * opened — rather than leaving the app from whatever was on screen. A layer
 * closed by tapping its own control goes through the same path: the control
 * asks the browser to go back, and the listener below is the only thing that
 * actually closes anything. One source of truth, so the two can never drift.
 */
const backStack = [];

/**
 * The app's own floor, so a close can never step off it.
 *
 * Signing in leaves Google's pages in the history behind us, and closing two
 * layers used to be two separate calls to history.back() — so a screen that
 * had one entry of ours and not two walked out of the app and landed back on
 * the Google consent page. Stamping the entry we boot on means the listener
 * below can read a depth of 0 for it rather than a null state, and closeTo
 * below never asks for more steps than we own.
 */
history.replaceState({ depth: 0 }, "");
let renderedPath = location.pathname;
let routeTicket = 0;
let editorAnchor = null;
document.addEventListener("click", (event) => {
  const target = event.target.closest("button, .gcol, .stay-lane");
  if (target && !target.closest(".sheet, .inline-search")) {
    const rect = target.getBoundingClientRect();
    editorAnchor = { left: rect.left, top: rect.top, bottom: rect.bottom };
    if (target.classList.contains("gcol")) editorAnchor = { left: rect.right + 8, right: rect.left - 8, top: event.clientY, bottom: event.clientY, grid: true };
  }
}, true);

function tripPath(id, view) {
  return "/trips/" + encodeURIComponent(id) + (view === "plan" ? "/plan" : "");
}

function clearLayers() {
  backStack.length = 0;
  afterClose = [];
  for (const key of ["people", "search", "move", "noteFor", "timeFor", "tripEdit", "stayEdit", "picker", "newTrip", "preview", "selectedStayId", "stayMenu", "stayNote"]) state[key] = null;
  state.tripMenu = false;
  state.menuOpen = false;
  state.selectedStopId = null;
  state.dayEdit = null;
  state.view = "map";
  state.trayOpen = false;
}

function setRoute(path, replace) {
  clearLayers();
  renderedPath = path;
  history[replace ? "replaceState" : "pushState"]({ depth: 0 }, "", path);
}

async function restoreRoute() {
  const match = location.pathname.match(/^\/trips\/([^/]+)(\/plan)?\/?$/);
  const view = match && match[2] ? "plan" : "map";
  if (!match) { showTrips(); return; }
  let id;
  try { id = decodeURIComponent(match[1]); } catch { setRoute("/", true); showTrips(); return; }
  await openTrip(id, true, view);
}

function goTrips() {
  routeTicket++;
  setRoute("/", backStack.length > 0);
  showTrips();
}

function positionEditors() {
  const bounds = frame.getBoundingClientRect();
  for (const el of frame.querySelectorAll(":scope > .sheet")) {
    const width = Math.min(420, bounds.width - 32);
    const anchor = editorAnchor || { left: bounds.left + (bounds.width - width) / 2, top: bounds.top + 72, bottom: bounds.top + 72 };
    el.style.width = width + "px";
    el.style.height = "auto";
    el.style.maxHeight = Math.max(200, bounds.height - 32) + "px";
    el.style.left = Math.max(16, Math.min(anchor.left - bounds.left, bounds.width - width - 16)) + "px";
    if (el.id === "search-sheet" && anchor.grid && anchor.left + width > bounds.right - 16) {
      el.style.left = Math.max(16, anchor.right - bounds.left - width) + "px";
    }
    const height = el.getBoundingClientRect().height;
    if (el.id === "trip-details-editor") {
      el.style.left = (bounds.width - width) / 2 + "px";
      el.style.top = Math.max(16, (bounds.height - height) / 2) + "px";
      continue;
    }
    el.style.top = Math.max(16, Math.min(anchor.bottom - bounds.top + 8, bounds.height - height - 16)) + "px";
  }
}

function openLayer(close) {
  backStack.push(close);
  history.pushState({ depth: backStack.length }, "");
}

/** What every X, scrim and Cancel calls. */
function closeLayer() {
  closeTo(1);
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.stayMenu || state.stayPopover) {
    const anchor = state.stayMenu ? "stay-options-" + state.stayMenu : state.stayPopover;
    if (state.stayMenu) state.stayMenu = null;
    else { state.stayPopover = null; state.stayNote = null; state.selectedStayId = null; }
    render();
    const button = $(anchor);
    if (button) button.focus();
    return;
  }
  if (backStack.length) closeLayer();
  else if (state.trayOpen && !wideNow()) toggleTray(false);
});

/**
 * Close the innermost count layers, in one traversal.
 *
 * Two things this gets right that two back() calls did not. It clamps to what
 * we actually pushed, so it can never leave the app. And one history.go(-n)
 * is a single traversal, where back() plus a setTimeout(back) was a race
 * between a queued popstate and a queued timeout — sometimes two steps,
 * sometimes one, depending on which task ran first.
 */
function closeTo(count) {
  const steps = Math.min(count, backStack.length);
  if (steps > 0) history.go(-steps);
}

/**
 * Open something once the close has actually landed.
 *
 * Closing is a history traversal, so it finishes on a popstate rather than on
 * the next line. Opening a layer before that lands pushes an entry the pending
 * traversal is about to walk back over — which used to be papered over with
 * setTimeout(fn, 0) and a hope about which task ran first.
 */
let afterClose = [];

function closeThen(count, then) {
  const steps = Math.min(count, backStack.length);
  if (steps === 0) { then(); return; }
  afterClose.push(then);
  history.go(-steps);
}

window.addEventListener("popstate", (event) => {
  if (location.pathname !== renderedPath) {
    clearLayers();
    renderedPath = location.pathname;
    history.replaceState({ depth: 0 }, "");
    restoreRoute();
    return;
  }
  // A traversal of several entries fires one popstate, not one per entry, so
  // the depth on the entry we landed on is what says how much to unwind —
  // rather than popping one and hoping the count matches.
  const depth = event.state && typeof event.state.depth === "number" ? event.state.depth : 0;
  if (depth > backStack.length) history.replaceState({ depth: backStack.length }, "");
  while (backStack.length > depth) {
    const close = backStack.pop();
    if (close) close();
  }

  const queued = afterClose;
  afterClose = [];
  for (const then of queued) then();
});

/* -------------------------------------------------------------- sign in */

/**
 * design/SignIn.dc.html: one button, and it goes to Google.
 *
 * PLAN.md section 5 — no email form, no password, no second provider. The
 * button reads "Continue with Google" rather than anything friendlier because
 * Google's sign-in branding permits a fixed set of strings and that is one of
 * them, and the G beside it is Google's own asset rather than the artboard's
 * dashed placeholder.
 *
 * The one thing the artboard draws that is not here is the "Open it without an
 * account" line at the foot, which is the view-only share link: that door is
 * not built, and a door with nothing behind it is worse than no door.
 *
 * It is a link rather than a fetch, because signing in is a trip through
 * somebody else's site and back.
 */
/* ------------------------------------------------------- pending invite */

/**
 * The card at the top of design/Trips.dc.html, and the same card on the way in.
 *
 * Every word on it is built by the Worker (see pendingInvite in index.ts), so
 * nothing here composes a sentence. Join is only offered to someone who can
 * actually take it: signed out, the card states the invitation and the button
 * under it is the sign-in.
 */
function inviteCard(invite, joinable) {
  return h("div", { class: "invite-card" }, [
    h("div", {
      class: "who",
      style: "background:" + invite.from.color,
      text: invite.from.initials,
    }, []),
    h("div", { class: "invite-text" }, [
      h("span", { class: "line", text: invite.sentence }, []),
      h("span", { class: "when", text: invite.when }, []),
    ]),
    joinable
      ? h("button", { class: "invite-join", id: "join", onclick: joinInvite }, ["Join"])
      : null,
  ]);
}

/**
 * Joining, which is the one write that is not optimistic.
 *
 * Everything else in the app applies to the screen first and goes to the
 * network behind it. This cannot: what comes back is a trip the browser has
 * never seen, and pretending to be on it before the server agrees would mean
 * drawing a trip we have not read.
 */
async function joinInvite() {
  const button = $("join");
  if (button) button.disabled = true;

  try {
    const accepted = await post("/api/invite/accept", {});
    state.invite = null;
    state.trips = (await api("/api/trips")).trips;
    await openTrip(accepted.tripId);
  } catch (error) {
    // A link turned off between opening it and tapping Join. Say so, and take
    // the card away rather than leaving a button that cannot work.
    state.invite = null;
    state.error = error.message;
    render();
  }
}

/* ------------------------------------------------ who is on this trip */

/** design/Members.dc.html, reached from the person-plus at the end of the stack. */
async function openPeople() {
  const tripId = state.trip.trip.id;
  openLayer(() => { state.people = null; render(); });
  try {
    state.people = await api("/api/trips/" + tripId + "/people");
  } catch (error) {
    state.error = error.message;
    closeLayer();
    return;
  }
  render();
}

function screenPeople() {
  const data = state.people;

  return h("div", { class: "screen people-screen", style: "z-index:42" }, [
    h("div", { class: "top-bar people-bar" }, [
      h("button", { class: "icon-btn", onclick: closeLayer }, [icon("chevronLeft")]),
      h("div", { class: "people-bar-text" }, [
        h("span", { class: "t", text: data.title }, []),
        h("span", { class: "s", text: data.subtitle }, []),
      ]),
    ]),
    h("div", { class: "people-scroll" }, [
      h("div", { class: "section-label", style: "padding-top:13px", text: "INVITE WITH A LINK" }, []),
      linkCard(data.invite),
      h("div", { class: "section-label spaced", style: "padding-top:14px", text: "PEOPLE" }, []),
      ...data.people.map(personRow),
    ]),
    noticeToast(),
  ]);
}

/**
 * The link, and the switch that makes one.
 *
 * design/Members.dc.html draws this card for the view-only share link, which
 * is a separate door PLAN.md section 5 keeps separate and which is not built.
 * The switch here governs the door that is: one reusable invite link per trip,
 * off until someone turns it on, and revoked by turning it off again — which
 * is the explicit revoke section 5 puts in place of an expiry.
 */
function linkCard(invite) {
  const on = Boolean(invite);

  return h("div", { class: "link-card" }, [
    h("div", { class: "link-head" }, [
      icon("chain"),
      h("div", { class: "link-head-text" }, [
        h("span", { class: "t", text: "Anyone with this link" }, []),
        h("span", {
          class: "s",
          text: on ? "can join the trip and edit it" : "nobody can join until this is on",
        }, []),
      ]),
      h("button", {
        class: "toggle",
        "aria-pressed": on ? "true" : "false",
        title: on ? "Turn the link off" : "Turn the link on",
        onclick: () => toggleInvite(!on),
      }, [h("i", {}, [])]),
    ]),
    on
      ? h("div", { class: "link-row" }, [
          h("span", { class: "url", text: invite.url }, []),
          h("button", { id: "copy", onclick: () => copyInvite(invite.url) }, ["Copy"]),
        ])
      : null,
    on ? h("div", { class: "link-when", text: "Made " + invite.ago }, []) : null,
  ]);
}

/**
 * The one write in the app that waits.
 *
 * Writes are optimistic everywhere else (CLAUDE.md), and this one cannot be:
 * the link's whole value is a token only the Worker can mint, so there is
 * nothing to put on the screen until it answers. Turning it off could be
 * optimistic and is not, because the two halves of one switch flickering at
 * different speeds reads as a bug.
 */
async function toggleInvite(on) {
  const tripId = state.people.tripId;
  try {
    const path = "/api/trips/" + tripId + "/invite" + (on ? "" : "/revoke");
    state.people.invite = (await post(path, {})).invite;
  } catch (error) {
    state.error = error.message;
  }
  render();
}

/**
 * Copy, and what to do when the browser will not.
 *
 * The clipboard is refused outright in an insecure context and by some
 * in-app browsers, and a Copy button that silently does nothing is worse than
 * no button. So the failure selects the link instead and says to take it by
 * hand — written straight to the DOM, because a render would throw the
 * selection away.
 */
function copyInvite(url) {
  const say = (label, cls) => {
    const button = $("copy");
    if (!button) return;
    button.textContent = label;
    button.className = cls || "";
  };

  const copied = () => {
    say("Copied", "done");
    setTimeout(() => say("Copy"), 1600);
  };

  const byHand = () => {
    const shown = document.querySelector(".link-row .url");
    if (shown && window.getSelection) {
      const range = document.createRange();
      range.selectNodeContents(shown);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    say("copy it by hand");
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(copied, byHand);
  } else {
    byHand();
  }
}

function personRow(person) {
  return h("div", { class: "person-row" }, [
    h("div", { class: "who", style: "background:" + person.color, text: person.initials }, []),
    h("div", { class: "person-text" }, [
      h("span", { class: "n" }, [
        person.name,
        person.tag ? h("em", { text: " " + person.tag }, []) : null,
      ]),
      h("span", { class: "s", text: person.line }, []),
    ]),
  ]);
}

/* ---------------------------------------------------------------- trips */

/**
 * The stack. design/Main.dc.html shows two faces and then a "+2" chip, because
 * a fourth avatar in a 375px bar pushes the trip name into an ellipsis — so
 * the stack is capped and the remainder is counted.
 */
function avatars(people, small, max) {
  const shown = max ? people.slice(0, max) : people;
  const rest = people.length - shown.length;
  const stack = shown.map((p) =>
    h("span", { style: "background:" + p.color, text: p.initials, title: p.name || "" }, []),
  );
  if (rest > 0) stack.push(h("span", { class: "more", text: "+" + rest }, []));
  return h("div", { class: small ? "avatars small" : "avatars" }, stack);
}

/**
 * A write that failed, or a link that has been turned off, in the palette.
 *
 * No artboard draws it — section 4g settles on last-writer-wins and never
 * shows a conflict — but something that did not happen still has to be
 * admitted rather than silently dropped.
 */
function noticeToast() {
  if (!state.error) return null;
  return h("div", { class: "toast" }, [
    h("span", { text: state.error }, []),
    h("button", { onclick: () => { state.error = null; render(); } }, ["Dismiss"]),
  ]);
}

function screenTrips() {
  const now = todayIso();
  const current = state.trips.filter((t) => t.start_date <= now && t.end_date >= now);
  const upcoming = state.trips.filter((t) => t.start_date > now);
  const past = state.trips.filter((t) => t.end_date < now);

  const scroll = h("div", { class: "trips-scroll" }, []);

  // First thing on the screen, because it is the only thing on it waiting on
  // an answer. design/Trips.dc.html puts it above HAPPENING NOW.
  if (state.invite) scroll.append(inviteCard(state.invite, true));

  if (current.length) {
    scroll.append(h("div", { class: "section-label", text: "HAPPENING NOW" }, []));
    for (const trip of current) scroll.append(tripCard(trip));
  }
  if (upcoming.length) {
    scroll.append(h("div", { class: "section-label" + (current.length ? " spaced" : ""), text: "COMING UP" }, []));
    for (const trip of upcoming) scroll.append(tripCard(trip));
  }
  if (past.length) {
    scroll.append(h("div", { class: "section-label spaced", text: "PAST" }, []));
    for (const trip of past) scroll.append(tripCard(trip));
  }
  if (!state.trips.length && !state.invite) {
    scroll.append(
      h("div", { class: "empty-state" }, [
        h("h3", { text: "No trips yet" }, []),
        h("p", { text: "Start one, and the places you add will gather here." }, []),
      ]),
    );
  }

  return column([
    h("div", { class: "trips-bar" }, [
      h("div", { class: "trips-title", text: "Trips" }, []),
      h("button", {
        class: "me-avatar",
        text: state.me ? state.me.initials : "",
        onclick: () => { state.meMenu = !state.meMenu; render(); },
      }, []),
    ]),
    state.meMenu ? meMenu() : null,
    scroll,
    h("div", { class: "trips-foot" }, [
      h("button", { class: "btn-dark", onclick: openNewTrip }, [icon("plus"), "Start a new trip"]),
    ]),
  ], { roomy: true });
}

function tripCard(trip) {
  const pct = trip.stopCount ? Math.round((trip.visitedCount / trip.stopCount) * 100) : 0;

  return h("article", { class: "trip-card" }, [
    h("div", { class: "trip-card-map", "data-trip-map": trip.id, role: "link", tabindex: "0", "aria-label": "Open " + trip.name, onclick: (event) => { if (!event.target.closest("a, button, .gm-style")) openTrip(trip.id); }, onkeydown: (event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openTrip(trip.id); } } }, [
      h("span", { class: "map-preview-empty", text: (trip.mapPoints || []).length ? "Loading map…" : "Add a place to see this trip on the map" }, []),
    ]),
    h("button", { class: "trip-card-body", onclick: () => openTrip(trip.id) }, [
      h("div", { class: "trip-card-name", text: trip.name }, []),
      h("div", { class: "trip-card-sub", text: trip.subtitle }, []),
      h("div", { class: "trip-card-foot" }, [
        avatars(trip.members, false, 3),
        h("span", { style: "flex-grow:1" }, []),
        h("span", {
          class: "trip-card-count",
          text: trip.visitedCount + " of " + trip.stopCount + " visited",
        }, []),
      ]),
      h("div", { class: "progress" }, [h("div", { style: "width:" + pct + "%" }, [])]),
    ]),
  ]);
}

const tripMapCache = new Map();
let tripMapObserver = null;

function paintTripMaps() {
  if (tripMapObserver) tripMapObserver.disconnect();
  tripMapObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      tripMapObserver.unobserve(entry.target);
      paintTripMap(entry.target);
    }
  }, { root: document.querySelector(".trips-scroll"), rootMargin: "100px" });
  for (const placeholder of document.querySelectorAll("[data-trip-map]")) {
    const cached = tripMapCache.get(placeholder.dataset.tripMap);
    const host = cached ? cached.host : placeholder;
    if (cached) placeholder.replaceWith(host);
    tripMapObserver.observe(host);
  }
}

async function paintTripMap(host) {
  const trip = state.trips.find((trip) => trip.id === host.dataset.tripMap);
  if (!trip) return;
  const points = (trip.mapPoints || []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (!points.length) {
    const cached = tripMapCache.get(trip.id);
    if (cached) { for (const marker of cached.markers) marker.setMap(null); tripMapCache.delete(trip.id); }
    host.replaceChildren(h("span", { class: "map-preview-empty", text: "Add a place to see this trip on the map" }, []));
    return;
  }
  const maps = await loadMaps();
  if (!host.isConnected) return;
  if (!maps) { host.textContent = "Map preview unavailable"; return; }
  let cached = tripMapCache.get(trip.id);
  if (!cached) {
    host.replaceChildren();
    const map = new maps.Map(host, { center: points[0], zoom: 12, styles: window.__MAP_STYLE__, disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false, clickableIcons: false });
    map.addListener("click", () => openTrip(trip.id));
    cached = { host, map, markers: [], key: null };
    tripMapCache.set(trip.id, cached);
  }
  const key = JSON.stringify(points);
  if (cached.key === key) return;
  cached.key = key;
  for (const marker of cached.markers) marker.setMap(null);
  cached.markers = [];
  const bounds = new maps.LatLngBounds();
  for (const point of points) {
    const position = { lat: point.lat, lng: point.lng };
    bounds.extend(position);
    cached.markers.push(new maps.Marker({ position, map: cached.map, clickable: false, icon: { path: maps.SymbolPath.CIRCLE, scale: 5, fillColor: point.hue, fillOpacity: 1, strokeColor: "#FFFCF6", strokeWeight: 2 } }));
  }
  cached.map.fitBounds(bounds, 24);
  maps.event.addListenerOnce(cached.map, "idle", () => { if (cached.map.getZoom() > 14) cached.map.setZoom(14); });
}

function tripRow(trip, past) {
  const start = new Date(trip.start_date + "T00:00:00Z");
  return h("button", { class: past ? "trip-row past" : "trip-row", onclick: () => openTrip(trip.id) }, [
    h("div", { class: past ? "date-tile past" : "date-tile" }, [
      h("span", { class: "m", text: MONTHS[start.getUTCMonth()].toUpperCase() }, []),
      h("span", { class: "d", text: String(start.getUTCDate()).padStart(2, "0") }, []),
    ]),
    h("div", { class: "trip-row-text" }, [
      h("span", { class: "trip-row-name", text: trip.name }, []),
      h("span", { class: "trip-row-sub", text: trip.subtitle }, []),
    ]),
    past ? null : avatars(trip.members, true, 3),
  ]);
}

/* ------------------------------------------------------------- new trip */

function openNewTrip() {
  openLayer(() => { state.newTrip = null; showTrips(); });
  state.newTrip = { name: "", start: null, end: null };
  state.screen = "newTrip";
  render();
  const field = $("trip-name");
  if (field) field.focus();
}

function screenNewTrip() {
  const draft = state.newTrip;
  const ready = draft.name.trim() && draft.start && draft.end;

  return column([
    h("div", { class: "top-bar" }, [
      h("button", { class: "icon-btn", onclick: closeLayer }, [icon("close")]),
      h("div", { class: "top-bar-title", text: "New trip" }, []),
    ]),
    h("div", { style: "padding:0 18px 32px;flex-shrink:0" }, [
      h("div", { class: "ask", text: "Where are we going?" }, []),
      h("div", { class: "underlined" }, [
        h("input", {
          id: "trip-name",
          placeholder: "Give the trip a name",
          value: draft.name,
          autocomplete: "off",
          oninput: (e) => { draft.name = e.target.value; refreshCreate(); },
        }, []),
      ]),
    ]),
    h("div", { style: "padding:0 18px;flex-shrink:0" }, [
      h("div", { class: "ask small", style: "margin-bottom:12px", text: "And when?" }, []),
      dateFields(draft, refreshCreate),
      // The length of the trip, under the two fields that decide it. The foot
      // used to carry this as a second copy of the same dates; with the dates
      // on screen in the fields, that row was saying it twice.
      h("div", { class: "range-note" }, [
        h("span", {
          text: draft.start && draft.end
            ? rangeLabel(draft.start, draft.end) + " · " + (daysBetween(draft.start, draft.end) + 1) + " days"
            : "Both ends, and every day between them gets its own list.",
        }, []),
      ]),
    ]),
    h("div", { style: "flex-grow:1" }, []),
    h("div", { class: "new-trip-foot" }, [
      h("button", { class: "btn-dark", id: "create", disabled: !ready, onclick: createTrip }, ["Create trip"]),
    ]),
  ], { tall: true });
}

/** Keeps Create trip in step with the fields without re-rendering the name. */
function refreshCreate() {
  const draft = state.newTrip;
  const button = $("create");
  if (button) button.disabled = !(draft.name.trim() && draft.start && draft.end);
}

/**
 * The two date fields, and the calendar behind them.
 *
 * design/NewTrip.dc.html draws six months of calendar open on the screen and
 * asks for two taps on it. That works on the artboard, where the trip starts
 * in the month already showing. It does not work on a phone: the range is
 * invisible until both ends are tapped, a mis-tap silently restarts it, and a
 * trip in April means scrolling a calendar looking for a month that may not be
 * among the six. Two fields say what has been chosen and what has not, and
 * each one opens the calendar on its own month.
 */
function dateFields(draft, after) {
  const field = (which, label) => {
    const value = draft[which];
    return h("button", {
      class: "date-field" + (value ? " set" : ""),
      onclick: () => openDatePicker(draft, which, after),
    }, [
      h("span", { class: "date-field-label", text: label }, []),
      h("span", { class: "date-field-value", text: value ? longDate(value) : "Pick a date" }, []),
    ]);
  };

  return h("div", { class: "date-fields" }, [
    field("start", "STARTS"),
    h("span", { class: "date-field-arrow", html: ICONS.chevronRight }, []),
    field("end", "ENDS"),
  ]);
}

/**
 * Opening the calendar on one of the two fields.
 *
 * Moving the start past the end takes the end with it rather than refusing the
 * tap: the field you touched is the one you meant, and a trip that ends before
 * it starts is not a state worth holding on screen to complain about.
 */
function openDatePicker(draft, which, after) {
  openPicker({
    title: which === "start" ? "Starts on" : "Ends on",
    value: draft[which],
    // The end can never be before the start. The start has no floor: a trip
    // in the past is a trip somebody is writing up.
    min: which === "end" ? draft.start : null,
    onPick: (iso) => {
      draft[which] = iso;
      if (which === "start" && draft.end && draft.end < iso) draft.end = iso;
      if (after) after();
      render();
    },
  });
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/** Wed Sep 30, on a date field. The weekday is half of what a date means. */
function longDate(iso) {
  const date = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
  return weekday + " " + MONTHS[date.getUTCMonth()] + " " + date.getUTCDate();
}

/* --------------------------------------------------------- the calendar */

/**
 * One calendar, opened by every date field in the app: both ends of a new
 * trip, both ends of a trip being changed, and both ends of a stay.
 */
function openPicker(options) {
  openLayer(() => { state.picker = null; render(); });
  const anchor = options.value || options.min || todayIso();
  const at = new Date(anchor + "T00:00:00Z");
  state.picker = {
    title: options.title,
    value: options.value || null,
    min: options.min || null,
    max: options.max || null,
    month: new Date(at.getUTCFullYear(), at.getUTCMonth(), 1),
    onPick: options.onPick,
  };
  render();
}

function stepMonth(by) {
  const picker = state.picker;
  picker.month = new Date(picker.month.getFullYear(), picker.month.getMonth() + by, 1);
  render();
}

function sheetCalendar() {
  const picker = state.picker;
  const month = picker.month;

  return [
    h("div", { class: "scrim", onclick: closeLayer }, []),
    h("div", { class: "sheet modal picker", style: "height:auto" }, [
      h("div", { class: "grabber", onclick: closeLayer }, [h("i", {}, [])]),
      h("div", { class: "modal-head" }, [
        h("div", { class: "modal-title", text: picker.title }, []),
      ]),
      h("div", { class: "month-bar" }, [
        h("button", {
          class: "sq-btn",
          onclick: () => stepMonth(-1),
          title: "The month before",
        }, [h("span", { style: "display:flex;transform:rotate(90deg)", html: ICONS.chevron }, [])]),
        h("span", {
          class: "month-name",
          text: MONTH_NAMES[month.getMonth()] + " " + month.getFullYear(),
        }, []),
        h("button", {
          class: "sq-btn",
          onclick: () => stepMonth(1),
          title: "The month after",
        }, [h("span", { style: "display:flex;transform:rotate(-90deg)", html: ICONS.chevron }, [])]),
      ]),
      h("div", { class: "cal" }, DOW.map((d) => h("span", { class: "dw", text: d }, []))),
      pickerGrid(month),
    ]),
  ];
}

function pickerGrid(month) {
  const picker = state.picker;
  const year = month.getFullYear();
  const index = month.getMonth();
  const lead = new Date(year, index, 1).getDay();
  const length = new Date(year, index + 1, 0).getDate();
  const today = todayIso();

  const grid = h("div", { class: "cal" }, []);
  for (let i = 0; i < lead; i++) grid.append(h("button", { class: "off", disabled: true }, []));

  for (let day = 1; day <= length; day++) {
    const iso = year + "-" + String(index + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const blocked = (picker.min && iso < picker.min) || (picker.max && iso > picker.max);
    const chosen = iso === picker.value;

    grid.append(
      h("button", {
        class: (chosen ? "s e" : "") + (blocked ? " off" : "") + (iso === today ? " now" : ""),
        disabled: Boolean(blocked),
        onclick: () => {
          const pick = picker.onPick;
          closeLayer();
          pick(iso);
        },
      }, chosen ? [h("span", { class: "cap", text: String(day) }, [])] : [String(day)]),
    );
  }
  return grid;
}

async function createTrip() {
  const draft = state.newTrip;
  const trip = await post("/api/trips", {
    name: draft.name.trim(),
    startDate: draft.start,
    endDate: draft.end || draft.start,
  });
  // The New trip screen is finished with, so the trip takes its place in the
  // history rather than sitting on top of it.
  backStack.pop();
  history.replaceState({ depth: backStack.length }, "");
  await openTrip(trip.trip.id);
}

/* --------------------------------------------------------------- sign in */

/**
 * design/SignIn.dc.html: a quiet map, two lines, and one button.
 *
 * No email field, no password, no second provider, and the button reads
 * "Continue with Google" rather than "Connect with" — Google's branding terms
 * allow a fixed set of strings and Connect is not one of them (PLAN.md 5).
 *
 * The artboard's last line, "Someone sent you a link to look at? Open it
 * without an account", is left out. It is the door for a view-only share link,
 * and share links are a table with no API yet: a person who was sent one would
 * have opened the link itself rather than arriving here, so the line has
 * nothing to do from this screen until there is something to open. See
 * CLAUDE.md.
 */
let splashCleanup = null;
function initSplashTilt() {
  const stage = document.querySelector(".signin-map");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!stage || motion.matches) return;
  const sensor = window.isSecureContext && window.DeviceOrientationEvent && window.matchMedia("(pointer: coarse)").matches;
  const scene = stage.querySelector(".daytrail-scene");
  if (!scene) return;
  let active = false, disposed = false, baseline = null, frameId = null;
  let aimX = 0, aimY = 0, x = 0, y = 0;
  const reset = () => {
    active = false; baseline = null;
    window.removeEventListener("deviceorientation", orient);
    stage.removeEventListener("pointermove", pointer);
    stage.removeEventListener("pointerleave", leave);
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    aimX = aimY = x = y = 0;
    scene.style.setProperty("--tilt-x", "0deg"); scene.style.setProperty("--tilt-y", "0deg");
  };
  const animate = () => {
    if (!active || disposed || !stage.isConnected) return;
    if (!document.hidden) {
      x += (aimX - x) * .06; y += (aimY - y) * .06;
      scene.style.setProperty("--tilt-x", x.toFixed(3) + "deg");
      scene.style.setProperty("--tilt-y", y.toFixed(3) + "deg");
    }
    frameId = requestAnimationFrame(animate);
  };
  const orient = (event) => {
    if (!active || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    const angle = window.screen?.orientation?.angle || 0;
    if (!baseline || baseline.angle !== angle) baseline = { beta: event.beta, gamma: event.gamma, angle };
    const beta = ((event.beta - baseline.beta + 540) % 360) - 180;
    const gamma = event.gamma - baseline.gamma;
    const radians = angle * Math.PI / 180;
    aimX = Math.max(-12, Math.min(12, (beta * Math.cos(radians) + gamma * Math.sin(radians)) * .44));
    aimY = Math.max(-16, Math.min(16, (gamma * Math.cos(radians) - beta * Math.sin(radians)) * .5));
    if (frameId === null) frameId = requestAnimationFrame(animate);
  };
  const pointer = (event) => {
    if (!active || event.pointerType === "touch") return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    aimX = Math.max(-8, Math.min(8, (.5 - (event.clientY - rect.top) / rect.height) * 16));
    aimY = Math.max(-12, Math.min(12, ((event.clientX - rect.left) / rect.width - .5) * 24));
    if (frameId === null) frameId = requestAnimationFrame(animate);
  };
  const leave = () => { aimX = aimY = 0; };
  const start = () => {
    if (active || disposed || motion.matches) return;
    active = true;
    if (sensor) window.addEventListener("deviceorientation", orient);
    stage.addEventListener("pointermove", pointer);
    stage.addEventListener("pointerleave", leave);
  };
  const preference = () => { if (motion.matches) reset(); else start(); };
  start();
  motion.addEventListener("change", preference);
  splashCleanup = () => { disposed = true; reset(); motion.removeEventListener("change", preference); };
}

function screenSignIn() {
  return column([
    h("div", { class: "signin-map", html: window.__SIGNIN_MAP__ }, []),
    h("div", { class: "signin-body" }, [
      h("div", { class: "signin-head" }, [
        h("div", { class: "signin-brand" }, [icon("daytrail"), h("span", { text: "Daytrail" }, [])]),
        h("h1", { class: "signin-title", text: "Bring your daytrails to life." }, []),
        h("div", {
          class: "signin-sub",
          text: "Map the places you dream of. Make each day your own. Explore together.",
        }, []),
      ]),
      h("span", { style: "flex-grow:1" }, []),
      // Following an invite link lands here, so the card states the invitation
      // and the button under it is how you accept: signed out there is nobody
      // to join a trip, so the card carries no Join of its own.
      state.invite ? inviteCard(state.invite, false) : null,
      state.invite
        ? h("div", {
            class: "signin-sub",
            style: "margin:0 0 12px;max-width:none",
            text: "Sign in below to accept it.",
          }, [])
        : null,
      state.error ? h("div", { class: "err signin-error", role: "alert", style: "padding:0 0 10px", text: state.error }, []) : null,
      h("button", {
        class: "signin-google",
        disabled: state.signingIn,
        onclick: signInWithGoogle,
      }, [
        icon("googleG", "signin-g"),
        h("span", { text: state.signingIn ? "Taking you to Google…" : "Continue with Google" }, []),
      ]),
      window.__LOCAL_DEV__ ? h("button", { class: "btn-dark signin-local", onclick: signInLocally, text: "Continue locally" }, []) : null,
    ]),
  ], { tall: true });
}

/**
 * Hand off to Google.
 *
 * Better Auth answers with the URL to send the browser to rather than
 * redirecting the fetch, because a redirect on an XHR would be followed by the
 * browser and land the consent screen inside a JSON parse.
 */
async function signInWithGoogle() {
  if (state.signingIn || state.signingInLocally) return;
  state.signingIn = true;
  state.error = null;
  updateSignInStatus();
  try {
    const data = await post("/api/auth/sign-in/social", { provider: "google", callbackURL: location.pathname });
    if (!data.url) throw new Error("sign-in did not come back with anywhere to go");
    window.location.href = data.url;
  } catch (error) {
    state.signingIn = false;
    state.error = error.message;
    updateSignInStatus();
  }
}

function updateSignInStatus() {
  const button = document.querySelector(".signin-google");
  if (!button) return;
  button.disabled = Boolean(state.signingIn || state.signingInLocally);
  button.setAttribute("aria-busy", String(state.signingIn));
  button.lastElementChild.textContent = state.signingIn ? "Taking you to Google…" : "Continue with Google";
  const local = document.querySelector(".signin-local");
  if (local) {
    local.disabled = button.disabled;
    local.textContent = state.signingInLocally ? "Opening local workspace…" : "Continue locally";
  }
  const existing = document.querySelector(".signin-error");
  if (existing) existing.remove();
  if (state.error) button.before(h("div", { class: "signin-error", role: "alert", text: state.error }, []));
}

async function signInLocally() {
  if (state.signingIn || state.signingInLocally) return;
  state.signingInLocally = true;
  state.error = null;
  updateSignInStatus();
  try {
    await post("/api/auth/sign-in/local", {});
    window.location.reload();
  } catch (error) {
    state.signingInLocally = false;
    state.error = error.message;
    updateSignInStatus();
  }
}

/**
 * The account menu, behind the terracotta avatar in the trips header.
 *
 * No artboard draws it. design/Trips.dc.html does draw the avatar as a
 * button rather than a badge, though, and an app you can sign in to and not
 * out of is not finished, so the smallest honest reading of that button is one
 * item and the name of whoever is signed in above it.
 *
 * Built like the stop's kebab rather than like the trip menu: it is a dropdown
 * on a control, not a layer over the screen, and the kebab is the one the
 * artboards already draw that way.
 */
function meMenu() {
  return h("div", { class: "me-menu" }, [
    state.me && state.me.email
      ? h("div", { class: "me-menu-who", text: state.me.email }, [])
      : null,
    h("button", { text: "Sign out", onclick: signOut }, []),
  ]);
}

/** The screen every 401 lands on, whichever call met it. */
function showSignIn() {
  routeTicket++;
  clearLayers();
  state.screen = "signIn";
  state.signingIn = false;
  state.trip = null;
  state.trips = [];
  state.search = null;
  state.move = null;
  state.noteFor = null;
  state.timeFor = null;
  state.meMenu = false;
  render();

  // The one /api route that answers signed out. Without it a visitor who
  // followed Mika's link is asked for their Google account by a screen that
  // cannot say who invited them or to what.
  api("/api/invite/pending").then((data) => {
    if (state.screen !== "signIn") return;
    const changed = JSON.stringify(state.invite) !== JSON.stringify(data.invite);
    state.invite = data.invite;
    if (changed && !state.signingIn && !state.signingInLocally) render();
  }).catch(() => {});
}

async function signOut() {
  state.meMenu = false;
  try {
    await post("/api/auth/sign-out", {});
  } catch (error) {
    // Signed out is signed out: the cookie is cleared by the response either
    // way, and a failure here must not leave the screen showing a trip list
    // that the next request will refuse.
  }
  showSignIn();
}

/* ------------------------------------------------------------------ trip */

/**
 * Back to the trip list. The list is re-read, because whatever was just done
 * inside a trip is exactly what its card is meant to show — a new trip, a
 * city that has appeared under the name, a count that has moved.
 */
function showTrips() {
  routeTicket++;
  state.screen = "trips";
  state.trip = null;
  render();
  api("/api/trips").then((data) => {
    if (state.screen !== "trips") return;
    state.trips = data.trips;
    state.me = data.me;
    state.invite = data.invite;
    render();
  }).catch(() => {});
}

async function openTrip(tripId, restoring, view) {
  const ticket = ++routeTicket;
  // Read first, then push the history entry: a trip that is not ours any more
  // must not leave a layer behind for back to unwind.
  let trip;
  try {
    trip = await api("/api/trips/" + tripId);
  } catch (error) {
    if (ticket !== routeTicket) return;
    if (restoring && error.status !== 401) {
      setRoute("/", true);
      state.screen = "trips";
      state.trip = null;
    }
    state.error = error.message;
    render();
    return;
  }

  if (ticket !== routeTicket) return;
  if (!restoring) setRoute(tripPath(tripId, view));
  state.trip = trip;
  state.view = view || "map";
  state.planDayId = null;
  state.planPage = 0;
  const today = todayIso();
  const todayDay = state.trip.days.find((d) => d.date === today);
  state.openDayId = todayDay ? todayDay.id : (state.trip.days[0] || {}).id || null;
  state.selectedStopId = null;
  state.screen = "trip";
  if (state.view === "plan") planDay();
  render();
}

async function refreshTrip() {
  if (!state.trip) return;
  const id = state.trip.trip.id;
  const trip = await api("/api/trips/" + id);
  if (!state.trip || state.trip.trip.id !== id) return;
  state.trip = trip;
  settleOpenDay();
  render();
}

/**
 * Moving a trip's dates can take a day away with them, and the screen must
 * not be left open on one that no longer exists.
 */
function settleOpenDay() {
  const days = state.trip.days;
  const gone = (id) => id && id !== "unplanned" && !days.some((d) => d.id === id);
  if (gone(state.openDayId)) {
    const today = days.find((d) => d.date === todayIso());
    state.openDayId = (today || days[0] || {}).id || null;
  }
  if (gone(state.planDayId)) state.planDayId = null;
  if (state.dayEdit && gone(state.dayEdit)) state.dayEdit = null;
}

const STATUS_FILL = { done: "#BDB4A7", now: "#6F9A6B", ahead: "#E0B355" };
const STATUS_RING = { done: "#EFE9DF", now: "#E4EEE1", ahead: "#F8EECF" };

/* ------------------------------------------------------------------ pins */

/**
 * What every dot on the map looks like, decided in one place.
 *
 * The map used to show the open day and nothing else, coloured by status:
 * green today, amber ahead, grey done (PLAN.md section 7). It now shows the
 * whole trip, and colour carries the day rather than the status, because the
 * question a map of a trip answers first is "which of these is today's" and
 * the list beside it already says the day in exactly that colour. A day hue
 * IS the ramp from section 7, so the two are the same vocabulary — read off
 * the day rather than off the clock.
 *
 * Status has not been thrown away. A day gone by, or a stop ticked off, still
 * goes grey; it just goes grey and small and faint rather than grey and loud.
 *
 * The rules, in the order they win:
 *
 * - **The open day is full size and numbered.** Every other day is a mini dot
 *   of its own colour, so the shape of the whole trip is visible without the
 *   other days competing with the one being planned.
 * - **A day in the past is mini, grey and half there.**
 * - **Selecting a stop pushes everything else back**: the rest of that day to
 *   75%, every other day to 30%. The selected pin itself stays at full
 *   strength — dimming the thing you just tapped would be an odd way to point
 *   at it — and keeps the ink ring and the extra size it already had.
 */
const PIN = {
  full: 26,
  mini: 16,
  selected: 32,
  bed: "#202124",
};

/** Where a stop sits in the day's route. Beds are not on the route. */
function routeNumbers(day) {
  const numbers = {};
  let n = 0;
  for (const stop of day.stops) {
    if (stop.accommodation) continue;
    numbers[stop.id] = ++n;
  }
  return numbers;
}

/**
 * The look of one dot: fill, size, opacity, and what is written inside it.
 *
 * The open flag is whether this stop's day is the one showing in the sheet,
 * and anySelected whether anything at all is selected — a pin has to know it
 * to know whether it is one of the ones being pushed back.
 */
function mutedHue(hex) {
  const rgb = hex.replace("#", "").match(/.{2}/g).map((part) => parseInt(part, 16));
  const middle = (Math.max(...rgb) + Math.min(...rgb)) / 2;
  return "#" + rgb.map((value) => Math.round(middle + (value - middle) * 0.45).toString(16).padStart(2, "0")).join("");
}

function pinLook(day, stop, open, number) {
  const st = statusOf(day, stop);
  const selected = stop.id === state.selectedStopId || stop.id === state.selectedStayId;
  const anySelected = Boolean(state.selectedStopId);

  if (stop.accommodation) {
    return {
      fill: open ? day.hue : PIN.bed,
      // Never shrunk either. A bed is exempt from the whole scheme: it does
      // not fade for a day being over, it does not fade for something else
      // being selected, and it does not go mini for being on another day.
      size: selected ? PIN.selected : PIN.full,
      ring: selected ? "#33302B" : "#FFFCF6",
      opacity: 1,
      roof: true,
      number: null,
      z: selected ? 40 : 30,
    };
  }

  const past = st === "done";
  let opacity = 1;
  if (anySelected && !selected) opacity = Math.min(opacity, open ? 0.75 : 0.3);

  return {
    fill: day.hue,
    size: selected ? PIN.selected : past ? (open ? 20 : 12) : open ? PIN.full : PIN.mini,
    ring: selected ? "#33302B" : "#FFFCF6",
    opacity,
    roof: false,
    // Only the open day is big enough to read a number in.
    number: open ? (number || null) : null,
    z: selected ? 100 : open ? 80 : 10,
  };
}

/**
 * A pin as a data URI, for a Google marker.
 *
 * Built here rather than in ui/gmap.ts with the rest of the SVGs, because a
 * pin is no longer one of a fixed handful: it depends on the day's hue, the
 * number inside it, and how far back the current selection has pushed it.
 * Only the geometry is fixed, and it is the geometry gmap.ts used to draw.
 */
function pinUrl(look) {
  const stroke = 2.5;
  const box = look.size + stroke * 2 + 2;
  const c = box / 2;
  const r = look.size / 2;

  let inner = "";
  if (look.roof) {
    // The roof from icons.ts, scaled from its 24px box on to this one.
    const k = (look.size * 0.62) / 24;
    const ox = c - 12 * k;
    const oy = c - 12 * k;
    inner =
      '<g transform="translate(' + ox + " " + oy + ") scale(" + k + ')" fill="none" ' +
      'stroke="#FFFCF6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 11.5L12 5l8 6.5"/><path d="M6.5 10.5V19h11v-8.5"/></g>';
  } else if (look.number) {
    inner =
      '<text x="' + c + '" y="' + c + '" fill="#FFFCF6" font-family="Figtree, sans-serif" ' +
      'font-size="' + Math.round(look.size * 0.58) + '" font-weight="700" ' +
      'text-anchor="middle" dominant-baseline="central">' + look.number + "</text>";
  }

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + box + '" height="' + box + '" ' +
    'viewBox="0 0 ' + box + " " + box + '"><g opacity="' + look.opacity + '">' +
    '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="' + look.fill + '" ' +
    'stroke="' + look.ring + '" stroke-width="' + stroke + '"/>' + inner + "</g></svg>";

  return { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg), box: box };
}

function statusOf(day, stop) {
  if (stop.status === "visited") return "done";
  const today = todayIso();
  if (day.date < today) return "done";
  if (day.date === today) return "now";
  return "ahead";
}

/* ------------------------------------------------------- the trip at a desk */

/**
 * design/Desktop.dc.html: the trip on a screen with room on it.
 *
 * Three columns under one bar — the itinerary down the left, the map taking
 * whatever is left, and the stop you are looking at on the right. It is the
 * same data and the same ops as the phone; what changes is that nothing has to
 * be stacked or hidden behind a sheet, because there is room to show it.
 *
 * This artboard was in the table as "not built", and the consequence was that
 * every screen but the Planner was a 375px column stranded in the middle of a
 * monitor.
 */
function screenTripDesk() {
  const trip = state.trip;
  const selected = state.selectedStopId ? findStop(state.selectedStopId) : null;

  return h("div", { class: "screen desk trip-desk" }, [
    deskBar("Map"),
    h("div", { class: "desk-body" }, [
      deskRail(),
      h("div", { class: "map desk-map" }, [
        mapsKey()
          ? h("div", { id: "gmap", style: "position:absolute;inset:0" }, [])
          : h("div", { style: "position:absolute;inset:0", html: window.__MAP__ }, []),
        ...(mapsKey() || state.search ? [] : mapPins(state.openDayId === "unplanned" ? unplannedDay() : trip.days.find((d) => d.id === state.openDayId), true)),
        ...searchMapLayer(),
        ...mapControls(),
      ]),
      // No stop selected, no panel: the map takes the room rather than the
      // screen holding an empty column open in case you tap something.
      selected ? deskDetail(selected) : null,
    ]),
    state.error
      ? h("div", { class: "toast" }, [
          h("span", { text: state.error }, []),
          h("button", { onclick: () => { state.error = null; render(); } }, ["Dismiss"]),
        ])
      : null,
    ...dragLayer(),
  ]);
}

/**
 * The bar across the top of both desk screens.
 *
 * The artboard puts the trip name and its line on the left and the people and
 * the actions on the right. The segmented control in the middle is from
 * Planner.dc.html and is the only way between the two views at this width —
 * the phone reaches them through the dropdown on the trip name, which is
 * still here on the name itself.
 */
function deskBar(on) {
  const trip = state.trip;
  const tab = (label, active, onclick) =>
    h("button", { class: active ? "on" : "", onclick: active ? null : onclick, disabled: !onclick && !active }, [label]);

  return h("div", { class: "desk-bar" }, [
    h("div", { class: "desk-title" }, [
      h("button", {
        class: "desk-name",
        onclick: () => {
          openLayer(() => { state.tripMenu = false; render(); });
          state.tripMenu = true;
          render();
        },
        "aria-expanded": String(state.tripMenu),
      }, [h("span", { text: trip.trip.name }, []), icon("chevron")]),
      h("span", { class: "desk-sub", text: trip.dateRange }, []),
    ]),
    h("div", { class: "segmented" }, [
      tab("Map", on === "Map", leavePlan),
      tab("Planner", on === "Planner", () => showPlan()),
    ]),
    on === "Planner" ? deskPager() : null,
    h("span", { style: "flex-grow:1" }, []),
    avatars(trip.members),
    h("button", { class: "round-btn", title: "Invite someone", onclick: openPeople }, [icon("invite")]),
  ]);
}

/**
 * The itinerary rail: every day, and the open one showing its stops.
 *
 * The rows keep the drag contract the phone's sheet uses: a drop-zone with a
 * day id, an order-row with a stop id — so dragging a stop between days works
 * here without a second implementation.
 */
function switchMapDay(dayId) {
  const change = () => { state.openDayId = dayId; state.selectedStopId = null; state.selectedStayId = null; state.stayPopover = null; state.stayMenu = null; state.stayNote = null; render(); };
  if (state.search) closeThen(1, change);
  else change();
}

function deskRail() {
  const trip = state.trip;
  const today = todayIso();

  const rail = h("div", { class: "desk-rail" }, []);

  rail.append(sheetTabs());
  if (state.sheetTab === "stays") {
    rail.append(h("div", { class: "rail-list" }, staysPanel()));
    return rail;
  }

  const list = h("div", { class: "rail-list" }, []);
  for (const day of trip.days) {
    const open = day.id === state.openDayId;
    const past = day.date < today;
    const wrap = h("div", {
      class: "day-wrap drop-zone" + (open ? " open" : ""),
      "data-day-id": day.id,
    }, [
      h("button", {
        class: "rail-day" + (open ? " open" : "") + (past ? " past" : ""),
        "data-day-id": day.id,
        onclick: () => switchMapDay(open ? null : day.id),
      }, [
        h("span", { class: "rail-hue", style: "background:" + day.hue }, []),
        h("span", {
          class: "rail-label",
          text: day.label + (day.name ? " · " + day.name : day.place_label ? " · " + day.place_label : ""),
        }, []),
        h("span", { class: "drop-here", text: "DROP HERE", hidden: true }, []),
        day.date === today
          ? h("span", { class: "today-tag", text: "TODAY" }, [])
          : h("span", {
              class: "rail-count",
              text: day.stops.filter((st) => statusOf(day, st) === "done").length + "/" + day.stops.length,
            }, []),
      ]),
    ]);

    wrap.append(dayEditButton(day));
    if (state.dayEdit === day.id) wrap.append(dayEditPanel(day));
    const stays = dayStays(day);
    if (stays.length) wrap.append(dayStayBar(day, stays[0], "start"));
    if (open) {
      const body = h("div", { class: "rail-stops" }, day.stops.map((stop) => railStop(day, stop)));
      for (const stay of stays.slice(1)) body.append(dayStayBar(day, stay, "end"));
      body.append(
        state.search && state.search.dayId === day.id ? sheetSearch(true) : h("button", { class: "add-place", onclick: () => openSearch(day.id) }, [
          icon("plusGrey"), "Add a place",
        ]),
      );
      wrap.append(body);
    }
    list.append(wrap);
  }

  const unplannedOpen = state.openDayId === "unplanned";
  list.append(
    h("div", { class: "day-wrap drop-zone" + (unplannedOpen ? " open" : ""), "data-day-id": "unplanned" }, [
      h("button", { class: "rail-day" + (unplannedOpen ? " open" : ""), "data-day-id": "unplanned", "aria-expanded": String(unplannedOpen), onclick: () => switchMapDay(unplannedOpen ? null : "unplanned") }, [
        h("span", { class: "rail-hue", style: "background:#94897A" }, []),
        h("span", { class: "rail-label", text: "To be planned" }, []),
        h("span", { class: "drop-here", text: "DROP HERE", hidden: true }, []),
        h("span", { class: "rail-count", text: String(trip.unplanned.length) }, []),
      ]),
      unplannedOpen ? h("div", { class: "rail-stops" }, [
        ...trip.unplanned.map((stop) => railStop(unplannedDay(), stop)),
        state.search && !state.search.dayId ? sheetSearch(true) : h("button", { class: "add-place", onclick: () => openSearch("unplanned") }, [icon("plusGrey"), "Add a place"]),
      ]) : null,
    ]),
  );

  rail.append(list);
  return rail;
}

/** One stop in the rail: the time, the name and its line. */
function railStop(day, stop) {
  const st = statusOf(day, stop);
  const selected = stop.id === state.selectedStopId;
  const dragging = state.drag && state.drag.stopId === stop.id;

  return h("div", {
    class: "rail-stop order-row" + (selected ? " selected" : "") + (st === "done" ? " done" : "")
      + (dragging ? " ghost" : ""),
    "data-stop-id": stop.id,
  }, [
    dragHandle(day, stop),
    h("button", {
      class: "rail-stop-tap",
      onclick: () => {
        if (suppressTap) { suppressTap = false; return; }
        state.selectedStopId = selected ? null : stop.id;
        render();
      },
    }, [
      day.id === "unplanned" ? null : h("span", { class: "stop-index", style: "color:" + day.hue + ";border-color:" + day.hue, text: String(routeNumbers(day)[stop.id] || day.stops.indexOf(stop) + 1) }, []),
      stop.time ? h("span", { class: "rail-time", style: "color:" + day.hue, text: stop.time }, []) : null,
      h("div", { class: "stop-text" }, [
        h("span", { class: "rail-name", text: stop.title }, []),
        h("span", { class: "rail-meta", text: stop.note || stop.description }, []),
      ]),
    ]),
  ]);
}

/**
 * The right panel: the stop being looked at, and what is known about it.
 *
 * The artboard also carries a "WHERE THIS CAME FROM" block naming the source
 * a place was imported from. The sources table has no importer behind it,
 * so that block is not here — it would be furniture.
 */
function deskDetail(stop) {
  const day = state.trip.days.find((d) => d.stops.some((s2) => s2.id === stop.id));
  const st = day ? statusOf(day, stop) : "ahead";
  const done = st === "done";
  const when = day
    ? (day.date === todayIso() ? "TODAY" : day.label.toUpperCase()) + (stop.time ? " · " + stop.time : "")
    : "TO BE PLANNED";

  const panel = h("div", { class: "desk-detail" }, [
    h("div", { class: "detail-head" }, [
      h("div", { class: "detail-when" }, [
        h("span", { class: "detail-dot", style: "background:" + STATUS_FILL[st] }, []),
        h("span", { text: when }, []),
      ]),
      h("div", { class: "detail-name", text: stop.title }, []),
      stop.description ? h("div", { class: "detail-sub", text: stop.description }, []) : null,
      h("div", { class: "detail-actions" }, [
        stop.navigateUrl
          ? h("a", {
              class: "detail-btn dark", href: stop.navigateUrl, target: "_blank", rel: "noreferrer",
            }, [icon("navigateLight"), "Navigate"])
          : null,
        h("button", {
          class: done ? "detail-btn on" : "detail-btn",
          onclick: () => toggleVisited(stop, done),
        }, [icon("check"), "Visited"]),
        h("button", {
          class: "detail-btn square", title: "Remove from the trip",
          onclick: () => removeStop(stop),
        }, [icon("trash")]),
      ]),
    ]),
    h("div", { class: "detail-block" }, [
      h("div", { class: "detail-label", text: "NOTES" }, []),
      stop.note
        ? h("div", { class: "detail-note", text: stop.note }, [])
        : h("div", { class: "detail-empty", text: "Nothing written yet." }, []),
      h("button", { class: "detail-link", onclick: () => editNote(stop) }, [
        stop.note ? "Edit note" : "Add a note",
      ]),
    ]),
    h("div", { class: "detail-block" }, [
      h("div", { class: "detail-label", text: "TIME" }, []),
      h("div", { class: "detail-note", text: stop.time || "No time yet." }, []),
      h("button", { class: "detail-link", onclick: () => openTime(stop) }, [
        stop.time ? "Edit time" : "Set a time",
      ]),
    ]),
  ]);
  return panel;
}

function screenTrip() {
  const trip = state.trip;
  const hasStops = trip.days.some((d) => d.stops.length) || trip.unplanned.length;
  const openDay = trip.days.find((d) => d.id === state.openDayId);
  const full = state.sheetFull;

  return h("div", { class: "screen" + (state.search ? " searching" : "") }, [
    h("div", { class: "trip-bar" }, [
      h("div", { class: "trip-bar-text" }, [
        h("button", {
          style: "display:flex;align-items:center;gap:5px;background:none;border:0;padding:0;text-align:left;min-width:0",
          onclick: () => {
            openLayer(() => { state.tripMenu = false; render(); });
            state.tripMenu = true;
            render();
          },
        }, [
          h("div", { class: "trip-bar-name", text: trip.trip.name }, []),
          icon("chevron"),
        ]),
        h("div", { class: "trip-bar-sub", text: trip.headerSubtitle }, []),
      ]),
      avatars(trip.members, false, 2),
      h("button", { class: "round-btn", title: "Invite someone", onclick: openPeople }, [icon("invite")]),
    ]),
    h("div", { class: "map" }, [
      // The real map when a browser key is configured; the drawn one from the
      // artboards otherwise, so the screen is never a grey rectangle.
      mapsKey()
        ? h("div", { id: "gmap", style: "position:absolute;inset:0" }, [])
        : h("div", { style: "position:absolute;inset:0", html: window.__MAP__ }, []),
      ...(mapsKey() || state.search ? [] : mapPins(state.openDayId === "unplanned" ? unplannedDay() : openDay)),
      ...searchMapLayer(),
      // Main.dc.html puts a three-key legend here. It is gone: the ring around
      // a pin already says done or not, the day list beside it says which day
      // is open, and three words of glossary on top of a small map cost more
      // room than they explain.
      state.search || hasStops || locatedStays().length ? null : emptyMapChip(),
      ...mapControls(),
    ]),
    h("div", { class: "sheet stops" + (full ? " full" : ""), id: "sheet" }, [
      grabber(),
      sheetTabs(),
      // SheetFull.dc.html titles this row "All stops". The title is
      // deliberately not here: the collapsed sheet has no header at all, so a
      // heading that appears only on expanding reads as the sheet becoming a
      // different screen. The control it sat beside is the useful half.
      full && state.sheetTab === "stops"
        ? h("div", { class: "all-stops" }, [
            h("button", {
              class: "filter-pill",
              "aria-pressed": state.hideVisited ? "true" : "false",
              onclick: () => { state.hideVisited = !state.hideVisited; render(); },
            }, [state.hideVisited ? "Not visited" : "Filter"]),
          ])
        : null,
      h("div", { class: "sheet-scroll" },
        state.sheetTab === "stays" ? staysPanel() : sheetContents(hasStops)),
    ]),
    noticeToast(),
    ...dragLayer(),
  ]);
}

/**
 * The handle, which drags and taps.
 *
 * Main.dc.html puts a click on it that toggles the sheet between 312 and 617
 * of its 667. A handle on a phone also has to actually drag, so it does both:
 * a drag follows the thumb and snaps to whichever end it is nearer, and a
 * press that barely moves is treated as the tap the artboard specifies.
 */
function grabber() {
  let startY = 0;
  let startHeight = 0;
  let moved = 0;
  let frame = null;

  const el = h("div", { class: "grabber" }, [h("i", {}, [])]);

  el.addEventListener("pointerdown", (event) => {
    const sheet = $("sheet");
    if (!sheet) return;
    frame = sheet.parentElement;
    startY = event.clientY;
    startHeight = sheet.getBoundingClientRect().height;
    moved = 0;
    sheet.classList.add("dragging");
    el.setPointerCapture(event.pointerId);
  });

  el.addEventListener("pointermove", (event) => {
    const sheet = $("sheet");
    if (!sheet || !el.hasPointerCapture(event.pointerId)) return;
    const delta = startY - event.clientY;
    moved = Math.max(moved, Math.abs(delta));
    const limits = sheetLimits(frame);
    const height = Math.min(limits.full, Math.max(limits.collapsed, startHeight + delta));
    sheet.style.height = height + "px";
  });

  const end = (event) => {
    const sheet = $("sheet");
    if (!sheet || !el.hasPointerCapture(event.pointerId)) return;
    el.releasePointerCapture(event.pointerId);
    sheet.classList.remove("dragging");
    sheet.style.height = "";

    if (moved < 6) {
      // Barely moved: this was the tap the artboard draws.
      state.sheetFull = !state.sheetFull;
    } else {
      // Snap to whichever end the thumb left it nearer.
      const limits = sheetLimits(frame);
      const height = sheet.getBoundingClientRect().height;
      state.sheetFull = height > (limits.collapsed + limits.full) / 2;
    }
    // Rendering replaces this very element, so let the gesture finish first.
    setTimeout(render, 0);
  };

  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  return el;
}

/**
 * The way out of a sheet, and the only one it needs.
 *
 * The search view had a labelled "Back to trip" button above its field. It was
 * put there because PlaceSearch.dc.html draws a bare X inside the field, which
 * reads as "clear what I typed" as readily as "leave" — a real problem, wrong
 * answer. The button names the thing behind the sheet, and what is behind it
 * is the map on one screen and the day grid on another, so it was either
 * wrong on one of them or vague on both.
 *
 * A sheet on iOS does not name what is behind it. It shows a grabber — the
 * small pill Apple calls exactly that — and you pull it down to put it away,
 * or tap it. So that is what this is: the same handle the main sheet already
 * has, doing the same thing. It means "put this away" on any screen, because
 * it refers to the card and not to whatever it is covering.
 *
 * A pull that does not get far enough springs back, which is how a person
 * finds out the gesture exists without losing anything.
 */
const DISMISS_PULL = 90;

function dismissGrabber(sheetId, close) {
  const el = h("div", { class: "grabber" }, [h("i", {}, [])]);

  el.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const sheet = $(sheetId);
    if (!sheet) return;

    const startY = event.clientY;
    let moved = 0;
    let down = 0;
    sheet.classList.add("dragging");

    // On the window, not on the handle: a gesture that ends a few pixels
    // outside the pill it started on is still that gesture.
    const move = (e) => {
      const delta = e.clientY - startY;
      moved = Math.max(moved, Math.abs(delta));
      down = Math.max(0, delta);
      sheet.style.transform = "translateY(" + down + "px)";
    };

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      sheet.classList.remove("dragging");
      sheet.style.transform = "";
      if (moved < 6 || down > DISMISS_PULL) close();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  });

  return el;
}

/** The two heights the sheet snaps between, in pixels of the current frame. */
function sheetLimits(frame) {
  const height = frame ? frame.getBoundingClientRect().height : window.innerHeight;
  return { collapsed: height * 0.468, full: height - 50 };
}

function emptyMapChip() {
  return h("div", { class: "map-chip" }, [
    icon("pinFaint"),
    h("span", { class: "empty", text: "no stops on the map yet" }, []),
  ]);
}

/**
 * The legend, saying what the dots now mean.
 *
 * design/Main.dc.html writes it as today / ahead / done, which was exactly
 * right when a pin's colour was its status. A pin's colour is its day now, so
 * those three words describe a scheme the map no longer uses — a green dot is
 * not today, it is whichever day is that shade of the ramp.
 *
 * What is still true, and what this says instead: the big numbered dots are
 * the day the sheet is open on, the small ones are the rest of the trip, and
 * grey is done. The first swatch takes the open day's own colour, so the
 * legend and the pins agree on any day of any trip rather than naming one.
 */
function mapLegend() {
  const open = state.trip.days.find((d) => d.id === state.openDayId);
  const key = (color, ink, label, mini) =>
    h("span", { class: "k", style: "color:" + ink }, [
      h("i", { style: "background:" + color + (mini ? ";width:7px;height:7px" : "") }, []),
      label,
    ]);
  return h("div", { class: "map-chip" }, [
    key(open ? open.hue : "#6F9A6B", "#4E7A4B", "this day"),
    key("#8C8C4C", "#96752F", "other days", true),
    key("#BDB4A7", "#9A9184", "done", true),
  ]);
}

/**
 * The two controls in the map's top right.
 *
 * Main.dc.html draws a layers button and a locate button and neither did
 * anything (PLAN.md, known bug 3). Layers had nothing to switch to: section 2
 * turns Google's own basemaps off and there is no second one. So the pair is
 * now the two things there are to do to a map you have panned away from —
 * put the whole trip back in the frame, and go to where you are standing.
 *
 * They are only drawn over the real map. The drawn fallback has no camera to
 * move, and a control that responds to nothing is worse than one that is not
 * there.
 */
function mapControls() {
  if (!mapsKey() || state.search) return [];
  return [
    h("div", { class: "map-controls" }, [
      h("button", { title: "Fit the whole trip", onclick: fitWholeTrip }, [icon("frameAll")]),
      h("button", {
        class: locating ? "busy" : "",
        title: "Where I am",
        onclick: goToMe,
      }, [icon("locate")]),
    ]),
  ];
}

/** Every located stop on the trip, not only the day that is open. */
async function fitWholeTrip() {
  const maps = await loadMaps();
  if (!maps || !gmap) return;

  const located = [];
  for (const day of state.trip.days) {
    for (const stop of day.stops) if (stop.location) located.push(stop.location);
  }
  for (const stop of state.trip.unplanned) if (stop.location) located.push(stop.location);
  for (const stay of locatedStays()) located.push({ lat: stay.lat, lng: stay.lng });

  if (!located.length) {
    state.error = "Nothing on this trip has a place on it yet";
    render();
    return;
  }

  const bounds = new maps.LatLngBounds();
  for (const at of located) bounds.extend(at);
  gmap.fitBounds(bounds, fitPadding());
  if (located.length === 1) gmap.setZoom(14);
  // The camera is now somebody's, not the open day's.
  mapFitted = dayFitKey();
}

/** The sheet covers the lower half, so the fit goes into the band above it. */
function fitPadding() {
  const sheet = wideNow() ? null : $("search-sheet") || $("sheet");
  const covered = sheet ? sheet.getBoundingClientRect().height : 0;
  return { top: 60, right: 40, bottom: covered + 20, left: 40 };
}

let meMarker = null;
let locating = false;

/**
 * Where the phone is.
 *
 * Nothing is stored and nothing is sent anywhere: the coordinate is used to
 * move the camera and draw one dot, and it is gone on the next reload. A
 * refusal is said out loud rather than left as a button that did nothing.
 */
function goToMe() {
  if (!navigator.geolocation) {
    state.error = "This browser will not say where it is";
    render();
    return;
  }
  if (locating) return;
  locating = true;
  render();

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      locating = false;
      const at = { lat: position.coords.latitude, lng: position.coords.longitude };
      const maps = await loadMaps();
      if (!maps || !gmap) { render(); return; }

      if (meMarker) meMarker.setMap(null);
      meMarker = new maps.Marker({
        position: at,
        map: gmap,
        title: "Where you are",
        icon: { url: window.__ME_PIN__ },
        zIndex: 4,
      });
      gmap.panTo(at);
      gmap.setZoom(16);
      mapFitted = dayFitKey();
      render();
    },
    (error) => {
      locating = false;
      state.error = error.code === 1
        ? "This phone is not sharing where it is"
        : "Could not work out where you are";
      render();
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  );
}

/* ------------------------------------------------------- the search map */

function searchMapLayer() {
  const search = state.search;
  if (!search || mapsKey()) return [];
  return search.rows.filter((row) => row.location && !row.onTrip).map((row) => h("button", {
    class: "suggestion-pin" + (row.placeId === search.lookingAt ? " selected" : ""),
    "aria-label": row.name,
    "data-lat": String(row.location.lat),
    "data-lng": String(row.location.lng),
    onclick: () => lookAt(row),
  }, [icon("pinInk")]));
}

function paintSearchMap() {
  if (!state.search || mapsKey()) return;
  const pins = [...document.querySelectorAll(".suggestion-pin")];
  if (!pins.length) return;
  const lats = pins.map((pin) => Number(pin.dataset.lat));
  const lngs = pins.map((pin) => Number(pin.dataset.lng));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const height = visibleMapHeight();
  for (const pin of pins) {
    const x = maxLng === minLng ? 0.5 : (Number(pin.dataset.lng) - minLng) / (maxLng - minLng);
    const y = maxLat === minLat ? 0.5 : (maxLat - Number(pin.dataset.lat)) / (maxLat - minLat);
    pin.style.left = (15 + x * 70) + "%";
    pin.style.top = (24 + y * Math.max(0, height - 48)) + "px";
  }
}

function visibleMapHeight() {
  const host = document.querySelector(".map");
  if (!host) return 138;
  const map = host.getBoundingClientRect();
  if (wideNow()) return map.height;
  // The search sheet, not the day sheet underneath it. Querying ".sheet" gets
  // whichever is first in the DOM, which is the wrong one while searching and
  // put the circle behind it.
  const sheet = $("search-sheet") || document.querySelector(".sheet");
  if (!sheet) return map.height;
  return Math.max(60, sheet.getBoundingClientRect().top - map.top);
}

/** Tapping a row looks at it: the row highlights and the map goes to it. */
function lookAt(row) {
  const s = state.search;
  s.lookingAt = s.lookingAt === row.placeId ? null : row.placeId;
  render();

  if (mapsKey() && s.lookingAt) centreOnResult(row);
}

/* ------------------------------------------------------------------- map */

const mapsKey = () => window.__MAPS_KEY__ || "";

let gmap = null;
let gmarkers = [];
let mapsLoading = null;
/**
 * What the camera was last put where it is for.
 *
 * The map used to be re-fitted to the open day on every render, which meant
 * selecting a stop, ticking one off or saving a note all snapped the map back
 * and threw away a pan. It is fitted when the thing being shown changes — a
 * different day, a stop added or removed — and otherwise left where whoever
 * is holding the phone put it.
 */
let mapFitted = null;

/**
 * Loads the Maps JavaScript API once.
 *
 * Resolves to null if it cannot load — a blocked host, a key the referrer list
 * refuses, no network in a basement — and the caller leaves the drawn map in
 * place rather than showing a broken one.
 */
function loadMaps() {
  if (mapsLoading) return mapsLoading;
  if (window.google && window.google.maps) return Promise.resolve(window.google.maps);

  mapsLoading = new Promise((resolve) => {
    const done = (value) => { clearTimeout(timer); resolve(value); };

    // A request that neither loads nor errors would hang the map forever, and
    // this is an app for basements and hotel wifi (PLAN.md section 2). On a
    // network that drops the connection silently the script tag fires no
    // event at all, so the timeout is what makes the drawn map appear instead.
    const timer = setTimeout(() => done(null), 8000);

    const tag = document.createElement("script");
    tag.src = "https://maps.googleapis.com/maps/api/js?v=weekly&key=" + encodeURIComponent(mapsKey());
    tag.async = true;
    tag.onload = () => done(window.google && window.google.maps ? window.google.maps : null);
    tag.onerror = () => done(null);
    document.head.append(tag);
  });
  return mapsLoading;
}

/**
 * Puts the open day's stops on the real map.
 *
 * Every default control is off: the legend, the layers button and the locate
 * button are the artboards', and PLAN.md section 2 objects specifically to
 * Google's own furniture landing in a design meant to be calm.
 */
let mapTrails = [];
let trailWaveTimer = null;
function stopTrailWave() {
  if (trailWaveTimer !== null) clearInterval(trailWaveTimer);
  trailWaveTimer = null;
}
function trailWaveOpacity(position, elapsed, legs) {
  const distance = ((position - elapsed / 4000) % legs + legs * 1.5) % legs - legs / 2;
  const width = distance > 0 ? .18 : .55;
  return .24 + .44 * Math.exp(-Math.pow(distance / width, 2));
}
function animateTrailWave(update) {
  stopTrailWave();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches) { update(null); return; }
  const start = performance.now();
  update(0);
  trailWaveTimer = setInterval(() => {
    if (motion.matches) { update(null); stopTrailWave(); return; }
    if (!document.hidden) update(performance.now() - start);
  }, 60);
}
function dayTrailPoints(day, lodging) {
  const stays = lodging.filter((stay) => Number.isFinite(stay.lat) && Number.isFinite(stay.lng) && stay.check_in <= day.date && stay.check_out >= day.date)
    .sort((a, b) => a.check_in.localeCompare(b.check_in) || a.check_out.localeCompare(b.check_out) || a.id.localeCompare(b.id));
  const points = stays.length ? [{ lat: stays[0].lat, lng: stays[0].lng }] : [];
  for (const stop of day.stops) {
    if (stop.accommodation || !stop.location || !Number.isFinite(stop.location.lat) || !Number.isFinite(stop.location.lng)) continue;
    points.push({ lat: stop.location.lat, lng: stop.location.lng });
  }
  if (stays.length > 1) points.push({ lat: stays[stays.length - 1].lat, lng: stays[stays.length - 1].lng });
  return points.filter((point, i) => !i || point.lat !== points[i - 1].lat || point.lng !== points[i - 1].lng);
}

function smoothTrail(points) {
  if (points.length < 2) return points;
  const route = points.map((point) => ({ lat: point.lat, lng: point.lng }));
  for (let i = 1; i < route.length; i++) route[i].lng += 360 * Math.round((route[i - 1].lng - route[i].lng) / 360);
  const path = [route[0]];
  if (route.length === 2) {
    const a = route[0], b = route[1];
    const control = { lat: (a.lat + b.lat) / 2 + (b.lng - a.lng) * .1, lng: (a.lng + b.lng) / 2 - (b.lat - a.lat) * .1 };
    for (let step = 1; step <= 20; step++) {
      const t = step / 20, u = 1 - t;
      path.push({ lat: u * u * a.lat + 2 * u * t * control.lat + t * t * b.lat, lng: u * u * a.lng + 2 * u * t * control.lng + t * t * b.lng });
    }
    return path;
  }
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[Math.max(0, i - 1)], b = route[i], c = route[i + 1], d = route[Math.min(route.length - 1, i + 2)];
    for (let step = 1; step <= 20; step++) {
      const t = step / 20;
      const point = {};
      for (const key of ["lat", "lng"]) {
        point[key] = .5 * ((2 * b[key]) + (-a[key] + c[key]) * t + (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * t * t + (-a[key] + 3 * b[key] - 3 * c[key] + d[key]) * t * t * t);
      }
      path.push(point);
    }
  }
  return path;
}

function paintDayTrail(maps) {
  stopTrailWave();
  for (const trail of mapTrails) trail.setMap(null);
  mapTrails = [];
  const day = state.trip.days.find((day) => day.id === state.openDayId);
  if (!day) return;
  const points = dayTrailPoints(day, state.trip.lodging || []);
  if (points.length < 2) return;
  const curve = smoothTrail(points);
  const icons = Array.from({ length: 24 }, (_, i) => ({
    icon: { path: maps.SymbolPath.CIRCLE, scale: 1.6, fillColor: day.hue, fillOpacity: .55, strokeOpacity: 0 },
    offset: (i * 8) + "px", repeat: "192px",
  }));
  const line = new maps.Polyline({ map: gmap, path: curve, strokeOpacity: 0, clickable: false, zIndex: 5, icons });
  mapTrails.push(line);
  animateTrailWave((elapsed) => {
    for (let i = 0; i < icons.length; i++) icons[i].icon.fillOpacity = elapsed === null ? .55 : trailWaveOpacity(i / icons.length, elapsed, 1);
    line.set("icons", icons);
  });
}

async function paintMap() {
  if (!mapsKey()) return;
  const host = $("gmap");
  if (!host) return;

  const maps = await loadMaps();
  if ($("gmap") !== host) return;
  if (!maps) {
    // Fall back to the drawn map for the rest of the session.
    window.__MAPS_KEY__ = "";
    render();
    return;
  }

  if (!gmap || gmap.getDiv() !== host) {
    gmap = new maps.Map(host, {
      center: { lat: 20, lng: 0 },
      zoom: 2,
      styles: window.__MAP_STYLE__,
      disableDefaultUI: true,
      clickableIcons: false,
      keyboardShortcuts: false,
      gestureHandling: "greedy",
      draggableCursor: "pointer",
      draggingCursor: "grabbing",
    });
  }

  for (const marker of gmarkers) marker.setMap(null);
  gmarkers = [];

  /*
   * The whole trip, not just the day being planned.
   *
   * Every day's stops go on, the open one full size and numbered and the rest
   * as mini dots in their own colour — so the shape of the trip is there to
   * see, and a place two days from now is not invisible while you are looking
   * for somewhere to put lunch. pinLook decides what each one looks like.
   */
  const bounds = new maps.LatLngBounds();
  // Only the open day's own pins decide where the map sits. Fitting the whole
  // trip would zoom out to the country on any trip that moves city.
  const focus = new maps.LatLngBounds();
  let focused = 0;

  for (const day of [...state.trip.days, unplannedDay()]) {
    const open = day.id === state.openDayId;
    const numbers = open && day.id !== "unplanned" ? routeNumbers(day) : {};

    for (const stop of day.stops) {
      if (!stop.location) continue;

      const look = pinLook(day, stop, open, numbers[stop.id]);
      const pin = pinUrl(look);
      const marker = new maps.Marker({
        position: stop.location,
        map: gmap,
        title: stop.title,
        icon: {
          url: pin.url,
          // Centred on the coordinate. A dot that hangs by its bottom edge is
          // pointing a few metres north of where the place is.
          scaledSize: new maps.Size(pin.box, pin.box),
          anchor: new maps.Point(pin.box / 2, pin.box / 2),
        },
        zIndex: look.z,
      });
      marker.addListener("click", () => {
        // Tapping a pin on another day opens that day, which is the only way
        // the pin can grow a number and the row it belongs to can be read.
        if (!open) state.openDayId = day.id;
        state.selectedStayId = null;
        state.sheetTab = "stops";
        state.selectedStopId = stop.id === state.selectedStopId ? null : stop.id;
        state.menuOpen = false;
        render();
      });
      gmarkers.push(marker);
      bounds.extend(stop.location);
      if (open) { focus.extend(stop.location); focused++; }
    }
  }

  const openDay = state.trip.days.find((day) => day.id === state.openDayId);
  for (const stay of locatedStays()) {
    const position = { lat: stay.lat, lng: stay.lng };
    const active = Boolean(openDay && stay.check_in <= openDay.date && stay.check_out >= openDay.date);
    const look = pinLook(openDay || {}, { id: stay.id, accommodation: true }, active);
    const pin = pinUrl(look);
    const marker = new maps.Marker({
      position, map: gmap, title: stay.name,
      icon: { url: pin.url, scaledSize: new maps.Size(pin.box, pin.box), anchor: new maps.Point(pin.box / 2, pin.box / 2) },
      zIndex: look.z,
    });
    marker.addListener("click", () => selectStay(stay));
    gmarkers.push(marker);
    bounds.extend(position);
    if (openDay && stay.check_in <= openDay.date && stay.check_out >= openDay.date) {
      focus.extend(position);
      focused++;
    }
  }

  paintDayTrail(maps);
  if (state.search) { paintSuggestionPins(maps); return; }
  clearLookMarker();
  if (focusSelectedMapStop()) return;
  if (!gmarkers.length) return;

  // The sheet covers the lower half, so the pins are fitted into the band
  // above it rather than into the whole viewport.
  if (mapFitted === dayFitKey()) return;
  mapFitted = dayFitKey();
  gmap.fitBounds(focused ? focus : bounds, fitPadding());
  if ((focused ? focused : gmarkers.length) === 1) gmap.setZoom(15);
}

/**
 * What the camera would be fitted to if it followed the open day.
 *
 * Holding it as the token means a camera somebody moved by hand is left
 * alone: fitting the whole trip or going to where you are stamps this key, so
 * the next render finds the day's fit already spent and does not snap back.
 * Opening another day changes the key, and the map follows again.
 */
let focusedMapStop = null;
function focusSelectedMapStop() {
  const stay = (state.trip.lodging || []).find((stay) => stay.id === state.selectedStayId);
  const stop = stay
    ? { id: "stay:" + stay.id, location: Number.isFinite(stay.lat) && Number.isFinite(stay.lng) ? { lat: stay.lat, lng: stay.lng } : null }
    : [...state.trip.days.flatMap((day) => day.stops), ...(state.trip.unplanned || [])].find((stop) => stop.id === state.selectedStopId);
  if (!stop || !stop.location) {
    if (focusedMapStop) mapFitted = null;
    focusedMapStop = null;
    return false;
  }
  const key = stop.id + ":" + stop.location.lat + ":" + stop.location.lng;
  if (focusedMapStop !== key) {
    focusedMapStop = key;
    const zoom = Math.max(gmap.getZoom() || 0, 15);
    const center = paddedMapCenter(stop.location, zoom, fitPadding());
    if (gmap.getZoom() < zoom) gmap.setZoom(zoom);
    gmap.panTo(center);
  }
  return true;
}

function paddedMapCenter(location, zoom, padding) {
  const world = 256 * Math.pow(2, zoom);
  const radians = Math.max(-85, Math.min(85, location.lat)) * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 + (padding.bottom - padding.top) / (2 * world);
  return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI, lng: location.lng + (padding.right - padding.left) * 180 / world };
}

function dayFitKey() {
  const day = state.trip.days.find((d) => d.id === state.openDayId);
  const stops = (day ? day.stops : state.openDayId === "unplanned" ? state.trip.unplanned || [] : []).filter((s) => s.location);
  return state.trip.trip.id + ":" + state.openDayId + ":" + stops.map((s) => s.id + ":" + s.location.lat + ":" + s.location.lng).join(",") + ":" + (state.trip.lodging || []).map((s) => [s.id, s.lat, s.lng, s.check_in, s.check_out].join(":")).join(",");
}

function locatedStays() {
  return (state.trip.lodging || []).filter((stay) => Number.isFinite(stay.lat) && Number.isFinite(stay.lng));
}

let suggestionMarkers = [];
let suggestionFitKey = null;

function paintSuggestionPins(maps) {
  for (const marker of suggestionMarkers) marker.setMap(null);
  suggestionMarkers = [];
  const search = state.search;
  if (!search) return;
  const rows = search.rows.filter((row) => row.location && !row.onTrip);
  const bounds = new maps.LatLngBounds();
  for (const row of rows) {
    const selected = row.placeId === search.lookingAt;
    const size = selected ? 26 : 22;
    const marker = new maps.Marker({ position: row.location, map: gmap, title: row.name,
      icon: { url: window.__LOOK_PIN__, scaledSize: new maps.Size(size, size * 1.25), anchor: new maps.Point(size / 2, size * 1.16) }, zIndex: selected ? 60 : 50 });
    marker.addListener("click", () => lookAt(row));
    suggestionMarkers.push(marker);
    bounds.extend(row.location);
  }
  const key = rows.map((row) => row.placeId).join(",");
  if (rows.length && key !== suggestionFitKey) {
    suggestionFitKey = key;
    gmap.fitBounds(bounds, fitPadding());
    if (rows.length === 1) gmap.setZoom(15);
  }
}

async function centreOnResult(row) {
  const maps = await loadMaps();
  if (!maps || !gmap || !row.location) return;

  gmap.panTo(wideNow() ? row.location : paddedMapCenter(row.location, gmap.getZoom() || 15, fitPadding()));
}

function clearLookMarker() {
  for (const marker of suggestionMarkers) marker.setMap(null);
  suggestionMarkers = [];
  suggestionFitKey = null;
}

/**
 * Projects the open day's stops on to the drawn map.
 *
 * The ground is a drawing, so there is no true projection to use. Fitting the
 * day's own bounding box into the visible area keeps the relative positions of
 * the pins truthful, which is the part that carries meaning.
 *
 * The band is deliberately narrow: the sheet covers the lower half of the map,
 * so a pin placed by a naive 0-100% fit would sit behind it.
 */
function mapPins(day, wide) {
  const stays = locatedStays().map((stay) => ({ ...stay, accommodation: true, title: stay.name, location: { lat: stay.lat, lng: stay.lng } }));
  const located = (day ? day.stops.filter((s) => s.location) : []).concat(stays);
  if (!located.length) return [];

  const lats = located.map((s) => s.location.lat);
  const lngs = located.map((s) => s.location.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 0.004);
  const spanLng = Math.max(maxLng - minLng, 0.004);

  /*
   * The open day only, where the real map shows the whole trip.
   *
   * Not an oversight: this projection is the day's own bounding box stretched
   * across a band of the drawing, which is truthful about one day's relative
   * positions and says nothing at all about where the next city is. Putting
   * another day's stops through it would place them somewhere specific and
   * wrong, which is worse than leaving them off. The pins that are here get
   * the same colours, sizes and numbers as the real map's.
   */
  const numbers = day && day.id !== "unplanned" ? routeNumbers(day) : {};

  const pins = located.map((stop) => {
    const active = Boolean(day && (!stays.includes(stop) || stop.check_in <= day.date && stop.check_out >= day.date));
    const look = pinLook(day || {}, stop, active, numbers[stop.id]);
    /*
     * The band the pins are fitted into.
     *
     * On a phone the sheet covers the lower half, so they go in the strip
     * above it: 16-84% across, 14-40% down. At a desk there is no sheet over
     * the map, and squeezing the day into the top quarter of a 1000px map
     * left the pins in a knot with an ocean of empty ground below them.
     */
    const top = wide ? 14 : 14;
    const depth = wide ? 62 : 26;
    const x = 16 + ((stop.location.lng - minLng) / spanLng) * 68;
    const y = top + depth - ((stop.location.lat - minLat) / spanLat) * depth;
    return h("button", {
      class: "pin",
      style: "left:" + x + "%;top:" + y + "%;opacity:" + look.opacity + ";z-index:" + look.z,
      title: stop.title,
      onclick: () => {
        if (stays.includes(stop)) { selectStay(stop); return; }
        state.selectedStopId = stop.id;
        render();
      },
    }, [
      h("i", {
        style: "width:" + look.size + "px;height:" + look.size + "px;background:" + look.fill +
          ";border-color:" + look.ring + ";font-size:" + Math.round(look.size * 0.58) + "px",
        html: look.roof ? ICONS.houseWhite : null,
        text: look.roof ? null : (look.number ? String(look.number) : null),
      }, []),
    ]);
  });
  if (day) {
    const points = smoothTrail(dayTrailPoints(day, state.trip.lodging || []));
    if (points.length > 1) {
      const depth = wide ? 62 : 26;
      const legs = (points.length - 1) / 20;
      const dots = points.map((point, i) => '<circle class="trail-wave-dot" cx="' + (16 + (point.lng - minLng) / spanLng * 68) + '" cy="' + (14 + depth - (point.lat - minLat) / spanLat * depth) + '" r=".36" style="animation-duration:' + (legs * 4) + 's;animation-delay:-' + (legs * 4 - i / 20 * 4) + 's"/>').join("");
      pins.unshift(h("div", { class: "map-trail-layer", html: '<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" fill="' + day.hue + '">' + dots + '</svg>' }, []));
    }
  }
  return pins;
}

/**
 * The sheet's two tabs.
 *
 * Everything in this app until now has been a place you go on a day. Where
 * you sleep is not that: it is one thing that covers a run of days, and there
 * was no honest way to put it in a day's list — a hotel repeated on six days
 * reads as six hotels, and on one day it reads as a single night. So the
 * sheet has two lists and the stays get their own, with the dates on them.
 */
function sheetTabs() {
  const tab = (key, label, name) =>
    h("button", {
      class: "sheet-tab" + (state.sheetTab === key ? " on" : ""),
      "aria-pressed": state.sheetTab === key ? "true" : "false",
      onclick: () => {
        const change = () => { state.sheetTab = key; state.dayEdit = null; render(); };
        if (state.search || state.stayEdit) closeThen(1, change); else change();
      },
    }, [icon(name), label]);

  return h("div", { class: "sheet-tabs" }, [
    tab("stops", "Destinations", "pinInk"),
    tab("stays", "Accommodations", "houseInk"),
  ]);
}

function sheetContents(hasStops) {
  const trip = state.trip;
  const out = [];

  for (const day of trip.days) {
    const open = day.id === state.openDayId;
    const wrap = h("div", {
      class: open ? "day-wrap drop-zone open" : "day-wrap drop-zone",
      "data-day-id": day.id,
    }, []);
    const done = day.stops.filter((s) => statusOf(day, s) === "done").length;
    // The progress count stays honest: it counts the day, not what is shown.
    const shown = state.hideVisited
      ? day.stops.filter((s) => statusOf(day, s) !== "done")
      : day.stops;

    const toggle = () => {
      state.openDayId = open ? null : day.id;
      state.selectedStopId = null;
      state.dayEdit = null;
      render();
    };
    const editing = state.dayEdit === day.id;
    // What a person called the day, then where it is. Both are optional and
    // neither is invented, so the line is absent rather than empty.
    const second = [day.name, day.place_label].filter(Boolean).join(" · ");

    wrap.append(
      h("div", {
        class: open ? "day-head open" : "day-head",
        "data-day-id": day.id,
      }, [
        h("button", { class: "day-head-tap", onclick: toggle }, [
          h("span", {
            class: "day-hue",
            style: "background:" + day.hue,
            title: "Day colour",
          }, []),
          h("div", { class: "day-head-text" }, [
            h("div", { class: "day-head-top" }, [
              h("span", { class: "day-label", text: day.label }, []),
              day.date === todayIso() ? h("span", { class: "today-tag", text: "TODAY" }, []) : null,
            ]),
            second ? h("span", { class: "day-place", text: second }, []) : null,
          ]),
          h("span", { class: "drop-here", text: "DROP HERE TO MOVE", hidden: true }, []),
          h("span", { class: "day-progress", text: done + "/" + day.stops.length }, []),
        ]),
        // To the right of the count, as the one thing on the row that changes
        // the day itself rather than opening it.
        h("button", {
          class: editing ? "day-pencil on" : "day-pencil",
          title: "Name this day, or change its colour",
          "aria-pressed": editing ? "true" : "false",
          onclick: () => toggleDayEdit(day.id),
        }, [icon("pencilDay")]),
        h("button", { class: "day-chevron", onclick: toggle, title: open ? "Close" : "Open" }, [
          h("span", { style: "display:flex;transform:rotate(" + (open ? 0 : -90) + "deg)", html: ICONS.chevron }, []),
        ]),
      ]),
    );

    if (editing) wrap.append(dayEditPanel(day));
    const stays = dayStays(day);
    if (stays.length) wrap.append(dayStayBar(day, stays[0], "start"));

    if (open) {
      if (!hasStops) {
        wrap.append(emptyDayBody());
        for (const stay of stays.slice(1)) wrap.append(dayStayBar(day, stay, "end"));
      }
      else {
        // The 36px time column holds the grid together, but only when there
        // is something to put in it. Many stops never get a time (PLAN.md
        // section 11), and an empty column is just a gap.
        const showTimes = shown.some((s) => s.time);
        // Numbered over the whole day, not over what is shown: hiding the
        // visited ones must not renumber the rest out from under the map.
        const numbers = routeNumbers(day);
        const body = h("div", { class: "day-body" },
          shown.map((stop) => stopCard(day, stop, showTimes, numbers[stop.id])));
        for (const stay of stays.slice(1)) body.append(dayStayBar(day, stay, "end"));
        body.append(
          h("button", { class: "add-stop", "aria-label": "Add a place", onclick: () => openSearch(day.id) }, [icon("plusGrey")]),
        );
        wrap.append(body);
      }
    }
    out.push(wrap);
  }

  const unplanned = trip.unplanned;
  const unplannedOpen = state.openDayId === "unplanned";
  const toggleUnplanned = () => switchMapDay(unplannedOpen ? null : "unplanned");
  out.push(
    h("div", { class: "day-wrap drop-zone" + (unplannedOpen ? " open" : ""), "data-day-id": "unplanned" }, [
      h("div", { class: "day-head" + (unplannedOpen ? " open" : ""), "data-day-id": "unplanned" }, [
        h("button", {
          class: "day-head-tap",
          "aria-expanded": String(unplannedOpen),
          onclick: toggleUnplanned,
        }, [
          h("span", { class: "day-hue", style: "background:#94897A" }, []),
          h("div", { class: "day-head-text" }, [
            h("div", { class: "day-head-top" }, [
              h("span", { class: "day-label", text: "To be planned" }, []),
            ]),
          ]),
          h("span", { class: "drop-here", text: "DROP HERE TO MOVE", hidden: true }, []),
          h("span", { class: "day-progress", text: String(unplanned.length) }, []),
        ]),
        h("button", { class: "day-chevron", onclick: toggleUnplanned, title: unplannedOpen ? "Close" : "Open" }, [
          h("span", { style: "display:flex;transform:rotate(" + (unplannedOpen ? 0 : -90) + "deg)", html: ICONS.chevron }, []),
        ]),
      ]),
      unplannedOpen ? h("div", { class: "day-body" }, [
        ...unplanned.map((stop) => stopCard(unplannedDay(), stop, false, null)),
        h("button", { class: "add-stop", "aria-label": "Add a place", onclick: () => openSearch("unplanned") }, [icon("plusGrey")]),
      ]) : null,
    ]),
  );

  return out;
}

function unplannedDay() {
  return { id: "unplanned", hue: "#94897A", stops: state.trip.unplanned || [] };
}

function dayStays(day) {
  return (state.trip.lodging || []).filter((stay) => stay.check_in <= day.date && stay.check_out >= day.date)
    .sort((a, b) => a.check_in.localeCompare(b.check_in) || a.check_out.localeCompare(b.check_out) || a.id.localeCompare(b.id));
}

function dayStayBar(day, stay, edge) {
  const anchor = "stay-" + day.id + "-" + stay.id + "-" + edge;
  return h("div", { class: "day-stay-bar" + (edge === "end" ? " day-stay-end" : "") }, [
    icon("houseInk"),
    h("button", { id: anchor, "data-stay-anchor": stay.id, class: "stay-bar", "aria-expanded": String(state.stayPopover === anchor), onclick: () => selectStay(stay, anchor) }, [
      h("span", { class: "stay-bar-name", text: stay.name }, []),
    ]),
  ]);
}

/* ------------------------------------------------------- accommodations */

/**
 * The stays on this trip, with the dates each one covers.
 *
 * A stay is the one thing in the app that is a range. The rows read as one
 * line of dates rather than two fields, because what is being checked at a
 * glance is whether the nights join up.
 */
function staysPanel() {
  const stays = state.trip.lodging || [];
  const out = [];
  const editing = wideNow() && state.stayEdit;

  if (!stays.length) {
    out.push(
      h("div", { class: "empty-state" }, [
        h("h3", { text: "Nowhere to sleep yet" }, []),
        h("p", { text: "Add where you are staying and the nights it covers, and it will run under the days on the Plan view." }, []),
      ]),
    );
  }

  for (const stay of stays) {
    if (editing && editing.id === stay.id) { out.push(...sheetStay(true)); continue; }
    const selected = state.selectedStayId === stay.id;
    out.push(h("div", { class: "stop stay-card" + (selected ? " selected" : "") }, [
      h("div", { class: "stay-row" }, [
        h("span", { class: "stay-color", style: "background:" + PIN.bed }, []),
        h("button", { class: "stay-tap", "aria-expanded": String(selected), onclick: () => selectStay(stay) }, [
          h("span", { class: "stay-name", text: stay.name }, []),
          h("span", { class: "stay-when", text: stayRange(stay) }, []),
          stay.city || stay.address ? h("span", { class: "stay-when", text: stay.city || stay.address }, []) : null,
        ]),
      ]),
      selected ? stayDetails(stay) : null,
    ]));
  }

  out.push(
    editing && !editing.id ? sheetStay(true)[0] : h("div", { style: "padding:10px 14px 4px" }, [
      h("button", { class: "add-place", onclick: () => openStay(null) }, [
        icon("plusGrey"), "Add a stay",
      ]),
    ]),
  );

  // Every night of the trip wants a bed, and the gaps are the useful thing to
  // see. Said as a line rather than drawn, because the Plan view draws it.
  const missing = nightsWithoutABed();
  if (missing) out.push(h("div", { class: "stay-gap", text: missing }, []));

  return out;
}

/** Sep 30 – Oct 2 · 3 nights, or one date for a single night. */
function selectStay(stay, anchor) {
  if (!stay) return;
  state.selectedStopId = null;
  const close = state.selectedStayId === stay.id && state.stayPopover === (anchor || null);
  state.selectedStayId = close ? null : stay.id;
  state.stayPopover = close ? null : anchor || null;
  state.stayMenu = null;
  state.stayNote = null;
  if (!planning() && !anchor) state.sheetTab = "stays";
  render();
}

function stayDetails(stay) {
  const destination = Number.isFinite(stay.lat) && Number.isFinite(stay.lng) ? stay.lat + "," + stay.lng : stay.address || stay.name;
  const url = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(destination) + (stay.google_place_id ? "&destination_place_id=" + encodeURIComponent(stay.google_place_id) : "");
  return h("div", { class: "stop-actions stay-details" }, [
    !state.stayNote && stay.note ? h("div", { class: "stop-note" }, [h("i", {}, []), h("span", { text: stay.note }, [])]) : null,
    h("div", { class: "action-row stay-actions" }, [
      h("a", { class: "action dark", href: url, target: "_blank", rel: "noreferrer" }, [icon("navigateLight"), "Navigate"]),
      h("button", { class: "action", onclick: () => { state.stayMenu = null; state.stayNote = { id: stay.id, text: stay.note || "" }; render(); } }, [icon("pencil"), stay.note ? "Edit note" : "Add note"]),
      h("div", { class: "stay-menu-anchor" }, [
        h("button", { id: "stay-options-" + stay.id, class: "action kebab", title: "Stay options", "aria-expanded": String(state.stayMenu === stay.id), onclick: () => { state.stayMenu = state.stayMenu === stay.id ? null : stay.id; render(); } }, [icon("kebab")]),
      ]),
    ]),
    state.stayNote && state.stayNote.id === stay.id ? h("div", { class: "stay-note-editor" }, [
      h("textarea", { "aria-label": "Stay note", text: state.stayNote.text, oninput: (event) => { state.stayNote.text = event.target.value; } }, []),
      h("div", { class: "note-actions" }, [
        h("button", { class: "save", onclick: () => {
          const note = state.stayNote.text;
          state.stayNote = null;
          optimistic(() => { const before = stay.note; stay.note = note; return () => { stay.note = before; }; }, () => post("/api/lodging/" + stay.id, { note }), "That note did not save");
        } }, ["Save note"]),
        h("button", { class: "cancel", onclick: () => { state.stayMenu = null; state.stayNote = null; render(); } }, ["Cancel"]),
      ]),
    ]) : null,
  ]);
}

function renderStayOverlays() {
  if (!state.trip || state.screen !== "trip") {
    state.stayPopover = null;
    state.stayMenu = null;
    state.stayNote = null;
    state.selectedStayId = null;
    return;
  }
  if (state.stayPopover) {
    const stay = byStayId(state.selectedStayId);
    if (stay && $(state.stayPopover)) {
      frame.append(h("div", { class: "stay-popover", "data-floating-anchor": state.stayPopover, role: "dialog", "aria-label": stay.name }, [
        h("div", { class: "stay-popover-title", text: stay.name }, []),
        stayDetails(stay),
      ]));
    } else { state.stayPopover = null; state.stayNote = null; }
  }
  if (state.stayMenu) {
    const stay = byStayId(state.stayMenu);
    const anchor = "stay-options-" + state.stayMenu;
    if (stay && $(anchor)) frame.append(h("div", { class: "stay-menu", "data-floating-anchor": anchor, "aria-label": "Stay options" }, [
      h("button", { onclick: () => { state.stayMenu = null; state.stayPopover = null; openStay(stay); } }, [icon("pencil"), "Edit Stay"]),
      h("button", { onclick: () => { state.stayMenu = null; state.stayPopover = null; state.selectedStayId = null; removeStay(stay); } }, [icon("trash"), "Delete"]),
    ]));
  }
  positionStayOverlays();
}

function floatingPosition(anchor, size, bounds) {
  const gap = 6;
  const below = bounds.bottom - anchor.bottom - gap;
  const above = anchor.top - bounds.top - gap;
  const down = below >= size.height || below >= above;
  const height = Math.min(size.height, Math.max(0, down ? below : above));
  return {
    left: Math.max(bounds.left, Math.min(anchor.right - size.width, bounds.right - size.width)),
    top: down ? Math.max(bounds.top, anchor.bottom + gap) : Math.max(bounds.top, anchor.top - gap - height),
    maxHeight: height,
  };
}

function positionStayOverlays() {
  if (!state.stayPopover && !state.stayMenu) return;
  const box = frame.getBoundingClientRect();
  const viewport = window.visualViewport;
  const bounds = { left: Math.max(box.left, viewport ? viewport.offsetLeft : 0) + 8, right: Math.min(box.right, viewport ? viewport.offsetLeft + viewport.width : window.innerWidth) - 8,
    top: Math.max(box.top, viewport ? viewport.offsetTop : 0) + 8, bottom: Math.min(box.bottom, viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 8 };
  for (const popup of document.querySelectorAll("[data-floating-anchor]")) {
    const anchor = $(popup.dataset.floatingAnchor);
    if (!anchor) { popup.remove(); continue; }
    popup.style.maxWidth = Math.max(0, bounds.right - bounds.left) + "px";
    popup.style.maxHeight = "none";
    const rect = anchor.getBoundingClientRect();
    const scroll = anchor.closest(".rail-list, .sheet-scroll");
    const visible = scroll ? scroll.getBoundingClientRect() : bounds;
    popup.style.visibility = rect.bottom < visible.top || rect.top > visible.bottom ? "hidden" : "visible";
    const position = floatingPosition(rect, popup.getBoundingClientRect(), bounds);
    popup.style.left = position.left + "px";
    popup.style.top = position.top + "px";
    popup.style.maxHeight = position.maxHeight + "px";
  }
}

function stayRange(stay) {
  const nights = daysBetween(stay.check_in, stay.check_out) + 1;
  const range = stay.check_in === stay.check_out
    ? longDate(stay.check_in)
    : rangeLabel(stay.check_in, stay.check_out);
  return range + " · " + nights + (nights === 1 ? " night" : " nights");
}

function nightsWithoutABed() {
  const stays = (state.trip.lodging || []).map(asStay);
  const bare = state.trip.days.filter((day) => !PLAN.staysOn(day.date, stays).length);
  if (!bare.length || !stays.length) return null;
  return bare.length === 1
    ? "No stay covers " + bare[0].label + "."
    : bare.length + " days have no stay on them.";
}

/** The shape src/lib/plan.ts measures a stay in. */
const asStay = (row) => ({
  id: row.id,
  name: row.name,
  checkIn: row.check_in,
  checkOut: row.check_out,
});

const tripStays = () => (state.trip.lodging || []).map(asStay);

/**
 * Adding or changing a stay.
 *
 * The place half is the trip's own search, because a hotel is a place like
 * any other — but it is not required. Half the places people sleep are a
 * friend's spare room, and PLAN.md section 11 is against making somebody
 * invent a Google listing for one, so a typed name is a first-class answer
 * and only a picked result carries a coordinate.
 */
function openStay(stay) {
  if (wideNow() && !planning()) state.sheetTab = "stays";
  openLayer(() => { state.stayEdit = null; render(); });
  const trip = state.trip.trip;
  state.stayEdit = stay
    ? { id: stay.id, name: stay.name, placeId: stay.google_place_id || null, start: stay.check_in, end: stay.check_out, rows: [], query: "", note: null }
    : { id: null, name: "", placeId: null, start: trip.start_date, end: trip.end_date, rows: [], query: "", note: null };
  render();
  const field = $("stay-name");
  if (field) field.focus();
}

function sheetStay(inline) {
  const draft = state.stayEdit;
  const close = closeLayer;

  const results = h("div", { class: "stay-results" }, []);
  for (const row of draft.rows.slice(0, 4)) {
    results.append(
      h("button", {
        class: "stay-result",
        onclick: () => {
          draft.name = row.name;
          draft.placeId = row.placeId;
          draft.rows = [];
          draft.note = row.meta || null;
          render();
        },
      }, [
        h("span", { class: "stay-result-name", text: row.name }, []),
          h("span", { class: "stay-result-meta", text: row.meta || row.city || row.address || "" }, []),
      ]),
    );
  }

  return [
    ...(inline ? [] : [h("div", { class: "scrim", onclick: close }, [])]),
    h("div", { id: "stay-editor", class: inline ? "inline-search inline-stay" : "sheet modal", style: "height:auto" }, [
      h("div", { class: "grabber", onclick: close }, [h("i", {}, [])]),
      h("div", { class: "modal-head" }, [
        h("div", { class: "modal-title", text: draft.id ? "Change this stay" : "Where are you staying?" }, []),
        h("div", { class: "modal-sub", text: "A hotel, or an address, and the nights it covers" }, []),
      ]),
      h("div", { class: "trip-edit" }, [
        h("div", { class: "underlined stay-search-field", "aria-busy": String(Boolean(draft.busy)) }, [
          h("input", {
            id: "stay-name",
            placeholder: "Hotel, rental or address",
            value: draft.name,
            autocomplete: "off",
            oninput: onStayInput,
          }, []),
        ]),
        h("div", { id: "stay-loading", hidden: !draft.busy }, [searchSkeleton("Searching for accommodations")]),
        results,
        dateFields(draft, null),
        h("div", { class: "note-actions" }, [
          h("button", { class: "save", onclick: saveStay }, ["Save"]),
          h("button", { class: "cancel", onclick: close }, ["Cancel"]),
        ]),
      ]),
    ]),
  ];
}

let stayTimer = null;
let stayTicket = 0;

function onStayInput(event) {
  const draft = state.stayEdit;
  draft.name = event.target.value;
  // Typing over a picked result unpicks it: the coordinate belonged to the
  // name that was there.
  draft.placeId = null;
  const query = draft.name.trim();
  clearTimeout(stayTimer);
  const ticket = ++stayTicket;
  draft.rows = [];
  draft.busy = query.length >= MIN_CHARS;
  const loading = $("stay-loading");
  if (loading) loading.hidden = !draft.busy;
  if (loading) loading.parentElement.setAttribute("aria-busy", String(draft.busy));
  const results = document.querySelector(".stay-results");
  if (results) results.replaceChildren();
  if (query.length < MIN_CHARS) {
    draft.rows = [];
    return;
  }
  stayTimer = setTimeout(async () => {
    try {
      const data = await api(
        "/api/trips/" + state.trip.trip.id + "/place-search?q=" + encodeURIComponent(query),
      );
      if (ticket !== stayTicket || state.stayEdit !== draft) return;
      draft.busy = false;
      state.stayEdit.rows = data.results || [];
      render();
      const field = $("stay-name");
      if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
    } catch (error) {
      if (ticket !== stayTicket || state.stayEdit !== draft) return;
      draft.busy = false;
      if ($("stay-loading")) $("stay-loading").hidden = true;
      state.stayEdit.rows = [];
    }
  }, DEBOUNCE_MS);
}

function saveStay() {
  const draft = state.stayEdit;
  const field = $("stay-name");
  const name = (field ? field.value : draft.name).trim();
  if (!name || !draft.start || !draft.end) {
    state.error = "A stay needs a name and both of its dates";
    render();
    return;
  }

  const body = { name, checkIn: draft.start, checkOut: draft.end };
  body.placeId = draft.placeId || null;
  const editing = draft.id;
  closeLayer();

  optimistic(
    () => {
      const list = state.trip.lodging || (state.trip.lodging = []);
      if (editing) {
        const row = list.find((l) => l.id === editing);
        if (!row) return () => {};
        const was = { name: row.name, check_in: row.check_in, check_out: row.check_out };
        row.name = name;
        row.check_in = draft.start;
        row.check_out = draft.end;
        return () => { Object.assign(row, was); };
      }
      const provisional = {
        id: "pending_stay_" + Date.now(),
        name,
        check_in: draft.start,
        check_out: draft.end,
        note: "",
      };
      list.push(provisional);
      return () => {
        const at = list.indexOf(provisional);
        if (at !== -1) list.splice(at, 1);
      };
    },
    () => post(editing ? "/api/lodging/" + editing : "/api/trips/" + state.trip.trip.id + "/lodging", body),
    "That stay did not save",
  );
}

function removeStay(stay) {
  optimistic(
    () => {
      const list = state.trip.lodging;
      const at = list.findIndex((l) => l.id === stay.id);
      if (at === -1) return () => {};
      const row = list[at];
      list.splice(at, 1);
      return () => { list.splice(at, 0, row); };
    },
    () => post("/api/lodging/" + stay.id + "/delete", {}),
    "That stay did not come off",
  );
}

function emptyDayBody() {
  return h("div", { class: "empty-state" }, [
    h("h3", { text: "Nothing here yet" }, []),
    h("p", { text: "Add somewhere you want to go, or bring in the places you have already saved." }, []),
    h("div", { class: "empty-actions" }, [
      h("button", { class: "primary", onclick: () => openSearch(state.openDayId) }, [
        icon("searchLight"), "Find a place",
      ]),
      h("button", { class: "secondary" }, ["Bring in a My Map"]),
    ]),
  ]);
}

function stopCard(day, stop, showTimes, number) {
  const st = statusOf(day, stop);
  const selected = stop.id === state.selectedStopId;
  const done = st === "done";

  const dragging = state.drag && state.drag.stopId === stop.id;

  const card = h("div", {
    class: "stop order-row" + (selected ? " selected" : "") + (done ? " done" : "")
      + (dragging ? " ghost" : ""),
    "data-stop-id": stop.id,
  }, [
    h("div", { class: "stop-row" }, [
      dragHandle(day, stop),
      h("button", {
        class: "stop-tap",
        onclick: () => {
          // A drag ends on this same element, so a click it produced is not a tap.
          if (suppressTap) { suppressTap = false; return; }
          state.selectedStopId = selected ? null : stop.id;
          state.menuOpen = false;
          render();
        },
      }, [
        /*
         * The same mark as the pin on the map, so a row and a dot can be
         * matched without counting. Outlined rather than filled: the pin is
         * the thing on the map and this is a reference to it, and two solid
         * discs of the same colour on one row would compete.
         */
        day.id === "unplanned" ? null : h("span", {
          class: stop.accommodation ? "stop-index bed" : "stop-index",
          style: "color:" + (stop.accommodation ? PIN.bed : day.hue) +
            ";border-color:" + (stop.accommodation ? PIN.bed : day.hue),
          html: stop.accommodation ? ICONS.houseHue : null,
          text: stop.accommodation ? null : String(number),
        }, []),
        showTimes
          ? h("span", {
              class: "stop-time",
              style: "color:" + day.hue,
              text: stop.time,
            }, [])
          : null,
        h("div", { class: "stop-text" }, [
          h("span", { class: "stop-name", text: stop.title }, []),
          h("span", { class: "stop-meta", text: stop.description }, []),
        ]),
        h("span", {
          class: "stop-author",
          style: "background:" + stop.authorColor,
          text: stop.author,
          title: stop.author + " added this",
        }, []),
      ]),
    ]),
  ]);

  if (selected && !dragging) card.append(stopActions(stop, done, showTimes));
  return card;
}

/* ------------------------------------------------------------- dragging */

/**
 * Dragging a stop, PLAN.md section 4e, drawn by design/SheetFull.dc.html.
 *
 * The row leaves a dashed ghost in the slot it came from, a lifted card
 * follows the finger, and a green thread shows where it would land and what
 * the walk there costs. Dropping on a collapsed day header moves it to that
 * day. All of it writes one op: a day, and an order key between the two rows
 * it landed between.
 */

/** Set when a drag ends, so the click it produces is not read as a tap. */
let suppressTap = false;

function dragHandle(day, stop) {
  const el = h("button", { class: "grip", title: "Drag to reorder", html: ICONS.grip }, []);

  el.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    // The row underneath is a tap target; grabbing the handle is not a tap.
    event.stopPropagation();

    const row = el.closest(".order-row");
    const rect = row ? row.getBoundingClientRect() : null;

    // Picking something up in the drawer means putting it down on the day,
    // and the day is underneath the drawer. Get out of the way.
    if (state.trayOpen && el.closest(".tray-side")) state.trayOpen = false;

    state.drag = {
      stopId: stop.id,
      fromDayId: day.id,
      title: stop.title,
      description: stop.description,
      y: event.clientY,
      x: event.clientX,
      /*
       * Where the card was grabbed, and how wide it was.
       *
       * The lifted card used to be pinned to the frame with left: 9 and
       * right: 9, which is a phone-shaped assumption: in the Planner at a desk
       * the frame is up to 1440 wide and the card came up the width of the
       * window. It follows the finger at the size it was picked up at now.
       */
      width: null,
      grabX: 0,
      /*
       * Off every drop zone — over the day rail, or past the tray.
       *
       * Without this the drag kept whatever day it was last over and the drop
       * committed to it, which is a move nobody asked for. Letting go out
       * there puts the card back instead.
       */
      outside: false,
      targetDayId: day.id,
      afterStopId: undefined,
      gridTime: undefined,
      gridY: null,
      hoverDayId: null,
      hoverStart: 0,
      moved: false,
    };
    if (rect) {
      state.drag.width = rect.width;
      state.drag.grabX = event.clientX - rect.left;
    }

    // The listeners go on the window, not on this button, and deliberately so:
    // starting a drag re-renders, which replaces this element and would throw
    // away a pointer capture held on it. Nothing would move and nothing would
    // drop. The window survives every render.
    const move = (e) => {
      if (!state.drag) return;
      state.drag.moved = true;
      state.drag.y = e.clientY;
      state.drag.x = e.clientX;
      resolveDropTarget(e.clientX, e.clientY);
      paintDrag();
    };

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!state.drag) return;
      endHover();

      const drag = state.drag;
      state.drag = null;
      suppressTap = drag.moved;
      // Let go over the day rail or off the end of the tray and the card goes
      // back where it came from. A drop has to land on something.
      if (drag.moved && !drag.outside) commitDrag(drag);
      else render();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    render();
  });

  return el;
}

/**
 * Where the finger is over. A collapsed day header takes the whole stop; over
 * the open day, the row it would follow is whichever midpoint it has passed.
 */
/**
 * Holding a dragged card against the right edge slides the drawer out.
 *
 * The shut drawer is a drop target you cannot see into. Rather than posting
 * the card through a slot, hold it there and the drawer opens so it can go
 * among the others. The pause is the same idea as the one on a collapsed day
 * in the sheet: a finger crossing the edge on its way to the last column of
 * the grid must not drag the drawer out from under it.
 */
const DRAWER_EDGE = 28;
const DRAWER_DWELL = 350;
let drawerReach = 0;

function reachForDrawer(x) {
  const dock = document.querySelector(".tray-dock");
  if (!dock || state.trayOpen) { drawerReach = 0; return; }

  const frame = $("frame");
  const right = frame ? frame.getBoundingClientRect().right : window.innerWidth;
  if (x < right - DRAWER_EDGE) { drawerReach = 0; return; }

  const now = performance.now();
  if (!drawerReach) { drawerReach = now; return; }
  if (now - drawerReach < DRAWER_DWELL) return;

  drawerReach = 0;
  toggleTray(true);
  // The drag is live, so this cannot go through render(): that would replace
  // the handle and the card in the air. The class is the whole of the change.
  dock.classList.add("open");
  const panel = $("tray-drawer");
  if (panel) panel.classList.add("open");
}

function resolveDropTarget(x, y) {
  const drag = state.drag;
  if (planning() && !wideNow()) {
    const pill = [...document.querySelectorAll(".rail-pill[data-day-id]")].find((pill) => {
      const rect = pill.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
    if (pill) {
      drag.outside = true;
      if (pill.dataset.dayId !== state.planDayId) beginHover(pill.dataset.dayId);
      else endHover();
      return;
    }
  }

  /*
   * The drawer is over the calendar, so it is asked first.
   *
   * The zones were tested in DOM order and the day column comes first and
   * spans nearly the whole width — including the strip the open drawer is
   * sitting on. So a card dragged into To be planned resolved as a drop on the
   * column underneath it, and there was no way to put anything back. Anything
   * inside the dock is an overlay and is tested ahead of what it covers.
   */
  const all = [...document.querySelectorAll(".drop-zone[data-day-id]")];
  const overlay = all.filter((el) => el.closest(".tray-dock"));
  const wraps = overlay.length ? overlay.concat(all.filter((el) => !overlay.includes(el))) : all;

  drag.outside = false;
  reachForDrawer(x);

  /*
   * Both axes, always.
   *
   * This used to check y alone unless the zone was a grid column, on the
   * reasoning that a sheet stacks its days so the horizontal says nothing.
   * True of a sheet, and false of everything else: the shut drawer is parked
   * off the right edge at full height, so on y alone it matched every drop and
   * swallowed the lot, and on the desk a card dragged over the map was landing
   * on whichever rail day happened to share its y. Where a zone really is full
   * width the extra check costs nothing.
   */
  let hit = null;
  for (const wrap of wraps) {
    const rect = wrap.getBoundingClientRect();
    if (y < rect.top || y > rect.bottom) continue;
    if (x < rect.left || x > rect.right) continue;
    hit = wrap;
    break;
  }
  if (!hit) { drag.outside = true; endHover(); return; }

  if (hit.dataset.grid) {
    endHover();
    resolveGridDrop(hit, y - hit.getBoundingClientRect().top);
    return;
  }
  drag.gridTime = undefined;
  drag.gridY = null;

  const id = hit.dataset.dayId === "unplanned" ? null : hit.dataset.dayId;
  drag.targetDayId = id;

  const rows = [...hit.querySelectorAll(".order-row[data-stop-id]")]
    .filter((row) => row.dataset.stopId !== drag.stopId);

  if (rows.length) {
    // An open day: the row it would follow is whichever midpoint it has passed.
    let after = null;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (y > rect.top + rect.height / 2) after = row.dataset.stopId;
    }
    drag.afterStopId = after;
    endHover();
    return;
  }

  // A day with nothing showing. Dropping here puts the stop at the end, but
  // holding still springs the day open so it can go between its stops instead.
  drag.afterStopId = undefined;
  if (!hit.classList.contains("open") && hit.dataset.dayId !== drag.fromDayId) {
    beginHover(hit.dataset.dayId);
  } else {
    endHover();
  }
}

/* --- spring-loaded opening ------------------------------------------------
 *
 * Hold a dragged stop over a collapsed day and it opens, so the stop can be
 * placed between its items rather than only tacked on the end. Nothing moves
 * for the first half second, because a finger passing over a day on its way
 * somewhere else should not disturb it. After that a skeleton grows under the
 * header and the card in the air shrinks, and when the skeleton is full the
 * day really opens. The growing is the progress: there is no separate spinner
 * saying "keep holding".
 */
const HOVER_QUIET_MS = 500;
const HOVER_GROW_MS = 1000;

let hoverFrame = null;

function beginHover(dayId) {
  const drag = state.drag;
  if (drag.hoverDayId === dayId) return;
  endHover();
  drag.hoverDayId = dayId;
  drag.hoverStart = performance.now();
  hoverFrame = requestAnimationFrame(hoverTick);
}

function endHover() {
  const drag = state.drag;
  if (hoverFrame) { cancelAnimationFrame(hoverFrame); hoverFrame = null; }
  const skeleton = $("day-skeleton");
  if (skeleton) skeleton.remove();
  for (const pill of document.querySelectorAll(".rail-pill.hovering")) { pill.classList.remove("hovering"); pill.style.removeProperty("--hover-progress"); }
  if (drag) { drag.hoverDayId = null; drag.hoverStart = 0; }
  shrinkLifted(0);
}

function hoverTick() {
  const drag = state.drag;
  if (!drag || !drag.hoverDayId) { endHover(); return; }

  const elapsed = performance.now() - drag.hoverStart;
  if (planning() && !wideNow()) {
    const pill = [...document.querySelectorAll(".rail-pill[data-day-id]")].find((pill) => pill.dataset.dayId === drag.hoverDayId);
    if (pill) { pill.classList.add("hovering"); pill.style.setProperty("--hover-progress", Math.min(100, elapsed / 10) + "%"); }
    if (elapsed >= 1000) { openHoveredDay(drag.hoverDayId); return; }
    hoverFrame = requestAnimationFrame(hoverTick);
    return;
  }
  const progress = Math.min(1, Math.max(0, (elapsed - HOVER_QUIET_MS) / HOVER_GROW_MS));
  paintHover(drag.hoverDayId, progress);

  if (progress >= 1) { openHoveredDay(drag.hoverDayId); return; }
  hoverFrame = requestAnimationFrame(hoverTick);
}

/** How many skeleton rows a day deserves: as many stops as it has, up to three. */
function skeletonRows(dayId) {
  const day = state.trip.days.find((d) => d.id === dayId);
  const count = day ? day.stops.length : state.trip.unplanned.length;
  return Math.min(3, Math.max(1, count));
}

function paintHover(dayId, progress) {
  const wrap = document.querySelector('.day-wrap[data-day-id="' + dayId + '"]');
  if (!wrap) return;

  let skeleton = $("day-skeleton");
  if (!skeleton || skeleton.parentElement !== wrap) {
    if (skeleton) skeleton.remove();
    skeleton = h("div", { class: "day-skeleton", id: "day-skeleton" }, []);
    const rows = skeletonRows(dayId);
    for (let i = 0; i < rows; i++) skeleton.append(h("div", { class: "skel-row" }, []));
    skeleton.append(h("div", { style: "height:8px" }, []));
    wrap.append(skeleton);
    skeleton.dataset.full = String(rows * 45 + 8);
  }
  skeleton.style.height = Math.round(Number(skeleton.dataset.full) * progress) + "px";
  shrinkLifted(progress);
}

/** The card goes into the list, so it gets smaller as it is held over one. */
function shrinkLifted(progress) {
  const card = $("lifted");
  if (!card) return;
  const scale = 1.015 - 0.1 * progress;
  const tilt = -1.1 + 0.7 * progress;
  card.style.transform = "rotate(" + tilt.toFixed(2) + "deg) scale(" + scale.toFixed(3) + ")";
}

function openHoveredDay(dayId) {
  endHover();
  state.openDayId = dayId === "unplanned" ? "unplanned" : dayId;
  if (planning()) { state.planDayId = dayId; state.trayOpen = false; }
  render();
  // The day has real rows now, so work out which two it would land between.
  if (state.drag) { resolveDropTarget(state.drag.x, state.drag.y); paintDrag(); }
}

/**
 * Moves the lifted card and the thread without a full render, so the card
 * keeps up with the finger.
 */
function paintDrag() {
  const drag = state.drag;
  const frame = $("frame");
  const card = $("lifted");
  if (!drag || !frame || !card) return;

  const box = frame.getBoundingClientRect();
  card.style.top = drag.y - box.top - 23 + "px";

  if (drag.width) {
    // The size it was picked up at, held under the point it was picked up by.
    // Clamped to the frame so a card grabbed at its right edge cannot be
    // dragged off the left of the screen.
    const left = Math.max(9, Math.min(box.width - drag.width - 9, drag.x - box.left - drag.grabX));
    card.style.left = left + "px";
    card.style.right = "auto";
    card.style.width = drag.width + "px";
  } else {
    card.style.left = "";
    card.style.right = "";
    card.style.width = "";
  }

  // Two different things can be happening: placing the stop between two rows
  // of a list that is showing, or dropping it on a day that is not. Which one
  // is decided by whether a neighbour has been worked out, not by whether the
  // day is the one it started on — after a day springs open, the stop is being
  // ordered inside a day it did not come from.
  const onGrid = drag.gridTime !== undefined;
  const ordering = !onGrid && drag.afterStopId !== undefined;
  const landingOnADay = !onGrid && !ordering && drag.targetDayId !== drag.fromDayId;

  const bar = $("grid-drop");
  if (bar) {
    if (onGrid) paintGridDrop();
    else bar.hidden = true;
  }

  for (const head of document.querySelectorAll(".day-head")) {
    const id = head.dataset.dayId === "unplanned" ? null : head.dataset.dayId;
    const marked = landingOnADay && id === drag.targetDayId;
    head.classList.toggle("droppable", marked);
    const tag = head.querySelector(".drop-here");
    if (tag) tag.hidden = !marked;
  }

  const line = $("drop-line");
  if (line) {
    line.hidden = !ordering;
    if (ordering) placeDropLine(line);
  }
}

/** Puts the thread under the row the stop would follow, and labels the walk. */
function placeDropLine(line) {
  const drag = state.drag;
  const rows = [...document.querySelectorAll(".order-row[data-stop-id]")];
  const after = drag.afterStopId
    ? rows.find((r) => r.dataset.stopId === drag.afterStopId)
    : null;

  const body = after ? after.parentElement : (rows[0] || {}).parentElement;
  if (!body) return;
  if (after) after.after(line);
  else body.prepend(line);

  const when = line.querySelector(".when");
  if (when) {
    // The artboard writes "13:00 &middot; 6 min walk". Nothing here has a time, so the
    // label is the walk alone rather than a made-up clock.
    const previous = after ? findStop(after.dataset.stopId) : null;
    const moving = findStop(drag.stopId);
    when.textContent = walkLabel(previous, moving);
  }
}

/** Straight-line walking minutes, the same 80 m a minute the server uses. */
function walkLabel(from, to) {
  if (!from || !to || !from.location || !to.location) return "first stop";
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(to.location.lat - from.location.lat);
  const dLng = rad(to.location.lng - from.location.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.location.lat)) * Math.cos(rad(to.location.lat)) * Math.sin(dLng / 2) ** 2;
  const metres = 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 1.3;
  const minutes = Math.max(1, Math.round(metres / 80));
  // Past 45 minutes it is not a walk, so the thread gives the distance
  // instead of a walking time nobody would act on. Same threshold the derived
  // line uses, so the two never say different things about one gap.
  if (minutes > 45) {
    return metres < 10000
      ? (metres / 1000).toFixed(1) + " km away"
      : Math.round(metres / 1000) + " km away";
  }
  return minutes + " min walk";
}

/** The lifted card, and the thread it will drop on to. */
function dragLayer() {
  const drag = state.drag;
  if (!drag) return [];

  return [
    h("div", { class: "drop-line", id: "drop-line", hidden: true }, [
      h("span", { class: "dot" }, []),
      h("span", { class: "thread" }, []),
      h("span", { class: "when" }, []),
    ]),
    h("div", { class: "grid-drop", id: "grid-drop", hidden: true }, [h("span", {}, [])]),
    h("div", { class: "lifted", id: "lifted", style: "top:0" }, [
      h("span", { style: "display:flex", html: ICONS.gripDark }, []),
      h("div", { class: "stop-text" }, [
        h("span", { class: "stop-name", text: drag.title }, []),
        h("span", { class: "stop-meta", text: drag.description }, []),
      ]),
    ]),
  ];
}

/** One op: the day it landed on, and a key between the rows either side. */
function commitDrag(drag) {
  const onGrid = drag.gridTime !== undefined;
  const unchanged = drag.targetDayId === drag.fromDayId
    && drag.afterStopId === undefined
    && !onGrid;
  if (unchanged) { render(); return; }

  optimistic(
    () => {
      const at = locateStop(drag.stopId);
      if (!at) return () => {};
      at.list.splice(at.index, 1);

      const target = drag.targetDayId === null
        ? state.trip.unplanned
        : (state.trip.days.find((d) => d.id === drag.targetDayId) || {}).stops;
      if (!target) { at.list.splice(at.index, 0, at.stop); return () => {}; }

      const index = drag.afterStopId === undefined || drag.afterStopId === null
        ? (drag.afterStopId === undefined ? target.length : 0)
        : target.findIndex((s) => s.id === drag.afterStopId) + 1;
      target.splice(index, 0, at.stop);

      const wasTime = at.stop.time;
      if (onGrid) at.stop.time = drag.gridTime;
      if (drag.targetDayId !== null) {
        state.openDayId = drag.targetDayId;
        if (planning()) state.planDayId = drag.targetDayId;
      }
      return () => {
        at.stop.time = wasTime;
        const back = target.indexOf(at.stop);
        if (back !== -1) target.splice(back, 1);
        at.list.splice(at.index, 0, at.stop);
      };
    },
    () => post("/api/stops/" + drag.stopId + "/move", Object.assign(
      drag.afterStopId === undefined
        ? { dayId: drag.targetDayId }
        : { dayId: drag.targetDayId, afterStopId: drag.afterStopId },
      onGrid ? { startTime: drag.gridTime } : {},
    )),
    "That did not move",
  );
}

function stopActions(stop, done, showTimes) {
  const wrap = h("div", {
    class: "stop-actions",
    style: showTimes ? "" : "padding-left:36px",
  }, []);

  if (stop.note) {
    wrap.append(
      h("div", { class: "stop-note" }, [h("i", {}, []), h("span", { text: stop.note }, [])]),
    );
  }

  wrap.append(
    h("div", { class: "action-row" }, [
      // A stop with no place has nowhere to navigate to, and a button that
      // goes nowhere is the placeholder this app does not do.
      stop.navigateUrl
        ? h("a", {
            class: "action dark",
            href: stop.navigateUrl,
            target: "_blank",
            rel: "noreferrer",
          }, [icon("navigateLight"), "Navigate"])
        : null,
      h("button", {
        class: done ? "action on" : "action",
        onclick: () => toggleVisited(stop, done),
      }, [h("span", { style: "display:flex", html: done ? ICONS.checkOn : ICONS.check }, []), "Visited"]),
      h("button", {
        class: "action",
        onclick: () => editNote(stop),
      }, [icon("pencil"), stop.note ? "Edit note" : "Add note"]),
      h("button", { class: "action kebab", onclick: () => { state.menuOpen = !state.menuOpen; render(); } }, [
        h("span", { style: "display:flex", html: ICONS.kebab }, []),
      ]),
    ]),
  );

  if (state.menuOpen) {
    wrap.append(
      h("div", {
        style: "position:absolute;right:7px;bottom:34px;width:180px;border-radius:11px;background:#FFFCF6;" +
          "border:1px solid #E4D9C5;box-shadow:0 6px 20px rgba(84,68,44,0.20);overflow:hidden;z-index:10",
      }, [
        h("div", {
          style: "display:flex;align-items:center;gap:9px;height:40px;padding:0 12px;cursor:pointer",
          onclick: () => { state.menuOpen = false; openMove(stop.id); },
        }, [
          icon("calendar"), h("span", { style: "font-size:13px;font-weight:500", text: "Move to date" }, []),
        ]),
        h("div", {
          style: "display:flex;align-items:center;gap:9px;height:40px;padding:0 12px;border-top:1px solid #F1E9DA;cursor:pointer",
          onclick: () => { state.menuOpen = false; removeStop(stop); },
        }, [
          icon("trash"),
          h("span", { style: "font-size:13px;font-weight:500;color:#A06B52", text: "Remove from list" }, []),
        ]),
      ]),
    );
  }

  return wrap;
}

function editNote(stop) {
  // The note is typed by a person and nothing ever generates one (section 4c).
  openLayer(() => { state.noteFor = null; render(); });
  state.noteFor = { id: stop.id, name: stop.title, note: stop.note || "" };
  render();
  const field = $("note");
  if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
}

/**
 * The note editor.
 *
 * No artboard draws it: AddNote.dc.html is Main.dc.html with a stop that has
 * no note selected, so all it specifies is the button reading "Add note"
 * rather than "Edit note". This is written in the system's own language — the
 * same sheet, the same underlined-field treatment as the trip name — rather
 * than copied from anywhere.
 */
function sheetNote() {
  const target = state.noteFor;
  const close = closeLayer;

  return [
    h("div", { class: "scrim", onclick: close }, []),
    h("div", { class: "sheet modal", id: "note-sheet", style: "height:auto" }, [
      dismissGrabber("note-sheet", close),
      h("div", { class: "modal-head" }, [
        h("div", { class: "modal-title", text: target.note ? "Edit note" : "Add a note" }, []),
        h("div", { class: "modal-sub", text: target.name }, []),
      ]),
      h("div", { class: "note-editor" }, [
        h("textarea", {
          id: "note",
          placeholder: "Booked 13:15, they release the table if you are late",
          text: target.note,
        }, []),
        h("div", { class: "note-actions" }, [
          h("button", { class: "save", onclick: saveNote }, ["Save"]),
          h("button", { class: "cancel", onclick: close }, ["Cancel"]),
        ]),
      ]),
    ]),
  ];
}

/**
 * Saves the note optimistically: the sheet closes and the card shows the new
 * text straight away, and the write goes out behind it. On hotel wifi the
 * round trip is the slowest part of typing six words, and PLAN.md section 2
 * makes writing-then-reconciling the shape of every edit.
 *
 * If the write fails the card goes back to what it said before and the reason
 * is shown, rather than leaving a note on screen that is not saved anywhere.
 */
function saveNote() {
  const target = state.noteFor;
  const field = $("note");
  const next = field ? field.value.trim() : "";

  const stop = findStop(target.id);
  const previous = stop ? stop.note : "";
  if (stop) stop.note = next;

  closeLayer();

  post("/api/stops/" + target.id + "/note", { note: next }).catch((error) => {
    const current = findStop(target.id);
    if (current) current.note = previous;
    state.error = "That note did not save: " + error.message;
    render();
  });
}

/** The stop as the current trip view holds it, day or unplanned. */
/** Ticking a stop off, from the phone's row or the desk's panel. */
function toggleVisited(stop, done) {
  optimistic(
    () => {
      const target = findStop(stop.id);
      const previous = target ? target.status : null;
      if (target) target.status = done ? "planned" : "visited";
      return () => { if (target && previous !== null) target.status = previous; };
    },
    () => post("/api/stops/" + stop.id + "/visited", { visited: !done }),
    done ? "That did not un-tick" : "That did not tick off",
  );
}

function findStop(stopId) {
  if (!state.trip) return null;
  for (const day of state.trip.days) {
    const hit = day.stops.find((s) => s.id === stopId);
    if (hit) return hit;
  }
  return state.trip.unplanned.find((s) => s.id === stopId) || null;
}

/** The list a stop sits in, and where in it, so a failed write can put it back. */
function locateStop(stopId) {
  if (!state.trip) return null;
  const lists = state.trip.days.map((d) => d.stops).concat([state.trip.unplanned]);
  for (const list of lists) {
    const index = list.findIndex((s) => s.id === stopId);
    if (index !== -1) return { list, index, stop: list[index] };
  }
  return null;
}

/**
 * Applies an edit to the screen, sends it, and puts the screen back if the
 * send fails. Every edit in the app goes through here.
 *
 * apply() changes local state and returns a function that undoes it. On
 * success the trip is re-read quietly, because the server owns the derived
 * lines — removing a stop changes the walking time on the one after it, and
 * that cannot be recomputed here.
 */
function optimistic(apply, request, whatFailed) {
  const undo = apply();
  render();

  request()
    .then(() => refreshTrip())
    .catch((error) => {
      undo();
      state.error = whatFailed + ": " + error.message;
      render();
    });
}

/* ------------------------------------------------------------- trip menu */

/**
 * The one dropdown in the app, hanging off the trip name (PLAN.md section 4h),
 * drawn by design/TripMenu.dc.html.
 *
 * Its two view items really switch: Map view is design/Main.dc.html, Plan view
 * is the day grid of design/Planner*.dc.html, and the tick follows whichever
 * one is showing.
 */
function tripMenu() {
  const close = closeLayer;
  const item = (iconName, label, opts) =>
    h("button", {
      class: opts && opts.on ? "on" : "",
      onclick: opts && opts.onclick ? opts.onclick : close,
      disabled: opts && opts.disabled,
      title: opts && opts.title,
      style: opts && opts.disabled ? "opacity:0.45" : "",
    }, [
      icon(iconName),
      h("span", { class: "label", text: label }, []),
      opts && opts.on ? icon("checkGreen") : null,
    ]);

  return [
    h("div", { class: "scrim light", onclick: close }, []),
    h("div", { class: "trip-menu" }, [
      wideNow() ? null : item("pinInk", "Map view", {
        on: state.view === "map",
        // This menu, and the Plan view under it if it is showing. The Plan
        // layer's own close is what puts the map back.
        onclick: () => state.view === "plan" ? closeThen(1, leavePlan) : closeLayer(),
      }),
      wideNow() ? null : item("grid", "Plan view", {
        on: state.view === "plan",
        // Close the menu, and open the Plan view once that has landed rather
        // than on top of a traversal that is still on its way.
        onclick: () => (state.view === "plan" ? closeLayer() : closeThen(1, showPlan)),
      }),
      wideNow() ? null : h("div", { class: "rule" }, []),
      // PLAN.md section 4d's "changing the dates later", which was written
      // and unbuilt: there was no way to rename a trip or move its dates.
      item("pencilInk", "Change trip", {
        onclick: () => closeThen(1, openTripEdit),
      }),
      item("arrowLeft", "Back to trips", {
        // The menu and the trip, in one traversal, clamped to what we pushed.
        // showTrips is the trip layer's own close, so it re-reads the list.
        onclick: goTrips,
      }),
    ]),
  ];
}

/* --------------------------------------------------------- changing a trip */

/**
 * Renaming a trip and moving its dates, PLAN.md section 4d.
 *
 * No artboard draws it — NewTrip.dc.html is the only screen that asks for a
 * name and a range — so this is that screen's two questions in the modal
 * sheet the note and time editors already use, with the same date fields the
 * new trip screen now has.
 */
function openTripEdit() {
  const trip = state.trip.trip;
  openLayer(() => { state.tripEdit = null; render(); });
  state.tripEdit = { name: trip.name, start: trip.start_date, end: trip.end_date };
  render();
  const field = $("trip-edit-name");
  if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
}

function sheetTripEdit() {
  const draft = state.tripEdit;
  const close = closeLayer;
  const days = draft.start && draft.end ? daysBetween(draft.start, draft.end) + 1 : 0;

  return [
    h("div", { class: "scrim", onclick: close }, []),
    h("div", { class: "sheet modal", id: "trip-details-editor", style: "height:auto" }, [
      h("div", { class: "grabber", onclick: close }, [h("i", {}, [])]),
      h("div", { class: "modal-head" }, [
        h("div", { class: "modal-title", text: "Change Trip Details" }, []),
      ]),
      h("div", { class: "trip-edit" }, [
        h("div", { class: "underlined" }, [
          h("input", {
            id: "trip-edit-name",
            placeholder: "Give the trip a name",
            value: draft.name,
            autocomplete: "off",
            oninput: (e) => { draft.name = e.target.value; },
          }, []),
        ]),
        dateFields(draft, null),
        h("div", { class: "trip-edit-note" }, [
          h("span", {
            text: days
              ? days + (days === 1 ? " day" : " days") + ". Anything on a day you drop goes back to To be planned."
              : "Pick both ends of the trip.",
          }, []),
        ]),
        h("div", { class: "note-actions" }, [
          h("button", { class: "save", onclick: saveTripEdit }, ["Save"]),
          h("button", { class: "cancel", onclick: close }, ["Cancel"]),
        ]),
      ]),
    ]),
  ];
}

/**
 * The name is applied to the screen at once, the way every other edit is. The
 * dates are not: changing them adds and removes whole days, and the days are
 * the server's to work out, so the sheet closes and the re-read brings them
 * back. On failure the name goes back to what it was.
 */
function saveTripEdit() {
  const draft = state.tripEdit;
  const field = $("trip-edit-name");
  const name = (field ? field.value : draft.name).trim();
  if (!name || !draft.start || !draft.end) {
    state.error = "A trip needs a name and both of its dates";
    render();
    return;
  }

  const trip = state.trip.trip;
  const was = trip.name;
  closeLayer();
  trip.name = name;
  render();

  post("/api/trips/" + trip.id, { name, startDate: draft.start, endDate: draft.end })
    .then(() => refreshTrip())
    .catch((error) => {
      trip.name = was;
      state.error = "That did not save: " + error.message;
      render();
    });
}

/* ------------------------------------------------------- naming a day */

/**
 * The pencil on a day header.
 *
 * A day has always had a colour off the ramp and a label column in the
 * schema that nothing wrote to. Both are now a person's: the panel names the day and offers the
 * eight palette colours, white, and whatever else somebody wants. It hangs
 * under the header it belongs to rather than floating as a menu, so it is
 * obvious which day is being changed.
 */
function dayEditButton(day) {
  return h("button", {
    class: "day-pencil" + (state.dayEdit === day.id ? " on" : ""),
    title: "Name this day, or change its colour",
    "aria-label": "Edit " + day.label,
    "aria-pressed": state.dayEdit === day.id ? "true" : "false",
    onclick: (event) => { event.stopPropagation(); toggleDayEdit(day.id); },
  }, [icon("pencilDay")]);
}

function toggleDayEdit(dayId) {
  state.stayPopover = null;
  state.stayMenu = null;
  state.stayNote = null;
  state.selectedStayId = null;
  if (state.dayEdit === dayId) { state.dayEdit = null; render(); return; }
  state.dayEdit = dayId;
  // What the day was called when the panel opened, so a write that fails has
  // somewhere to put the field back to. Taken here rather than in the input
  // handler, where by the time it runs the new text is already in.
  const day = dayById(dayId);
  dayNameBefore = day ? (day.name || "") : "";
  render();
  const field = $("day-name");
  if (field) field.focus();
}

function dayEditPanel(day) {
  const swatches = h("div", { class: "swatches" }, (window.__DAY_SWATCHES__ || []).map((hex) =>
    h("button", {
      class: "swatch" + (sameHex(hex, day.hue) ? " on" : "") + (isPale(hex) ? " pale" : ""),
      style: "background:" + hex,
      title: hex,
      // A swatch never takes the focus. Without this the button steals it from
      // the name field mid-word, and the caret comes back at the start.
      onmousedown: (e) => e.preventDefault(),
      onclick: () => setDayHue(day, hex),
    }, [sameHex(hex, day.hue) ? h("span", { style: "display:flex", html: isPale(hex) ? ICONS.checkSwatchInk : ICONS.checkSwatch }, []) : null])));

  // Anything at all, for a day that wants a colour the eight do not hold.
  swatches.append(
    h("label", { class: "swatch custom", title: "Any other colour" }, [
      h("input", {
        type: "color",
        value: day.hue,
        oninput: (e) => setDayHue(day, e.target.value),
      }, []),
    ]),
  );

  return h("div", { class: "day-edit-panel" }, [
    h("div", { class: "day-edit-row" }, [
      h("input", {
        id: "day-name",
        class: "day-name-field",
        placeholder: "Name the day",
        value: day.name || "",
        autocomplete: "off",
        maxlength: "60",
        oninput: (e) => queueDayName(day, e.target.value),
        onkeydown: (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finishDayEdit(day); } },
      }, []),
      h("button", {
        class: "day-edit-done",
        onclick: () => finishDayEdit(day),
        text: "Done",
      }, []),
    ]),
    swatches,
  ]);
}

const sameHex = (a, b) => String(a || "").toUpperCase() === String(b || "").toUpperCase();
/** A swatch too light to carry a cream tick, which is white and near it. */
function isPale(hex) {
  const n = String(hex).replace("#", "");
  if (n.length !== 6) return false;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 186;
}

function setDayHue(day, hex) {
  const was = day.hue;
  day.hue = hex;
  // The render replaces the name field beside the swatches, so a colour
  // picked half way through typing a name must not take the caret with it.
  const typing = document.activeElement && document.activeElement.id === "day-name";
  const at = typing ? document.activeElement.selectionStart : 0;
  render();
  if (typing) {
    const field = $("day-name");
    if (field) { field.focus(); field.setSelectionRange(at, at); }
  }

  post("/api/days/" + day.id, { hue: hex }).catch((error) => {
    day.hue = was;
    state.error = "That colour did not save: " + error.message;
    render();
  });
}

/**
 * The name is written as it is typed, so nothing has to be confirmed — but not
 * on every keystroke: the field keeps what it says, and the write follows a
 * breath later. A failed one says so and puts the field back.
 */
let dayNameTimer = null;
let dayNameBefore = "";

function finishDayEdit(day) {
  clearTimeout(dayNameTimer);
  const name = day.name || "";
  const was = dayNameBefore;
  state.dayEdit = null;
  render();
  post("/api/days/" + day.id, { name }).catch((error) => {
    day.name = was;
    state.error = "That name did not save: " + error.message;
    render();
  });
}

function queueDayName(day, value) {
  // The field keeps what was typed; only the model behind it is updated, so
  // no render is needed and the caret never moves.
  day.name = value;
  clearTimeout(dayNameTimer);
  const was = dayNameBefore;
  dayNameTimer = setTimeout(() => {
    // No re-read on success: the server derives nothing from a day's name, and
    // a render landing mid-word would take the caret with it.
    post("/api/days/" + day.id, { name: value }).catch((error) => {
      day.name = was;
      state.error = "That name did not save: " + error.message;
      render();
    });
  }, 500);
}

/* ----------------------------------------------------------- move to day */

async function openMove(stopId) {
  openLayer(() => { state.move = null; state.preview = null; render(); });
  state.move = await api("/api/stops/" + stopId + "/move-options");
  state.preview = null;
  render();
}

/**
 * design/MoveToDay.dc.html. Every sentence on this sheet is computed on the
 * server (PLAN.md section 8), so nothing here reasons about distance.
 */
function sheetMove() {
  const move = state.move;
  const close = closeLayer;

  const list = h("div", { class: "pick-list" }, move.rest.map(pickRow));

  return [
    h("div", { class: "scrim", onclick: close }, []),
    h("div", { class: "sheet modal", id: "move-sheet", style: "max-height:92%" }, [
      dismissGrabber("move-sheet", close),
      h("div", { class: "modal-head" }, [
        h("div", { class: "modal-title", text: "Move to another date" }, []),
        h("div", { class: "modal-sub", text: move.stop.name + " · currently " + move.stop.currently }, []),
      ]),
      move.best ? bestCard(move.best) : null,
      h("div", { class: "pick-label", text: move.best ? "OR PICK A DAY" : "PICK A DAY" }, []),
      list,
    ]),
  ];
}

function bestCard(best) {
  const previewing = state.preview === best.dayId;
  return h("div", { class: "best" }, [
    h("div", { class: "best-tag" }, [icon("star"), h("span", { text: "BEST FIT" }, [])]),
    h("div", { class: "best-day" }, [
      h("span", { class: "dot", style: "background:" + best.hue }, []),
      h("span", { class: "label", text: best.label.split(" · ")[0] }, []),
      h("span", { class: "shape", text: best.shape }, []),
    ]),
    // The neighbours are named in bold, as the artboard writes them.
    h("div", { class: "best-detail", html: emphasise(best) }, []),
    h("div", { class: "best-actions" }, [
      h("button", { class: "go", onclick: () => moveTo(best.dayId) }, ["Move here"]),
      h("button", {
        class: "preview",
        "aria-pressed": previewing ? "true" : "false",
        onclick: () => {
          // Shows the day it would land on, on the map behind, without
          // committing anything.
          state.preview = previewing ? null : best.dayId;
          if (state.preview) state.openDayId = state.preview;
          render();
        },
      }, [previewing ? "Hide" : "Preview"]),
    ]),
  ]);
}

/** Bolds the two stop names inside the sentence the server built. */
function emphasise(best) {
  const escape = (text) => text.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);
  let html = escape(best.detail || "");
  for (const name of [best.after, best.before]) {
    if (!name) continue;
    html = html.replace(escape(name), "<strong>" + escape(name) + "</strong>");
  }
  return html;
}

function pickRow(candidate) {
  const choosable = candidate.kind !== "past" && candidate.kind !== "current";
  return h("button", {
    class: "pick " + candidate.kind,
    disabled: !choosable,
    onclick: choosable ? () => moveTo(candidate.dayId) : null,
  }, [
    h("span", { class: "dot", style: "background:" + candidate.hue }, []),
    h("div", { class: "pick-text" }, [
      h("span", { class: "pick-name", text: candidate.label }, []),
      h("span", { class: "pick-why", text: candidate.reason }, []),
    ]),
    choosable ? icon("chevronRight") : null,
  ]);
}

function moveTo(dayId) {
  const stopId = state.move.stop.id;
  state.selectedStopId = null;
  closeLayer();

  optimistic(
    () => {
      const at = locateStop(stopId);
      if (!at) return () => {};
      at.list.splice(at.index, 1);

      const target = dayId === null
        ? state.trip.unplanned
        : (state.trip.days.find((d) => d.id === dayId) || {}).stops;
      if (!target) { at.list.splice(at.index, 0, at.stop); return () => {}; }

      // The sheet offers the end of a day, which is what the endpoint does
      // when it is not told a neighbour.
      target.push(at.stop);
      if (dayId) state.openDayId = dayId;

      return () => {
        const back = target.indexOf(at.stop);
        if (back !== -1) target.splice(back, 1);
        at.list.splice(at.index, 0, at.stop);
      };
    },
    () => post("/api/stops/" + stopId + "/move", { dayId }),
    "That did not move",
  );
}

/* ---------------------------------------------------------------- search */

const DEBOUNCE_MS = 250;
const MIN_CHARS = 3;

function openSearch(dayId, atTime) {
  openLayer(() => { searchTicket++; clearTimeout(debounceTimer); state.search = null; clearLookMarker(); render(); });
  state.search = {
    dayId: dayId === "unplanned" ? null : dayId,
    // The Plan view searches into a gap, so whatever it finds lands on the
    // time the gap started at rather than at the end of the day.
    startTime: atTime || null,
    query: "", rows: [], pins: [], bias: null,
    note: null, busy: false, lookingAt: null,
  };
  render();
  const field = $("q");
  if (field) field.focus();
}

const closeSearch = closeLayer;

let debounceTimer = null;
let searchTicket = 0;

function sheetSearch(inline) {
  const s = state.search;

  const results = h("div", { class: "results", id: "results" }, []);
  renderResults(results);

  return h("div", { class: inline ? "inline-search" : "sheet", id: "search-sheet", style: inline ? "" : "height:529px" }, [
    wideNow() ? null : dismissGrabber("search-sheet", closeSearch),
    h("button", { class: "search-close", title: "Close search", onclick: closeSearch }, [icon("close")]),
    h("div", { class: "search-head" }, [
      inline ? null : searchTarget(),
      h("div", { class: "search-field" }, [
        icon("search"),
        h("input", {
          id: "q",
          value: s.query,
          placeholder: "Search for a place",
          autocomplete: "off",
          oninput: onSearchInput,
        }, []),
      ]),
    ]),
    results,
  ]);
}

/**
 * What this search is adding to, above the field.
 *
 * The sheet is opened from four places — a day's plus, a gap in the Planner's
 * clock, the tray, the empty day — and once it is up they all look the same.
 * A result added from a gap lands at that gap's time, which is a decision the
 * screen was making silently. So it says so: "Adding to Sun Sep 13, 14:30".
 *
 * It replaces the "Back to trip" button that used to sit here, which named
 * what was behind the sheet rather than what the sheet was for. The grabber
 * is the way out now.
 */
function searchTarget() {
  const s = state.search;
  const day = s.dayId ? dayById(s.dayId) : null;
  const where = day ? day.label : "To be planned";
  const when = s.startTime ? ", " + s.startTime : "";
  return h("div", { class: "search-target" }, [
    icon(day ? "calendar" : "pinChip"),
    h("span", { text: "Adding to " + where + when }, []),
  ]);
}

function onSearchInput(event) {
  const s = state.search;
  s.query = event.target.value;
  const query = s.query.trim();
  clearTimeout(debounceTimer);
  searchTicket++;
  s.rows = [];
  s.lookingAt = null;
  clearLookMarker();
  for (const pin of document.querySelectorAll(".suggestion-pin")) pin.remove();
  s.busy = query.length >= MIN_CHARS;
  renderResults($("results"));

  if (query.length < MIN_CHARS) {
    s.rows = [];
    s.note = query.length ? "Three characters before anything is sent." : null;
    renderResults($("results"));
    return;
  }
  // 250 ms, and never below three characters. PLAN.md section 4b.
  debounceTimer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
}

async function runSearch(query) {
  const s = state.search;
  const params = new URLSearchParams({ q: query });
  if (s.dayId) params.set("dayId", s.dayId);

  const ticket = ++searchTicket;
  s.busy = true;
  try {
    const data = await api("/api/trips/" + state.trip.trip.id + "/place-search?" + params);
    if (ticket !== searchTicket || state.search !== s) return;
    // Defensive: a reply without results is not something the Worker sends,
    // and a client that throws on one shows the stack where the rows go.
    s.rows = data.results || [];
    s.bias = data.bias;
    s.pins = data.pins || [];
    // A new set of results is a new set of places; nothing is being looked at.
    if (!s.rows.some((r) => r.placeId === s.lookingAt)) s.lookingAt = null;
    s.note = s.rows.length ? null : "Nothing found for that.";
  } catch (error) {
    if (ticket !== searchTicket || state.search !== s) return;
    s.rows = [];
    s.note = error.message;
  }
  s.busy = false;
  render();
  const field = $("q");
  if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
}

function searchSkeleton(label) {
  return h("div", { class: "search-skeleton", role: "status", "aria-label": label }, [
    ...[1, 2, 3].map(() => h("div", { class: "search-skeleton-row", "aria-hidden": "true" }, [
      h("i", {}, []), h("div", {}, [h("span", {}, []), h("span", {}, [])]),
    ])),
  ]);
}

function renderResults(container) {
  if (!container) return;
  const s = state.search;
  container.replaceChildren();
  if (s.busy) { container.append(searchSkeleton("Searching for places")); return; }

  if (s.note && !s.rows.length) {
    container.append(h("div", { class: "result-hint", text: s.note }, []));
  }

  for (const row of s.rows) container.append(resultRow(row));

  // Always last, as on the artboard: the way in for somewhere search misses.
  container.append(
    h("button", { class: "result", onclick: pasteLink }, [
      h("div", { class: "result-tile grey" }, [icon("linkGrey")]),
      h("div", { class: "result-text" }, [
        h("span", { style: "font-size:13px;font-weight:600", text: "Paste a Google Maps link" }, []),
        h("span", { style: "font-size:10.5px;color:#A0978A", text: "for somewhere search cannot find" }, []),
      ]),
    ]),
    // And the thing that is not a place at all. Half of what is on a day is
    // not somewhere Google knows about: picking up the car, getting ready,
    // the two hours before a concert.
    h("button", { class: "result", onclick: addNoteStop }, [
      h("div", { class: "result-tile grey" }, [icon("pencilGrey")]),
      h("div", { class: "result-text" }, [
        h("span", { style: "font-size:13px;font-weight:600", text: noteRowTitle() }, []),
        h("span", { style: "font-size:10.5px;color:#A0978A", text: "something to do, with no place attached" }, []),
      ]),
    ]),
  );
}

/** The row reads back what has been typed, so it is obvious what it will make. */
function noteRowTitle() {
  const typed = state.search.query.trim();
  return typed ? "Add \u201c" + typed + "\u201d as a note" : "Add a note instead";
}

function resultRow(row) {
  if (row.onTrip) {
    return h("div", { class: "result on-trip" }, [
      h("div", { class: "result-tile yellow" }, [icon("pinInk")]),
      h("div", { class: "result-text" }, [
        h("span", { class: "result-name", text: row.name }, []),
        h("span", { class: "result-meta", text: "Already on " + row.onTripDay }, []),
      ]),
      h("button", { class: "result-add-anyway", text: "Add Anyway", onclick: () => addPlace(row) }, []),
    ]);
  }

  const looking = state.search.lookingAt === row.placeId;

  return h("div", {
    class: "result" + (looking ? " looking" : ""),
  }, [
    // The row itself looks at the place; only the button adds it.
    h("button", {
      class: "result-tap",
      onclick: () => lookAt(row),
      title: "Show on the map",
    }, [
      h("div", { class: "result-tile" }, [
        icon("pinInk"),
      ]),
      h("div", { class: "result-text" }, [
        h("span", { class: "result-name", text: row.name }, []),
        h("span", { class: "result-meta", text: row.meta }, []),
      ]),
    ]),
    h("button", { class: "result-add", title: "Add to the trip", onclick: () => addPlace(row) }, [
      icon("plus"),
    ]),
  ]);
}

/**
 * Adds a place optimistically.
 *
 * The search row already carries everything a stop needs to be drawn — a name,
 * a category, a coordinate — so the stop appears on the day and the row turns
 * to "Add Anyway" straight away. The walking time on it is left to the re-read,
 * because that depends on the neighbour it lands next to and the server is
 * what works it out.
 */
function addPlace(row) {
  const s = state.search;
  const day = state.trip.days.find((d) => d.id === s.dayId);
  const list = day ? day.stops : state.trip.unplanned;

  optimistic(
    () => {
      const wasOnTrip = row.onTrip;
      const wasOnTripDay = row.onTripDay;
      const provisional = {
        id: "pending_" + crypto.randomUUID(),
        title: row.name,
        description: row.category || "",
        note: "",
        time: s.startTime || "",
        status: "planned",
        author: state.me ? state.me.initials : "",
        authorColor: state.me ? state.me.color : "#C4826A",
        city: null,
        navigateUrl: null,
        location: row.location,
      };
      list.push(provisional);
      row.onTrip = true;
      row.onTripDay = day ? day.label : "To be planned";

      return () => {
        const at = list.indexOf(provisional);
        if (at !== -1) list.splice(at, 1);
        row.onTrip = wasOnTrip;
        row.onTripDay = wasOnTripDay;
      };
    },
    () => post("/api/trips/" + state.trip.trip.id + "/stops", {
      placeId: row.placeId, dayId: s.dayId, startTime: s.startTime,
    }),
    "That place did not save",
  );
}

/**
 * A stop with a title and no place.
 *
 * It takes the day and the time the search was opened with, so a tap on 14:00
 * in the Planner and then this puts "Pick up the rental car" at 14:00 — the
 * same journey a place takes. What is already typed in the field is the
 * obvious title, so it is offered rather than asked for twice.
 */
async function addNoteStop() {
  const s = state.search;
  const typed = s.query.trim();
  const title = (typed || window.prompt("What is it?") || "").trim();
  if (!title) return;

  try {
    await post("/api/trips/" + state.trip.trip.id + "/stops/note", {
      title,
      dayId: s.dayId,
      startTime: s.startTime,
    });
    closeSearch();
    state.trip = await api("/api/trips/" + state.trip.trip.id);
    render();
  } catch (error) {
    s.note = error.message;
    renderResults($("results"));
  }
}

async function pasteLink() {
  const url = window.prompt("Paste a Google Maps link");
  if (!url) return;
  const s = state.search;
  try {
    await post("/api/trips/" + state.trip.trip.id + "/stops/link", { url, dayId: s.dayId });
    state.trip = await api("/api/trips/" + state.trip.trip.id);
    render();
  } catch (error) {
    s.note = error.message;
    renderResults($("results"));
  }
}


/* ------------------------------------------------------------- plan view */

/**
 * The Plan view, PLAN.md section 4f.
 *
 * design/PlannerMobile.dc.html on a phone and design/Planner.dc.html at a
 * desk. They are one view at two densities, not two features, so both read
 * the same trip payload and write the same ops; only the drawing differs.
 * Everything measured is measured in src/lib/plan.ts, where it is tested.
 */

const PLAN = window.__PLAN__;

function showPlan() {
  if (state.view === "plan") return;
  setRoute(tripPath(state.trip.trip.id, "plan"));
  state.view = "plan";
  state.selectedStopId = null;
  state.trayOpen = false;
  planDay();
  render();
}

/** The way out of the Plan view, through the history rather than around it. */
function leavePlan() {
  if (state.view !== "plan") return;
  setRoute(tripPath(state.trip.trip.id, "map"));
  showMap();
}

function showMap() {
  state.view = "map";
  gridSettled = null;
  state.selectedStopId = null;
  render();
}

/** The day the Plan view is looking at. Today, or the first day of the trip. */
function planDay() {
  const days = state.trip.days;
  if (state.planDayId && days.some((d) => d.id === state.planDayId)) return;
  const today = days.find((d) => d.date === todayIso());
  const open = days.find((d) => d.id === state.openDayId);
  state.planDayId = (today || open || days[0] || {}).id || null;
  const page = gridDays();
  state.planPage = Math.floor(Math.max(0, planIndex()) / page) * page;
}

const planIndex = () => state.trip.days.findIndex((d) => d.id === state.planDayId);

function stepDay(by) {
  const days = state.trip.days;
  const next = days[planIndex() + by];
  if (!next) return;
  state.planDayId = next.id;
  state.selectedStopId = null;
  render();
}

/** The rail scrolls the day you are on into the middle, after the render. */
function scrollRailToDay() {
  const pill = document.querySelector(".rail-pill.on");
  if (!pill) return;
  const rail = pill.parentElement;
  rail.scrollLeft = pill.offsetLeft - rail.clientWidth / 2 + pill.offsetWidth / 2;
}

/** The bar, which is the trip bar with the Plan view's own second line. */
function planBar(subtitle) {
  const trip = state.trip;
  return h("div", { class: "trip-bar" }, [
    h("div", { class: "trip-bar-text" }, [
      h("button", {
        style: "display:flex;align-items:center;gap:5px;background:none;border:0;padding:0;text-align:left;min-width:0",
        onclick: () => {
          openLayer(() => { state.tripMenu = false; render(); });
          state.tripMenu = true;
          render();
        },
      }, [
        h("div", { class: "trip-bar-name", text: trip.trip.name }, []),
        icon("chevron"),
      ]),
      h("div", { class: "trip-bar-sub", text: subtitle }, []),
    ]),
    avatars(trip.members, false, 2),
    h("button", { class: "round-btn", title: "Invite someone", onclick: openPeople }, [icon("invite")]),
  ]);
}

/**
 * The pill rail. The selected day carries its whole label; the rest drop the
 * weekday, which is how the artboard fits eleven days in 375px.
 */
function dayRail() {
  const today = todayIso();
  return h("div", { class: "day-rail" }, state.trip.days.map((day) => {
    const on = day.id === state.planDayId;
    const past = day.date < today;
    return h("button", {
      class: "rail-pill" + (on ? " on" : past ? " past" : ""),
      "data-day-id": day.id,
      onclick: () => { state.planDayId = day.id; state.selectedStopId = null; render(); },
    }, [
      h("span", { class: "rail-hue", style: "background:" + day.hue }, []),
      h("span", { text: on ? day.label : shortLabel(day.label) }, []),
    ]);
  }));
}

/**
 * Where you are sleeping on the day showing, under the rail.
 *
 * On the day you change hotels both are named, in the order you are in them,
 * which is the one day of a stay worth reading carefully.
 */
function stayLine(day) {
  const stays = PLAN.staysOn(day.date, tripStays());
  if (!stays.length) return null;

  return h("div", { class: "stay-line" }, [
    h("span", { class: "stay-line-icon", style: "display:flex", html: ICONS.house }, []),
    ...stays.map((stay) =>
      h("button", {
        class: "stay-chip",
        title: stayRange(stay),
        onclick: () => selectStay(byStayId(stay.id)),
        text: stay.name,
      }, []),
    ),
  ]);
}

const byStayId = (id) => (state.trip.lodging || []).find((l) => l.id === id) || null;

/** "Fri Oct 2" without its weekday. The rail has no room for eleven of those. */
function shortLabel(label) {
  const parts = String(label).split(" ");
  return parts.length > 2 ? parts.slice(1).join(" ") : label;
}

/**
 * Days are swiped, PLAN.md 4f. A swipe has to be sideways and long enough to
 * be meant, so a scroll down the day never changes the day underneath it.
 */
function swipeDays(el) {
  let x = 0;
  let y = 0;
  let live = false;

  /*
   * Down on the day, up on the window.
   *
   * A swipe that started on the clock and finished a few pixels outside it —
   * over the tray, over the rail, off the edge of the screen — never fired a
   * pointerup here at all, so the swipe did nothing. It is the same rule the
   * drag handle already follows and for the same reason: the element a gesture
   * starts on is not the element it ends on.
   */
  /*
   * The furthest the finger got, kept as it moves.
   *
   * A horizontal drag across a vertically scrolling element is a gesture the
   * browser may decide is its own, and when it does it sends pointercancel and
   * no pointerup at all — so waiting for pointerup meant the swipe did nothing
   * on a real phone. The travel is measured on the way and a cancel counts the
   * same as a finish. A touch-action of pan-y on the scroller makes that
   * rarer; this makes it harmless when it happens anyway.
   */
  let dx = 0;
  let dy = 0;

  const done = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", done);
    window.removeEventListener("pointercancel", done);
    if (!live) return;
    live = false;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    stepDay(dx < 0 ? 1 : -1);
  };

  const move = (e) => {
    if (!live) return;
    dx = e.clientX - x;
    dy = e.clientY - y;
  };

  el.addEventListener("pointerdown", (e) => {
    if (state.drag) return;
    x = e.clientX; y = e.clientY; dx = 0; dy = 0; live = true;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
  });
}

function trayCard(stop, full) {
  const dragging = state.drag && state.drag.stopId === stop.id;
  return h("div", {
    class: "tray-card order-row" + (dragging ? " ghost" : ""),
    "data-stop-id": stop.id,
  }, [
    dragHandle({ id: null }, stop),
    h("div", { class: "stop-text" }, [
      h("span", { class: "tray-name", text: stop.title }, []),
      h("span", { class: "tray-meta", text: stop.description }, []),
    ]),
    full
      ? h("button", {
          class: "tray-put",
          title: "Put this on " + (dayById(state.planDayId) || {}).label,
          onclick: () => putOnDay(stop),
        }, [icon("plusGrey")])
      : null,
  ]);
}

const dayById = (id) => state.trip.days.find((d) => d.id === id);

/** The tray card's plus: the same op a drag onto the day would write. */
function putOnDay(stop) {
  const dayId = state.planDayId;
  optimistic(
    () => {
      const at = locateStop(stop.id);
      if (!at) return () => {};
      at.list.splice(at.index, 1);
      const day = dayById(dayId);
      day.stops.push(at.stop);
      return () => {
        const back = day.stops.indexOf(at.stop);
        if (back !== -1) day.stops.splice(back, 1);
        at.list.splice(at.index, 0, at.stop);
      };
    },
    () => post("/api/stops/" + stop.id + "/move", { dayId }),
    "That did not move",
  );
}

/* --------------------------------------------------------- the time on a stop */

/**
 * Setting a time.
 *
 * PLAN.md 4e: editing a time belongs on the time itself, not in a menu, so
 * this opens from the clock gutter and from the Planner's card. No artboard
 * draws the editor; it is built from the palette, like the note editor.
 */
function openTime(stop) {
  openLayer(() => { state.timeFor = null; render(); });
  state.timeFor = stop;
  render();
}

function sheetTime() {
  const stop = state.timeFor;
  const close = closeLayer;
  const field = h("input", { type: "time", class: "time-field", value: stop.time || "" }, []);

  const save = (value) => {
    closeLayer();
    optimistic(
      () => {
        const at = locateStop(stop.id);
        if (!at) return () => {};
        const was = at.stop.time;
        at.stop.time = value;
        return () => { at.stop.time = was; };
      },
      () => post("/api/stops/" + stop.id + "/time", { time: value }),
      "That time did not save",
    );
  };

  return [
    h("div", { class: "scrim", onclick: close }, []),
    h("div", { class: "sheet modal", id: "time-sheet" }, [
      dismissGrabber("time-sheet", close),
      h("div", { class: "modal-head" }, [
        h("div", { class: "modal-title", text: "When?" }, []),
        h("div", { class: "modal-sub", text: stop.title }, []),
      ]),
      h("div", { class: "time-editor" }, [
        field,
        h("div", { class: "note-actions" }, [
          h("button", { class: "save", onclick: () => save(field.value) }, ["Save"]),
          stop.time
            ? h("button", { class: "cancel", onclick: () => save("") }, ["Clear"])
            : h("button", { class: "cancel", onclick: close }, ["Cancel"]),
        ]),
      ]),
    ]),
  ];
}

/* ------------------------------------------------- the Planner at a desk */

/**
 * How many days the grid deals at once.
 *
 * design/Planner.dc.html shows seven, which is what 1440px holds. Narrower
 * than that, seven columns would be too thin to read a place name in, so the
 * grid shows fewer days rather than shrinking them — the same view at another
 * density, which is the whole idea in PLAN.md 4f. A column is never allowed
 * below 120px, and never fewer than three days, because two is not a week and
 * would be better served by the phone's one-day screen.
 */
const COLUMN_MIN = 120;

/**
 * How many days the grid deals.
 *
 * One on a phone, which is the whole of the Plan view there now. It used to
 * draw the day as a list with the times down the side and no grid at all,
 * on the reasoning that seven columns cannot work at 375px — true, but the
 * answer to that is one column, not a different screen. A day at 375px with
 * real hours in it is a calendar; a list of rows is an agenda, and it loses
 * the thing a calendar is for, which is seeing the shape of the day and the
 * holes in it.
 *
 * At a desk it is as many as fit, never under 120px each and never over seven.
 */
function gridDays() {
  if (!wideNow()) return 1;
  const wide = Math.min(1440, window.innerWidth);
  const tray = Math.min(252, wide * 0.26);
  const columns = Math.floor((wide - 56 - tray) / COLUMN_MIN);
  return Math.max(3, Math.min(7, columns));
}

/** The one delete, shared by the sheet's kebab and the Planner's popover. */
function removeStop(stop) {
  optimistic(
    () => {
      const at = locateStop(stop.id);
      if (at) at.list.splice(at.index, 1);
      state.selectedStopId = null;
      return () => { if (at) at.list.splice(at.index, 0, at.stop); };
    },
    () => post("/api/stops/" + stop.id + "/delete", {}),
    "That did not come off the list",
  );
}

/**
 * The Plan view, at whatever width it is being read at.
 *
 * One screen now, not two. A phone gets the same grid with a single column
 * and the pill rail to choose the day; a desk gets as many columns as fit and
 * a pager. Both read the same payload, write the same ops, and share every
 * piece of geometry in src/lib/plan.ts.
 */
function screenGrid() {
  planDay();
  const trip = state.trip;
  const wide = wideNow();
  const total = trip.days.length;
  const page = gridDays();

  // A phone follows the day the rail is on; a desk pages through them.
  const from = wide
    ? Math.min(state.planPage, Math.max(0, total - page))
    : Math.max(0, planIndex());
  const days = trip.days.slice(from, from + page);
  const span = PLAN.gridSpan(gridTimes(days));
  const band = bandHeight(days);

  return h("div", { class: "screen desk" + (wide ? "" : " narrow") }, [
    wide
      ? gridBar(from, total, page)
      : planBar(trip.dateRange + " · day " + (from + 1) + " of " + total),
    wide ? null : dayRail(),
    h("div", { class: "grid-main" }, [
      h("div", { class: "grid-days" }, [
        gridHeaders(days, wide),
        state.dayEdit && days.some((day) => day.id === state.dayEdit)
          ? dayEditPanel(days.find((day) => day.id === state.dayEdit)) : null,
        lodgingRow(days),
        lodgingStrip(days),
        gridScroll(days, span, band, wide),
      ]),
      trayDrawer(wide),
    ]),
    noticeToast(),
    ...dragLayer(),
  ]);
}

/**
 * Where the grid opens.
 *
 * A calendar that opens on 08:00 and leaves the day below the fold has hidden
 * the thing it was opened to see — and on a trip where nothing has a time yet,
 * everything is in the band under the hours. So the first render of a page
 * scrolls to what is actually there: the earliest card, or the band, or the
 * hour it is now. Only the first, because after that the scroll belongs to
 * whoever is reading it.
 */
let gridSettled = null;

function settleGrid() {
  const scroll = document.querySelector(".grid-scroll");
  if (!scroll) return;
  const key = state.trip.trip.id + ":" + state.planPage + ":" + gridDays();
  if (gridSettled === key) return;
  gridSettled = key;

  const timed = [...document.querySelectorAll(".gcard:not(.untimed)")];
  if (timed.length) {
    const first = Math.min(...timed.map((c) => parseFloat(c.style.top) || 0));
    scroll.scrollTop = Math.max(0, first - 40);
    return;
  }

  const band = document.querySelector(".band-label");
  if (band) {
    scroll.scrollTop = Math.max(0, (parseFloat(band.style.top) || 0) - 60);
    return;
  }

  const line = document.querySelector(".now-line");
  if (line) scroll.scrollTop = Math.max(0, (parseFloat(line.style.top) || 0) - 80);
}

/** Every time on the days showing, so the column covers what the days hold. */
function gridTimes(days) {
  const out = [];
  for (const day of days) for (const stop of day.stops) out.push(stop.time);
  return out;
}

/** The band under the grid is as tall as the longest list of untimed stops. */
function bandHeight(days) {
  let most = 0;
  for (const day of days) {
    const n = day.stops.filter((s) => !PLAN.minutesOf(s.time)).length;
    if (n > most) most = n;
  }
  return most ? 20 + most * 42 : 0;
}

function gridBar(from, total, page) {
  const turn = (by) => {
    state.planPage = Math.min(Math.max(0, total - page), Math.max(0, from + by * page));
    render();
  };
  const last = Math.min(total, from + page);

  return h("div", { class: "desk-bar" }, [
    h("button", {
      class: "desk-name",
      onclick: () => {
        openLayer(() => { state.tripMenu = false; render(); });
        state.tripMenu = true;
        render();
      },
      "aria-expanded": String(state.tripMenu),
    }, [h("span", { text: state.trip.trip.name }, []), icon("chevron")]),
    h("span", { class: "desk-trip-date", text: state.trip.dateRange }, []),
    h("div", { class: "segmented" }, [
      h("button", { onclick: leavePlan }, ["Map"]),
      h("button", { class: "on" }, ["Planner"]),
    ]),
    h("div", { class: "desk-pager" }, [
      h("button", { class: "sq-btn", onclick: () => turn(-1), disabled: from === 0 }, [
        h("span", { style: "display:flex;transform:rotate(90deg)", html: ICONS.chevron }, []),
      ]),
      h("span", {
        class: "desk-range",
        text: "day " + (from + 1) + "–" + last + " of " + total,
      }, []),
      h("button", { class: "sq-btn", onclick: () => turn(1), disabled: last >= total }, [
        h("span", { style: "display:flex;transform:rotate(-90deg)", html: ICONS.chevron }, []),
      ]),
    ]),
    h("span", { style: "flex-grow:1" }, []),
    avatars(state.trip.members),
    h("button", { class: "round-btn", title: "Invite someone", onclick: openPeople }, [icon("invite")]),
  ]);
}

function gridHeaders(days, wide) {
  const today = todayIso();
  return h("div", { class: "grid-head" }, [
    h("div", { class: "grid-gutter-head" }, []),
    ...days.map((day) => {
      const past = day.date < today;
      const isToday = day.date === today;
      const done = day.stops.filter((s) => statusOf(day, s) === "done").length;
      const city = (day.stops.find((s) => s.city) || {}).city || null;
      const nothing = day.stops.length === 0;
      const line = day.place_label
        ? day.place_label
        : nothing
          ? (city ? city + " · nothing planned" : "nothing planned")
          : (city ? city + " · " + done + "/" + day.stops.length : done + "/" + day.stops.length);

      return h("div", {
        class: "gcol-head" + (past ? " past" : "") + (isToday ? " today" : ""),
        onclick: () => { state.planDayId = day.id; render(); },
      }, [
        // On a phone the pill rail directly above already names the day in
        // full, so the header does not say it twice — it carries the city and
        // the count, which the rail has no room for.
        wide
          ? h("div", { class: "gcol-top" }, [
              h("span", { class: "gcol-hue", style: "background:" + day.hue }, []),
              h("span", { class: "gcol-label", text: day.label }, []),
              isToday ? h("span", { class: "today-tag", text: "TODAY" }, []) : null,
            ])
          : null,
        h("div", { class: "gcol-sub" + (nothing ? " nothing" : ""), text: line }, []),
        day.name ? h("div", { class: "gcol-sub", text: day.name }, []) : null,
        dayEditButton(day),
      ]);
    }),
  ]);
}

/**
 * Where you are sleeping, pinned above the hours.
 *
 * Planner.dc.html rules a lodging strip under its grid and CLAUDE.md said it
 * was not built, because the lodging table has no API and drawing the row
 * would have been furniture with nothing behind it. There is something behind
 * it now: a stop whose category reads as lodging is an accommodation node
 * (isAccommodation), so the strip is fed by the trip's own stops.
 *
 * It sits above the hours rather than under them, and outside the scroller, so
 * it stays put while the day scrolls — a hotel is not an event at a time, it
 * is the fact the whole day hangs off. For the same reason the bed is drawn
 * here and *only* here: it is skipped in the column, so it does not also
 * appear in the NO TIME band as an untimed card.
 */
function lodgingRow(days) {
  const beds = days.map((day) => day.stops.filter((s) => s.accommodation));
  if (!beds.some((list) => list.length)) return null;

  return h("div", { class: "lodging-row" }, [
    h("div", { class: "lodging-gutter", html: ICONS.houseHue }, []),
    ...days.map((day, i) =>
      h("div", { class: "lodging-cell" }, beds[i].map((stop) =>
        h("button", {
          class: "lodging-card" + (stop.id === state.selectedStopId ? " selected" : ""),
          onclick: () => {
            if (suppressTap) { suppressTap = false; return; }
            state.selectedStopId = stop.id === state.selectedStopId ? null : stop.id;
            render();
          },
        }, [
          h("span", { class: "lodging-name", text: stop.title }, []),
        ])))),
  ]);
}

let gridObserver = null;

function gridScroll(days, span, band, wide) {
  if (gridObserver) gridObserver.disconnect();
  const baseHeight = span.height;
  const scroll = h("div", { class: "grid-scroll" }, [gridContent(days, span, band)]);
  if (wide) {
    gridObserver = new ResizeObserver(() => {
      if (!scroll.isConnected || state.drag) return;
      const height = Math.max(baseHeight, scroll.clientHeight - (band ? band + 12 : 0) - 18);
      if (Math.abs(height - span.height) < 1) return;
      span.height = height;
      scroll.replaceChildren(gridContent(days, span, band));
    });
    gridObserver.observe(scroll);
  } else swipeDays(scroll);
  return scroll;
}

function gridContent(days, span, band) {
  const height = span.height + (band ? band + 12 : 0);

  const gutter = h("div", { class: "grid-gutter", style: "height:" + height + "px" },
    PLAN.hourLabels(span).map((h2) =>
      h("span", { class: "hour-label", style: "top:" + (h2.at - 6) + "px", text: h2.label }, [])));
  if (band) {
    gutter.append(h("span", {
      class: "band-label", style: "top:" + (span.height + 16) + "px", text: "NO TIME",
    }, []));
  }

  const lines = h("div", { class: "grid-lines" },
    PLAN.hourLines(span).map((y) => h("i", { style: "top:" + y + "px" }, [])));
  if (band) lines.append(h("i", { class: "band-rule", style: "top:" + (span.height + 6) + "px" }, []));

  return h("div", { class: "grid-inner", style: "height:" + height + "px" }, [
      gutter,
      lines,
      // The last columns hang their popover to the left, where there is room.
      // The popover hangs left for the last columns, where there is no room to
      // its right. With one column there is no room either side, so it goes
      // below the card instead — see .screen.desk.narrow .gpop.
      ...days.map((day, i) => gridColumn(day, span, band, days.length > 2 && i >= days.length - 2)),
    ]);
}

function gridColumn(day, span, band, flip) {
  const today = todayIso();
  const past = day.date < today;
  const isToday = day.date === today;

  const col = h("div", {
    class: "gcol drop-zone open" + (past ? " past" : "") + (isToday ? " today" : "")
      + (flip ? " flip" : ""),
    "data-day-id": day.id,
    "data-grid": "1",
    "data-from": String(span.from),
    "data-to": String(span.to),
    "data-height": String(span.height),
    onclick: (event) => {
      // A click on the empty grid plans something into that hour. A click on
      // a card is the card's own.
      if (event.target.closest(".gcard")) return;
      if (suppressTap) { suppressTap = false; return; }
      if (state.selectedStopId) { state.selectedStopId = null; render(); return; }
      const y = event.clientY - col.getBoundingClientRect().top;
      if (y > span.height) return;
      const open = () => openSearch(day.id, PLAN.formatClock(PLAN.gridTime(span, y)));
      if (state.search) closeThen(1, open); else open();
    },
  }, []);

  if (wideNow() && state.search && state.search.dayId === day.id && state.search.startTime) {
    const top = PLAN.gridY(span, PLAN.minutesOf(state.search.startTime));
    col.append(h("div", { class: "grid-add-ghost", style: "top:" + top + "px;border-color:" + day.hue, "aria-label": "Adding a place at " + state.search.startTime }, [icon("plus")]));
  }

  if (isToday) {
    const nowAt = new Date();
    const minutes = nowAt.getHours() * 60 + nowAt.getMinutes();
    if (minutes >= span.from && minutes <= span.to) {
      const y = PLAN.gridY(span, minutes);
      col.append(h("div", { class: "now-line", style: "top:" + y + "px" }, []));
      col.append(h("div", { class: "now-dot", style: "top:" + (y - 4) + "px" }, []));
    }
  }

  for (const stop of day.stops) {
    // A bed lives in the pinned strip above the hours, not in them.
    if (stop.accommodation) continue;
    const box = PLAN.cardBox(span, stop.time, null, Boolean(gridSub(stop)));
    if (!box) continue;
    col.append(gridCard(day, stop, box, null));
  }

  // The untimed stops. design/Planner.dc.html gives every card a time, and
  // most stops on a real trip have none (PLAN.md section 11), so they wait in
  // a band under the grid rather than being given a time nobody chose. Drag
  // one on to the hours and it gets the time it lands on.
  let row = 0;
  for (const stop of day.stops) {
    if (stop.accommodation) continue;
    if (PLAN.minutesOf(stop.time) !== null) continue;
    col.append(gridCard(day, stop, { top: span.height + 20 + row * 42, height: 38 }, "untimed"));
    row++;
  }

  return col;
}

/**
 * The lodging strip, under the grid.
 *
 * design/Planner.dc.html rules this row and writes the hotel's name into
 * every column it covers, so "The Blossom Hakata" appears three times in a
 * row and reads at a glance as three hotels. It was left unbuilt because
 * nothing could fill it (PLAN.md section 5b); now that a stay can be added,
 * it is built as one bar spanning the days it covers, which is what a stay
 * actually is.
 *
 * The day you change hotels belongs to both of them, and the artboard has no
 * answer for that. src/lib/plan.ts splits it down the middle: the stay you
 * are leaving keeps the left half, the one you are arriving at takes the
 * right, and the seam falls on the day of the change.
 */
function lodgingStrip(days) {
  const bars = PLAN.lodgingBars(days.map((d) => d.date), tripStays());

  const lane = h("div", {
    class: "stay-lane",
    onclick: (event) => { if (event.target === event.currentTarget) openStay(null); },
    title: bars.length ? "" : "Add where you are staying",
  }, bars.map((bar) =>
    h("button", {
      class: "stay-bar" + (bar.startsBefore ? " open-left" : "") + (bar.endsAfter ? " open-right" : ""),
      // Two pixels of air either side, taken out of the width rather than
              // added as a margin, so the bar still ends exactly on the seam.
              style: "left:calc(" + (bar.left * 100) + "% + 2px);width:calc(" + (bar.width * 100) + "% - 4px)",
      title: stayRange(byStayId(bar.id) || { check_in: "", check_out: "" }),
      id: "stay-grid-" + bar.id,
      "data-stay-anchor": bar.id,
      "aria-expanded": String(state.stayPopover === "stay-grid-" + bar.id),
      onclick: () => selectStay(byStayId(bar.id), "stay-grid-" + bar.id),
    }, [
      h("span", { class: "stay-bar-name", text: bar.name }, []),
    ])));

  if (!bars.length) {
    lane.append(h("span", { class: "stay-lane-empty", text: "No stay on these days" }, []));
  }

  return h("div", { class: "lodging-strip" }, [
    h("div", { class: "stay-gutter" }, [
      h("span", { style: "display:flex", html: ICONS.house, title: "Where you are sleeping" }, []),
    ]),
    lane,
  ]);
}

/** A card's second line: the note if there is one, the derived line if not. */
function gridSub(stop) {
  return stop.note || stop.description || "";
}

function gridCard(day, stop, box, kind) {
  const st = statusOf(day, stop);
  const selected = stop.id === state.selectedStopId;
  const dragging = state.drag && state.drag.stopId === stop.id;
  const sub = gridSub(stop);

  const card = h("div", {
    class: "gcard order-row " + st + (kind ? " " + kind : "") + (selected ? " selected" : "")
      + (dragging ? " ghost" : ""),
    "data-stop-id": stop.id,
    style: "top:" + box.top + "px;height:" + box.height + "px;--day-color:" + day.hue + ";--visited-color:" + mutedHue(day.hue),
    onclick: () => {
      if (suppressTap) { suppressTap = false; return; }
      state.selectedStopId = selected ? null : stop.id;
      render();
    },
  }, [
    dragHandle(day, stop),
    h("div", { class: "gcard-text" }, [
      h("div", { class: "gcard-top" }, [
        h("span", { class: "gcard-title", text: stop.title }, []),
        h("span", {
          class: "gcard-author",
          style: "background:" + stop.authorColor,
          text: stop.author,
          title: stop.author + " added this",
        }, []),
      ]),
      sub || stop.time
        ? h("span", {
            class: "gcard-sub",
          }, [
            kind !== "untimed" && stop.time ? h("span", { class: "gcard-time", style: "color:" + day.hue, text: stop.time }, []) : null,
            kind !== "untimed" && stop.time && sub ? " · " : null,
            sub,
          ])
        : null,
    ]),
  ]);

  if (selected && !dragging) card.append(gridPopover(stop));
  return card;
}

/**
 * design/PlannerStop.dc.html. At a desk there is nothing to navigate to and
 * nothing to tick off (PLAN.md section 4e), so the popover is the three edits.
 */
function gridPopover(stop) {
  const item = (iconName, label, onclick, danger) =>
    h("button", {
      class: "gpop-item" + (danger ? " danger" : ""),
      onclick: (event) => { event.stopPropagation(); onclick(); },
    }, [icon(iconName), h("span", { text: label }, [])]);

  return h("div", {
    class: "gpop",
    onclick: (event) => event.stopPropagation(),
  }, [
    h("div", { class: "gpop-head" }, [
      h("div", { class: "gpop-title", text: stop.title }, []),
      h("div", { class: "gpop-sub", text: stop.time || "no time yet" }, []),
    ]),
    // "Edit" on the artboard, and the time is what there is to edit: the name
    // comes from the place and the note has its own item.
    item("calendar", stop.time ? "Edit time" : "Set a time", () => openTime(stop)),
    item("pencil", stop.note ? "Edit note" : "Add note", () => editNote(stop)),
    item("trash", "Delete", () => removeStop(stop), true),
  ]);
}

/** The sidebar. Same bucket as the phone's tray, laid out down instead of across. */
/**
 * To be planned, as a drawer on the right.
 *
 * At a desk it is a column beside the grid and always open: there is room for
 * both, and nothing is being covered. On a phone there is no such room, so it
 * slides in over the calendar from the right edge and is shut by default —
 * the calendar is what the screen is for, and the drawer is where you go to
 * fetch something.
 *
 * Which is why **dragging a card out of it closes it**. The whole point of
 * picking something up in there is to put it down on the day, and the day is
 * underneath the drawer. See the pointerdown in dragHandle.
 *
 * And why **dragging a card back towards it opens it again**: the shut drawer
 * is a drop target you cannot see into, so holding a card against the right
 * edge slides it out and lets you place the card among the others rather than
 * posting it through a slot. Same idea as a collapsed day springing open in
 * the sheet, and the same reason for the pause before it happens — a finger
 * crossing the edge on its way somewhere else must not disturb it.
 */
function trayDrawer(wide) {
  const all = state.trip.unplanned;
  const open = wide || state.trayOpen;

  const panel = h("div", {
    class: "tray-side" + (wide ? "" : " drawer") + (open ? " open" : ""),
    id: "tray-drawer",
  }, [
    h("div", { class: "tray-side-head" }, [
      h("span", { class: "tray-label", text: "TO BE PLANNED" }, []),
      h("span", { style: "flex-grow:1" }, []),
      h("span", { class: "tray-count", text: String(all.length) }, []),
      wide
        ? null
        : h("button", {
            class: "tray-close",
            title: "Close",
            onclick: () => toggleTray(false),
          }, [icon("close")]),
    ]),
    h("div", { class: "tray-side-list drop-zone open", "data-day-id": "unplanned" },
      all.length
        ? all.map((stop) => trayCard(stop, true))
        : [h("span", { class: "tray-empty", text: "Put your ideas for destinations here" }, [])]),
    h("div", { class: "tray-side-foot" }, [
      wide && state.search && !state.search.dayId ? sheetSearch(true) : h("button", { class: "add-place", onclick: () => openSearch("unplanned") }, [
        icon("plusGrey"), "Add a place",
      ]),
    ]),
  ]);

  if (wide) return panel;

  return h("div", { class: "tray-dock" + (open ? " open" : "") }, [
    // The edge tab, which is also what a dragged card is aimed at.
    h("button", {
      class: "tray-tab",
      id: "tray-tab",
      "aria-expanded": String(open),
      "aria-controls": "tray-drawer",
      onclick: () => toggleTray(!state.trayOpen),
    }, [
      h("span", { class: "tray-tab-count", text: String(all.length) }, []),
      h("span", { class: "tray-tab-label", text: "TO BE PLANNED" }, []),
    ]),
    h("div", { class: "tray-scrim", onclick: () => toggleTray(false) }, []),
    panel,
  ]);
}

/* ------------------------------------------------ dropping on to an hour */
function toggleTray(open) {
  state.trayOpen = open;
  const dock = document.querySelector(".tray-dock");
  if (dock) dock.classList.toggle("open", open);
  const panel = $("tray-drawer");
  if (panel) { panel.classList.toggle("open", open); panel.inert = !open; }
  const tab = $("tray-tab");
  if (tab) tab.setAttribute("aria-expanded", String(open));
  if (!open && tab) tab.focus({ preventScroll: true });
}

/**
 * The grid's own drop resolution.
 *
 * A list is ordered by where the finger is between two rows; a column is
 * ordered by the clock, so the hour under the pointer decides both the time
 * and the neighbour. Dropping below the hours, in the band, clears the time
 * instead — that is how a stop comes back off the grid.
 */
function resolveGridDrop(col, y) {
  const drag = state.drag;
  const span = spanOf(col);
  const day = dayById(col.dataset.dayId);
  drag.targetDayId = col.dataset.dayId;

  if (y > span.height) {
    drag.gridTime = "";
    drag.gridY = null;
    drag.afterStopId = undefined;
    return;
  }

  const minutes = PLAN.gridTime(span, y);
  drag.gridTime = PLAN.formatClock(minutes);
  drag.gridY = PLAN.gridY(span, minutes);

  // Ordered by the clock: it follows the last stop of the day that starts no
  // later than it does.
  let after = null;
  for (const stop of (day || { stops: [] }).stops) {
    if (stop.id === drag.stopId) continue;
    const at = PLAN.minutesOf(stop.time);
    if (at !== null && at <= minutes) after = stop.id;
  }
  drag.afterStopId = after;
}

function spanOf(col) {
  const from = Number(col.dataset.from);
  const to = Number(col.dataset.to);
  return { from: from, to: to, height: Number(col.dataset.height) || ((to - from) * PLAN.PX_PER_HOUR) / 60 };
}

/** The green bar the artboard draws across the column, and the time on it. */
function paintGridDrop() {
  const drag = state.drag;
  const bar = $("grid-drop");
  if (!bar) return;

  const col = drag.targetDayId
    ? document.querySelector('.gcol[data-day-id="' + drag.targetDayId + '"]')
    : null;
  if (!col || drag.gridY === null || drag.gridY === undefined) { bar.hidden = true; return; }

  const rect = col.getBoundingClientRect();
  const box = $("frame").getBoundingClientRect();
  bar.hidden = false;
  bar.style.left = rect.left - box.left + 5 + "px";
  bar.style.width = rect.width - 10 + "px";
  bar.style.top = rect.top - box.top + drag.gridY + "px";
  const when = bar.querySelector("span");
  if (when) when.textContent = drag.gridTime;

  // The card in the air is the width of the column it is over, not the width
  // of a phone, and it hangs below the line the way PlannerStop.dc.html draws
  // it — so the line it would land on stays readable under the hand.
  const card = $("lifted");
  if (card) {
    card.style.left = rect.left - box.left + 5 + "px";
    card.style.width = rect.width - 10 + "px";
    card.style.top = rect.top - box.top + drag.gridY + 10 + "px";
  }
}

/* ----------------------------------------------------------------- dates */

function todayIso() { return new Date().toISOString().slice(0, 10); }

function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

function rangeLabel(a, b) {
  const start = new Date(a + "T00:00:00Z");
  const end = new Date(b + "T00:00:00Z");
  const left = MONTHS[start.getUTCMonth()] + " " + start.getUTCDate();
  const right = start.getUTCMonth() === end.getUTCMonth()
    ? String(end.getUTCDate())
    : MONTHS[end.getUTCMonth()] + " " + end.getUTCDate();
  return left + " – " + right;
}

/* ------------------------------------------------------------------ boot */

(async function start() {
  // A link that has been turned off redirects here saying so, rather than
  // dropping someone on the trips list with no idea what happened.
  const asked = new URLSearchParams(location.search);
  if (asked.get("invite") === "gone") {
    state.error = "That invite link has been turned off. Ask whoever sent it for a new one.";
  }
  // Better Auth puts its own failures here on the way back from Google. The
  // wording is ours, because "state_mismatch" is not a sentence.
  const AUTH_TROUBLE = {
    access_denied: "Signing in was cancelled. Nothing happened.",
    state_not_found: "That took long enough that the sign-in expired. Try it again.",
    please_restart_the_process: "That sign-in went stale. Try it again.",
  };
  const trouble = asked.get("error");
  if (trouble) state.error = AUTH_TROUBLE[trouble] || "Signing in did not work. Try it again.";
  if (asked.get("invite") || trouble) {
    history.replaceState(null, "", location.pathname);
  }

  try {
    // One call: who you are, what you have, and the invitation waiting on the
    // card at the top of the list.
    const data = await api("/api/trips");
    state.me = data.me;
    state.trips = data.trips;
    state.invite = data.invite;
    if (location.pathname.startsWith("/trips/")) await restoreRoute();
    else render();
  } catch (error) {
    // A 401 has already put the sign-in screen up, in api(). Anything else is
    // a real failure, and the trips screen says so rather than staying blank.
    if (error.status !== 401) {
      state.error = error.message;
      render();
    }
  }
})();
`;
