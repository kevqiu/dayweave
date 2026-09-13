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
  /* Inside a trip: the map and its sheet, or the Plan view (PLAN.md 4f). */
  view: "map",
  trips: [],
  trip: null,
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
  hideVisited: false,
  error: null,
  drag: null,
  move: null,
  noteFor: null,
  preview: null,
};

const frame = $("frame");

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
  // The Plan view is the grid at every width now — one column on a phone. The
  // frame only grows for the wide one; every other screen stays 375.
  const grid = planning() && wideNow();
  // The phone frame is 375 wide everywhere else in the app. The Planner at a
  // desk is the same view at another density (PLAN.md 4f), so the frame grows
  // to hold the grid and shrinks back on the way out.
  frame.classList.toggle("wide", grid);

  frame.replaceChildren();
  if (state.screen === "signIn") { frame.append(screenSignIn()); return; }
  if (state.screen === "trips") frame.append(screenTrips());
  else if (state.screen === "newTrip") frame.append(screenNewTrip());
  else if (state.screen === "trip") {
    frame.append(planning() ? screenGrid() : screenTrip());
  }
  if (state.search) frame.append(sheetSearch());
  if (state.tripMenu) frame.append(...tripMenu());
  if (state.move) frame.append(...sheetMove());
  if (state.noteFor) frame.append(...sheetNote());
  if (state.timeFor) frame.append(...sheetTime());
  // The lifted card is created by the render that starts a drag, so it has to
  // be put under the finger before the first paint rather than on the next move.
  if (state.drag) paintDrag();
  if (state.search) paintSearchMap();
  if (state.screen === "trip" && !planning()) paintMap();
  if (planning() && !grid) scrollRailToDay();
  if (planning()) settleGrid();
}

// The two densities are one view, so crossing the width re-renders into the
// other one rather than leaving a phone layout stretched across a desk.
window.matchMedia(WIDE).addEventListener("change", () => { if (planning()) render(); });

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

function openLayer(close) {
  backStack.push(close);
  history.pushState({ depth: backStack.length }, "");
}

/** What every X, scrim and Cancel calls. */
function closeLayer() {
  closeTo(1);
}

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
  // A traversal of several entries fires one popstate, not one per entry, so
  // the depth on the entry we landed on is what says how much to unwind —
  // rather than popping one and hoping the count matches.
  const depth = event.state && typeof event.state.depth === "number" ? event.state.depth : 0;
  while (backStack.length > depth) {
    const close = backStack.pop();
    if (close) close();
  }

  const queued = afterClose;
  afterClose = [];
  for (const then of queued) then();
});

/* ---------------------------------------------------------------- trips */

function avatars(people, small) {
  return h(
    "div",
    { class: small ? "avatars small" : "avatars" },
    people.map((p) => h("span", { style: "background:" + p.color, text: p.initials }, [])),
  );
}

function screenTrips() {
  const now = todayIso();
  const current = state.trips.filter((t) => t.start_date <= now && t.end_date >= now);
  const upcoming = state.trips.filter((t) => t.start_date > now);
  const past = state.trips.filter((t) => t.end_date < now);

  const scroll = h("div", { class: "trips-scroll" }, []);

  if (current.length) {
    scroll.append(h("div", { class: "section-label", text: "HAPPENING NOW" }, []));
    for (const trip of current) scroll.append(tripCard(trip));
  }
  if (upcoming.length) {
    scroll.append(h("div", { class: "section-label" + (current.length ? " spaced" : ""), text: "COMING UP" }, []));
    for (const trip of upcoming) scroll.append(tripRow(trip, false));
  }
  if (past.length) {
    scroll.append(h("div", { class: "section-label spaced", text: "PAST" }, []));
    for (const trip of past) scroll.append(tripRow(trip, true));
  }
  if (!state.trips.length) {
    scroll.append(
      h("div", { class: "empty-state" }, [
        h("h3", { text: "No trips yet" }, []),
        h("p", { text: "Start one, and the places you add will gather here." }, []),
      ]),
    );
  }

  return h("div", { class: "screen" }, [
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
  ]);
}

function tripCard(trip) {
  const dayOf = daysBetween(trip.start_date, todayIso()) + 1;
  const total = daysBetween(trip.start_date, trip.end_date) + 1;
  const pct = trip.stopCount ? Math.round((trip.visitedCount / trip.stopCount) * 100) : 0;

  return h("button", { class: "trip-card", onclick: () => openTrip(trip.id) }, [
    h("div", { class: "trip-card-map", html: window.__CARD_MAP__ }, [
      h("span", { class: "trip-card-day", text: "DAY " + dayOf + " OF " + total }, []),
    ]),
    h("div", { class: "trip-card-body" }, [
      h("div", { class: "trip-card-name", text: trip.name }, []),
      h("div", { class: "trip-card-sub", text: trip.subtitle }, []),
      h("div", { class: "trip-card-foot" }, [
        avatars(trip.members),
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
    past ? null : avatars(trip.members, true),
  ]);
}

/* ------------------------------------------------------------- new trip */

function openNewTrip() {
  openLayer(() => { state.newTrip = null; showTrips(); });
  const start = new Date();
  state.newTrip = { name: "", start: null, end: null, month: new Date(start.getFullYear(), start.getMonth(), 1) };
  state.screen = "newTrip";
  render();
  const field = $("trip-name");
  if (field) field.focus();
}

function screenNewTrip() {
  const draft = state.newTrip;
  const ready = draft.name.trim() && draft.start && draft.end;

  const months = h("div", { style: "flex-grow:1;overflow-y:auto;padding:0 12px;position:relative" }, []);
  for (let i = 0; i < 6; i++) {
    const month = new Date(draft.month.getFullYear(), draft.month.getMonth() + i, 1);
    months.append(monthGrid(month, i === 0));
  }

  return h("div", { class: "screen" }, [
    h("div", { class: "top-bar" }, [
      h("button", { class: "icon-btn", onclick: closeLayer }, [icon("close")]),
      h("div", { class: "top-bar-title", text: "New trip" }, []),
    ]),
    h("div", { style: "padding:0 18px 12px;flex-shrink:0" }, [
      h("div", { class: "ask", text: "Where are we going?" }, []),
      h("div", { class: "underlined" }, [
        h("input", {
          id: "trip-name",
          placeholder: "Give the trip a name",
          value: draft.name,
          autocomplete: "off",
          oninput: (e) => { draft.name = e.target.value; const b = $("create"); if (b) b.disabled = !(draft.name.trim() && draft.start && draft.end); },
        }, []),
      ]),
    ]),
    h("div", { style: "padding:0 18px 8px;flex-shrink:0" }, [
      h("div", { class: "ask small", text: "And when?" }, []),
    ]),
    months,
    h("div", { class: "new-trip-foot" }, [
      h("div", { class: "range-line" }, [
        icon("calendar"),
        h("span", { class: "r", text: draft.start && draft.end ? rangeLabel(draft.start, draft.end) : "Pick the days" }, []),
        h("span", {
          class: "n",
          text: draft.start && draft.end ? daysBetween(draft.start, draft.end) + 1 + " days" : "",
        }, []),
      ]),
      h("button", { class: "btn-dark", id: "create", disabled: !ready, onclick: createTrip }, ["Create trip"]),
    ]),
  ]);
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

function monthGrid(month, first) {
  const draft = state.newTrip;
  const year = month.getFullYear();
  const index = month.getMonth();
  const lead = new Date(year, index, 1).getDay();
  const length = new Date(year, index + 1, 0).getDate();

  const head = h("div", { class: "cal" }, DOW.map((d) => h("span", { class: "dw", text: d }, [])));
  const grid = h("div", { class: "cal" }, []);
  for (let i = 0; i < lead; i++) grid.append(h("button", { class: "off", disabled: true }, []));

  for (let day = 1; day <= length; day++) {
    const iso = year + "-" + String(index + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const isStart = iso === draft.start;
    const isEnd = iso === draft.end;
    const inRange = draft.start && draft.end && iso > draft.start && iso < draft.end;

    let cls = "";
    if (isStart) cls = "s";
    else if (isEnd) cls = "e";
    else if (inRange) cls = "in";
    if (isStart && isEnd) cls = "s e";

    grid.append(
      h("button", { class: cls, onclick: () => pickDay(iso) },
        isStart || isEnd
          ? [h("span", { class: "cap", text: String(day) }, [])]
          : [String(day)]),
    );
  }

  return h("div", {}, [
    h("div", { class: "month-name", style: first ? "padding-top:2px" : "", text: MONTH_NAMES[index] + " " + year }, []),
    head,
    grid,
  ]);
}

function pickDay(iso) {
  const draft = state.newTrip;
  // First tap sets the start. Second extends to an end, unless it is earlier,
  // in which case it becomes the new start.
  if (!draft.start || (draft.start && draft.end)) { draft.start = iso; draft.end = null; }
  else if (iso < draft.start) { draft.start = iso; }
  else { draft.end = iso; }
  render();
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
function screenSignIn() {
  return h("div", { class: "screen signin" }, [
    h("div", { class: "signin-map", html: window.__SIGNIN_MAP__ }, []),
    h("div", { class: "signin-body" }, [
      h("div", { class: "signin-head" }, [
        h("div", { class: "signin-title", html: "Your trip,<br>on one map" }, []),
        h("div", {
          class: "signin-sub",
          text: "Everywhere you meant to go, grouped by day, greying out as you get there. Shared with whoever is coming.",
        }, []),
      ]),
      h("span", { style: "flex-grow:1" }, []),
      state.error ? h("div", { class: "err", style: "padding:0 0 10px", text: state.error }, []) : null,
      h("button", {
        class: "signin-google",
        disabled: state.signingIn,
        onclick: signInWithGoogle,
      }, [
        icon("googleG", "signin-g"),
        h("span", { text: state.signingIn ? "Taking you to Google…" : "Continue with Google" }, []),
      ]),
      h("div", { class: "signin-promise" }, [
        icon("shield"),
        h("span", {
          text: "We ask for your name and email, nothing else. Photos and files stay on your device until you attach one.",
        }, []),
      ]),
    ]),
  ]);
}

/**
 * Hand off to Google.
 *
 * Better Auth answers with the URL to send the browser to rather than
 * redirecting the fetch, because a redirect on an XHR would be followed by the
 * browser and land the consent screen inside a JSON parse.
 */
async function signInWithGoogle() {
  state.signingIn = true;
  state.error = null;
  render();
  try {
    const data = await post("/api/auth/sign-in/social", { provider: "google", callbackURL: "/" });
    if (!data.url) throw new Error("sign-in did not come back with anywhere to go");
    window.location.href = data.url;
  } catch (error) {
    state.signingIn = false;
    state.error = error.message;
    render();
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
  state.screen = "trips";
  state.trip = null;
  render();
  api("/api/trips").then((data) => {
    if (state.screen !== "trips") return;
    state.trips = data.trips;
    state.me = data.me;
    render();
  }).catch(() => {});
}

async function openTrip(tripId) {
  openLayer(showTrips);
  state.trip = await api("/api/trips/" + tripId);
  const today = todayIso();
  const todayDay = state.trip.days.find((d) => d.date === today);
  state.openDayId = todayDay ? todayDay.id : (state.trip.days[0] || {}).id || null;
  state.selectedStopId = null;
  state.screen = "trip";
  render();
}

async function refreshTrip() {
  if (!state.trip) return;
  state.trip = await api("/api/trips/" + state.trip.trip.id);
  render();
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
 * - **Somewhere you sleep is never dimmed and never recoloured.** A hotel is
 *   where the day begins and ends, so it stays solid green with a roof on it
 *   whatever is selected and whatever day is open. It carries a roof instead
 *   of a number because it is not a stop on the route.
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
  /**
   * The one green that never changes. The deepest step of the day ramp, which
   * is also day one's colour, so a hotel reads as part of the same family
   * rather than as a fifth colour.
   */
  bed: "#3F6B4A",
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
function pinLook(day, stop, open, number) {
  const st = statusOf(day, stop);
  const selected = stop.id === state.selectedStopId;
  const anySelected = Boolean(state.selectedStopId);

  if (stop.accommodation) {
    return {
      fill: PIN.bed,
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
  let opacity = past && !open ? 0.5 : 1;
  if (anySelected && !selected) opacity = Math.min(opacity, open ? 0.75 : 0.3);

  return {
    fill: past ? STATUS_FILL.done : day.hue,
    size: selected ? PIN.selected : open ? PIN.full : PIN.mini,
    ring: selected ? "#33302B" : "#FFFCF6",
    opacity,
    roof: false,
    // Only the open day is big enough to read a number in.
    number: open ? (number || null) : null,
    z: selected ? 40 : open ? 20 : 10,
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
      avatars(trip.members),
      h("button", { class: "round-btn", title: "Invite someone" }, [icon("invite")]),
    ]),
    h("div", { class: "map" }, [
      // The real map when a browser key is configured; the drawn one from the
      // artboards otherwise, so the screen is never a grey rectangle.
      mapsKey()
        ? h("div", { id: "gmap", style: "position:absolute;inset:0" }, [])
        : h("div", { style: "position:absolute;inset:0", html: window.__MAP__ }, []),
      ...(mapsKey() || state.search ? [] : mapPins(openDay)),
      ...searchMapLayer(),
      state.search ? null : hasStops ? mapLegend() : emptyMapChip(),
      h("div", { class: "map-controls" }, [
        h("button", {}, [icon("layers")]),
        h("button", {}, [icon("locate")]),
      ]),
    ]),
    h("div", { class: "sheet stops" + (full ? " full" : ""), id: "sheet" }, [
      grabber(),
      // SheetFull.dc.html titles this row "All stops". The title is
      // deliberately not here: the collapsed sheet has no header at all, so a
      // heading that appears only on expanding reads as the sheet becoming a
      // different screen. The control it sat beside is the useful half.
      full
        ? h("div", { class: "all-stops" }, [
            h("button", {
              class: "filter-pill",
              "aria-pressed": state.hideVisited ? "true" : "false",
              onclick: () => { state.hideVisited = !state.hideVisited; render(); },
            }, [state.hideVisited ? "Not visited" : "Filter"]),
          ])
        : null,
      h("div", { class: "sheet-scroll" }, sheetContents(hasStops)),
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

/* ------------------------------------------------------- the search map */

/**
 * What the map shows while a search is open, from design/PlaceSearch.dc.html:
 * the stops already on the trip as small green pins, the bias circle dashed in
 * terracotta, and the result being looked at as one bigger terracotta pin.
 *
 * On the drawn map the circle is given a fixed drawn radius and every point is
 * placed against it, so a result inside the circle looks inside it and one
 * outside looks outside. That is the whole meaning the circle carries.
 */
/** Sized to the band the sheet leaves, so the whole circle is on screen. */
function drawnCircleRadius() {
  return Math.max(28, Math.min(62, visibleMapHeight() / 2 - 16));
}

function searchMapLayer() {
  const s = state.search;
  if (!s || mapsKey()) return [];

  const out = [];

  if (s.bias) out.push(h("div", { class: "bias-circle" }, []));

  for (const pin of s.pins || []) {
    out.push(h("div", {
      class: "trip-pin",
      "data-lat": String(pin.lat),
      "data-lng": String(pin.lng),
    }, []));
  }

  const looking = s.rows.find((r) => r.placeId === s.lookingAt);
  if (looking && looking.location) {
    for (const cls of ["pin-halo", "result-pin"]) {
      out.push(h("div", {
        class: cls,
        "data-lat": String(looking.location.lat),
        "data-lng": String(looking.location.lng),
      }, []));
    }
  }
  return out;
}

/**
 * Positions the search map layer.
 *
 * It runs after the frame is assembled, not while it is being built: the sheet
 * that decides how much map is visible does not exist yet during the build,
 * and measuring then put the circle behind it.
 */
function paintSearchMap() {
  const s = state.search;
  if (!s || mapsKey()) return;

  const centre = { x: 50, y: 52 };
  const radius = drawnCircleRadius();
  const middle = middleOfMap(centre);

  const circle = document.querySelector(".bias-circle");
  if (circle) {
    circle.style.left = centre.x + "%";
    circle.style.top = middle + "px";
    circle.style.width = radius * 2 + "px";
    circle.style.height = radius * 2 + "px";
  }

  for (const el of document.querySelectorAll("[data-lat]")) {
    const point = { lat: Number(el.dataset.lat), lng: Number(el.dataset.lng) };
    const at = s.bias
      ? againstCircle(s.bias, point, centre)
      // No circle means no scale, so the place being looked at simply sits in
      // the middle, which is what centring on it means.
      : (el.classList.contains("trip-pin") ? null : { x: centre.x, y: middle });

    if (!at) { el.hidden = true; continue; }
    el.hidden = false;
    el.style.left = at.x + "%";
    el.style.top = at.y + "px";
  }
}

/**
 * Places a point relative to the bias circle. Returns a percentage across and
 * a pixel offset down, because the map strip is short and a percentage down it
 * would put everything on top of everything else.
 */
/**
 * The map runs the whole height of the frame, but the search sheet covers all
 * but the top ~138px of it. Placing anything against the map's own height puts
 * it behind the sheet, which is where the circle was going.
 */
function visibleMapHeight() {
  const host = document.querySelector(".map");
  if (!host) return 138;
  const map = host.getBoundingClientRect();
  // The search sheet, not the day sheet underneath it. Querying ".sheet" gets
  // whichever is first in the DOM, which is the wrong one while searching and
  // put the circle behind it.
  const sheet = $("search-sheet") || document.querySelector(".sheet");
  if (!sheet) return map.height;
  return Math.max(60, sheet.getBoundingClientRect().top - map.top);
}

function middleOfMap(centre) {
  return (centre.y / 100) * visibleMapHeight();
}

function againstCircle(bias, point, centre) {
  const host = document.querySelector(".map");
  const width = host ? host.getBoundingClientRect().width : 375;
  const middle = middleOfMap(centre);

  if (!bias || !point) return null;

  const metresPerDegLat = 111320;
  const metresPerDegLng = 111320 * Math.cos((bias.center.lat * Math.PI) / 180);
  const east = (point.lng - bias.center.lng) * metresPerDegLng;
  const north = (point.lat - bias.center.lat) * metresPerDegLat;

  // The circle is the bias radius, so the scale follows from it. Anything far
  // outside is pulled to the edge rather than off the map entirely.
  const scale = drawnCircleRadius() / bias.radius;
  let dx = east * scale;
  let dy = -north * scale;
  const reach = Math.hypot(dx, dy);
  const limit = Math.min(width / 2 - 14, visibleMapHeight() / 2 - 14);
  if (reach > limit) { dx = (dx / reach) * limit; dy = (dy / reach) * limit; }

  return { x: centre.x + (dx / width) * 100, y: middle + dy };
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
async function paintMap() {
  if (!mapsKey()) return;
  const host = $("gmap");
  if (!host) return;

  const maps = await loadMaps();
  if (!maps) {
    // Fall back to the drawn map for the rest of the session.
    window.__MAPS_KEY__ = "";
    render();
    return;
  }

  if (!gmap || gmap.getDiv() !== host) {
    gmap = new maps.Map(host, {
      center: { lat: 33.5904, lng: 130.4017 },
      zoom: 13,
      styles: window.__MAP_STYLE__,
      disableDefaultUI: true,
      clickableIcons: false,
      keyboardShortcuts: false,
      gestureHandling: "greedy",
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

  for (const day of state.trip.days) {
    const open = day.id === state.openDayId;
    const numbers = open ? routeNumbers(day) : {};

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
        state.selectedStopId = stop.id === state.selectedStopId ? null : stop.id;
        state.menuOpen = false;
        render();
      });
      gmarkers.push(marker);
      bounds.extend(stop.location);
      if (open) { focus.extend(stop.location); focused++; }
    }
  }

  if (!gmarkers.length) return;

  // The sheet covers the lower half, so the pins are fitted into the band
  // above it rather than into the whole viewport.
  const sheet = $("sheet");
  const covered = sheet ? sheet.getBoundingClientRect().height : 0;
  gmap.fitBounds(focused ? focus : bounds, { top: 60, right: 40, bottom: covered + 20, left: 40 });
  if ((focused ? focused : gmarkers.length) === 1) gmap.setZoom(15);
}

/**
 * Centres the real map on a search result and marks it with the terracotta pin
 * the artboard draws. The pin is separate from the trip's own markers, because
 * the place is not on the trip yet.
 */
let lookMarker = null;

async function centreOnResult(row) {
  const maps = await loadMaps();
  if (!maps || !gmap || !row.location) return;

  if (lookMarker) lookMarker.setMap(null);
  lookMarker = new maps.Marker({
    position: row.location,
    map: gmap,
    title: row.name,
    icon: { url: window.__LOOK_PIN__ },
    zIndex: 3,
  });

  gmap.panTo(row.location);
  gmap.setZoom(16);
}

function clearLookMarker() {
  if (lookMarker) { lookMarker.setMap(null); lookMarker = null; }
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
function mapPins(day) {
  if (!day) return [];
  const located = day.stops.filter((s) => s.location);
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
  const numbers = routeNumbers(day);

  return located.map((stop) => {
    const look = pinLook(day, stop, true, numbers[stop.id]);
    const x = 16 + ((stop.location.lng - minLng) / spanLng) * 68;
    const y = 40 - ((stop.location.lat - minLat) / spanLat) * 26;
    return h("div", {
      class: "pin",
      style: "left:" + x + "%;top:" + y + "%;opacity:" + look.opacity + ";z-index:" + look.z,
      title: stop.title,
    }, [
      h("i", {
        style: "width:" + look.size + "px;height:" + look.size + "px;background:" + look.fill +
          ";border-color:" + look.ring + ";font-size:" + Math.round(look.size * 0.58) + "px",
        html: look.roof ? ICONS.houseWhite : null,
        text: look.roof ? null : (look.number ? String(look.number) : null),
      }, []),
    ]);
  });
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

    wrap.append(
      h("button", {
        class: open ? "day-head open" : "day-head",
        "data-day-id": day.id,
        onclick: () => { state.openDayId = open ? null : day.id; state.selectedStopId = null; render(); },
      }, [
        h("span", { class: "day-hue", style: "background:" + day.hue }, []),
        h("div", { class: "day-head-text" }, [
          h("div", { class: "day-head-top" }, [
            h("span", { class: "day-label", text: day.label }, []),
            day.date === todayIso() ? h("span", { class: "today-tag", text: "TODAY" }, []) : null,
          ]),
          day.place_label ? h("span", { class: "day-place", text: day.place_label }, []) : null,
        ]),
        h("span", { class: "drop-here", text: "DROP HERE TO MOVE", hidden: true }, []),
        h("span", { class: "day-progress", text: done + "/" + day.stops.length }, []),
        h("span", { style: "display:flex;transform:rotate(" + (open ? 0 : -90) + "deg)", html: ICONS.chevron }, []),
      ]),
    );

    if (open) {
      if (!hasStops) wrap.append(emptyDayBody());
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
        body.append(
          h("button", { class: "add-stop", onclick: () => openSearch(day.id) }, [icon("plusGrey")]),
        );
        wrap.append(body);
      }
    }
    out.push(wrap);
  }

  const unplanned = trip.unplanned;
  out.push(
    h("div", { class: "day-wrap drop-zone", "data-day-id": "unplanned" }, [
      h("button", {
        class: "day-head",
        "data-day-id": "unplanned",
        onclick: () => { state.openDayId = "unplanned"; render(); },
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
    ]),
  );

  return out;
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
        h("span", {
          class: stop.accommodation ? "stop-index bed" : "stop-index",
          style: "color:" + (stop.accommodation ? PIN.bed : done ? STATUS_FILL.done : day.hue) +
            ";border-color:" + (stop.accommodation ? PIN.bed : done ? STATUS_FILL.done : day.hue),
          html: stop.accommodation ? ICONS.houseHue : null,
          text: stop.accommodation ? null : String(number),
        }, []),
        showTimes
          ? h("span", {
              class: "stop-time",
              style: "color:" + (done ? "#BDB4A7" : st === "now" ? "#4E7A4B" : "#96752F"),
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
        h("span", {
          class: "stop-dot",
          style: "background:" + STATUS_FILL[st] + ";border-color:" + STATUS_RING[st],
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
  state.trayOpen = true;
  // The drag is live, so this cannot go through render(): that would replace
  // the handle and the card in the air. The class is the whole of the change.
  dock.classList.add("open");
  const panel = $("tray-drawer");
  if (panel) panel.classList.add("open");
}

function resolveDropTarget(x, y) {
  const drag = state.drag;
  const wraps = [...document.querySelectorAll(".drop-zone[data-day-id]")];

  drag.outside = false;
  reachForDrawer(x);

  let hit = null;
  for (const wrap of wraps) {
    const rect = wrap.getBoundingClientRect();
    if (y < rect.top || y > rect.bottom) continue;
    // A sheet stacks its days, so where the finger is across them says
    // nothing. The Planner's columns sit side by side and share every y, so
    // there the horizontal is the whole answer to which day this is.
    if (wrap.dataset.grid && (x < rect.left || x > rect.right)) continue;
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
  if (drag) { drag.hoverDayId = null; drag.hoverStart = 0; }
  shrinkLifted(0);
}

function hoverTick() {
  const drag = state.drag;
  if (!drag || !drag.hoverDayId) { endHover(); return; }

  const elapsed = performance.now() - drag.hoverStart;
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
  const drag = state.drag;
  endHover();
  state.openDayId = dayId === "unplanned" ? "unplanned" : dayId;
  render();
  // The day has real rows now, so work out which two it would land between.
  if (state.drag) { resolveDropTarget(0, state.drag.y); paintDrag(); }
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
      h("a", {
        class: "action dark",
        href: stop.navigateUrl || "#",
        target: "_blank",
        rel: "noreferrer",
      }, [icon("navigateLight"), "Navigate"]),
      h("button", {
        class: done ? "action on" : "action",
        onclick: () => optimistic(
          () => {
            const target = findStop(stop.id);
            const previous = target ? target.status : null;
            if (target) target.status = done ? "planned" : "visited";
            return () => { if (target && previous !== null) target.status = previous; };
          },
          () => post("/api/stops/" + stop.id + "/visited", { visited: !done }),
          done ? "That did not un-tick" : "That did not tick off",
        ),
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
      item("pinInk", "Map view", {
        on: state.view === "map",
        // This menu, and the Plan view under it if it is showing. The Plan
        // layer's own close is what puts the map back.
        onclick: () => closeTo(state.view === "plan" ? 2 : 1),
      }),
      item("grid", "Plan view", {
        on: state.view === "plan",
        // Close the menu, and open the Plan view once that has landed rather
        // than on top of a traversal that is still on its way.
        onclick: () => (state.view === "plan" ? closeLayer() : closeThen(1, showPlan)),
      }),
      h("div", { class: "rule" }, []),
      item("arrowLeft", "Back to trips", {
        // The menu and the trip, in one traversal, clamped to what we pushed.
        // showTrips is the trip layer's own close, so it re-reads the list.
        onclick: () => closeTo(2),
      }),
    ]),
  ];
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
  openLayer(() => { state.search = null; clearLookMarker(); render(); });
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

function sheetSearch() {
  const s = state.search;

  const results = h("div", { class: "results", id: "results" }, []);
  renderResults(results);

  return h("div", { class: "sheet", id: "search-sheet", style: "height:529px" }, [
    dismissGrabber("search-sheet", closeSearch),
    h("div", { class: "search-head" }, [
      searchTarget(),
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
      h("div", { class: "chips" }, [
        s.bias && s.bias.label
          ? h("div", { class: "chip" }, [
              icon("pinChip"),
              h("span", { text: s.bias.label }, []),
              icon("chevronSmall"),
            ])
          : null,
        s.bias ? h("div", { class: "chip plain", text: Math.round(s.bias.radius / 1000) + " km" }, []) : null,
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
    if (ticket !== searchTicket) return;
    s.rows = data.results;
    s.bias = data.bias;
    s.pins = data.pins || [];
    // A new set of results is a new set of places; nothing is being looked at.
    if (!s.rows.some((r) => r.placeId === s.lookingAt)) s.lookingAt = null;
    s.note = data.results.length ? null : "Nothing found for that.";
  } catch (error) {
    if (ticket !== searchTicket) return;
    s.rows = [];
    s.note = error.message;
  }
  s.busy = false;
  render();
  const field = $("q");
  if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
}

function renderResults(container) {
  if (!container) return;
  const s = state.search;
  container.replaceChildren();

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
  );
}

function resultRow(row) {
  if (row.onTrip) {
    return h("div", { class: "result on-trip" }, [
      h("div", { class: "result-tile yellow" }, [icon("pinDot")]),
      h("div", { class: "result-text" }, [
        h("span", { class: "result-name", text: row.name }, []),
        h("span", { class: "result-meta", text: "Already on " + row.onTripDay }, []),
      ]),
      h("span", { class: "result-tag", text: "On trip" }, []),
    ]);
  }

  const looking = state.search.lookingAt === row.placeId;

  // A result beyond the circle is dimmed and says how far, and is added the
  // same way as any other. The bias ranks results; it has never restricted
  // them, and the UI must not restrict them either (PLAN.md section 4b).
  return h("div", {
    class: "result" + (row.outside ? " far" : "") + (looking ? " looking" : ""),
  }, [
    // The row itself looks at the place; only the button adds it.
    h("button", {
      class: "result-tap",
      onclick: () => lookAt(row),
      title: "Show on the map",
    }, [
      h("div", { class: "result-tile" + (row.outside ? " grey" : "") }, [
        icon(row.outside ? "bowlGrey" : "bowl"),
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
 * to "On trip" straight away. The walking time on it is left to the re-read,
 * because that depends on the neighbour it lands next to and the server is
 * what works it out.
 */
function addPlace(row) {
  const s = state.search;
  const day = state.trip.days.find((d) => d.id === s.dayId);
  const list = day ? day.stops : state.trip.unplanned;

  optimistic(
    () => {
      const provisional = {
        id: "pending_" + row.placeId,
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
        row.onTrip = false;
        row.onTripDay = null;
      };
    },
    () => post("/api/trips/" + state.trip.trip.id + "/stops", {
      placeId: row.placeId, dayId: s.dayId, startTime: s.startTime,
    }),
    "That place did not save",
  );
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
  openLayer(showMap);
  state.view = "plan";
  state.selectedStopId = null;
  state.trayOpen = false;
  planDay();
  render();
}

/** The way out of the Plan view, through the history rather than around it. */
function leavePlan() {
  if (state.view === "plan") closeLayer();
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
    avatars(trip.members),
    h("button", { class: "round-btn", title: "Invite someone" }, [icon("invite")]),
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
      onclick: () => { state.planDayId = day.id; state.selectedStopId = null; render(); },
    }, [
      h("span", { class: "rail-hue", style: "background:" + day.hue }, []),
      h("span", { text: on ? day.label : shortLabel(day.label) }, []),
    ]);
  }));
}

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
  const end = (e) => {
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", cancel);
    if (!live) return;
    live = false;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    stepDay(dx < 0 ? 1 : -1);
  };

  const cancel = () => {
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", cancel);
    live = false;
  };

  el.addEventListener("pointerdown", (e) => {
    if (state.drag) return;
    x = e.clientX; y = e.clientY; live = true;
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
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
      : planBar("Plan view · day " + (from + 1) + " of " + total),
    wide ? null : dayRail(),
    h("div", { class: "grid-main" }, [
      h("div", { class: "grid-days" }, [
        gridHeaders(days, wide),
        lodgingRow(days),
        gridScroll(days, span, band, wide),
      ]),
      trayDrawer(wide),
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
      text: state.trip.trip.name,
    }, []),
    h("div", { class: "segmented" }, [
      h("button", { onclick: leavePlan }, ["Map"]),
      h("button", { class: "on" }, ["Planner"]),
      h("button", { disabled: true, title: "The list view is not built yet" }, ["List"]),
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
    h("button", {
      class: "desk-share", disabled: true, title: "Sharing a trip is not built yet",
      style: "opacity:0.45",
    }, ["Share"]),
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

function gridScroll(days, span, band, wide) {
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

  const scroll = h("div", { class: "grid-scroll" }, [
    h("div", { class: "grid-inner", style: "height:" + height + "px" }, [
      gutter,
      lines,
      // The last columns hang their popover to the left, where there is room.
      ...days.map((day, i) => gridColumn(day, span, band, i >= days.length - 2)),
    ]),
  ]);

  // One column is one day, so sideways across it means the next one. A desk
  // showing a week has a pager instead, and a swipe there would be ambiguous.
  if (!wide) swipeDays(scroll);
  return scroll;
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
    onclick: (event) => {
      // A click on the empty grid plans something into that hour. A click on
      // a card is the card's own.
      if (event.target.closest(".gcard")) return;
      if (suppressTap) { suppressTap = false; return; }
      if (state.selectedStopId) { state.selectedStopId = null; render(); return; }
      const y = event.clientY - col.getBoundingClientRect().top;
      if (y > span.height) return;
      openSearch(day.id, PLAN.formatClock(PLAN.gridTime(span, y)));
    },
  }, []);

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
    if (PLAN.minutesOf(stop.time)) continue;
    col.append(gridCard(day, stop, { top: span.height + 20 + row * 42, height: 38 }, "untimed"));
    row++;
  }

  return col;
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
    style: "top:" + box.top + "px;height:" + box.height + "px",
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
            text: kind === "untimed" ? sub : [stop.time, sub].filter(Boolean).join(" · "),
          }, [])
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
            onclick: () => { state.trayOpen = false; render(); },
          }, [icon("close")]),
    ]),
    h("div", { class: "tray-side-list drop-zone open", "data-day-id": "unplanned" },
      all.length
        ? all.map((stop) => trayCard(stop, true))
        : [h("span", { class: "tray-empty", text: "Nothing waiting. Anything you add without a date lands here." }, [])]),
    h("div", { class: "tray-side-foot" }, [
      h("button", { class: "add-place", onclick: () => openSearch("unplanned") }, [
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
      onclick: () => { state.trayOpen = !state.trayOpen; render(); },
    }, [
      h("span", { class: "tray-tab-count", text: String(all.length) }, []),
      h("span", { class: "tray-tab-label", text: "TO BE PLANNED" }, []),
    ]),
    open ? h("div", { class: "tray-scrim", onclick: () => { state.trayOpen = false; render(); } }, []) : null,
    panel,
  ]);
}

/* ------------------------------------------------ dropping on to an hour */

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
  return { from: from, to: to, height: ((to - from) * PLAN.PX_PER_HOUR) / 60 };
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
  try {
    const data = await api("/api/trips");
    state.trips = data.trips;
    state.me = data.me;
    render();
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
