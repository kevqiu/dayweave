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
  if (!res.ok) throw new Error(data.error || "request failed");
  return data;
}

const post = (path, body) =>
  api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/* ---------------------------------------------------------------- state */

const state = {
  screen: "trips",
  /* Inside a trip: the map and its sheet, or the Plan view (PLAN.md 4f). */
  view: "map",
  trips: [],
  trip: null,
  openDayId: null,
  planDayId: null,
  planPage: 0,
  trayFull: false,
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

/** True where the seven-column grid fits. Below this it is one day a screen. */
const WIDE = "(min-width: 1100px) and (min-height: 700px)";
const wideNow = () => window.matchMedia(WIDE).matches;
const planning = () => state.screen === "trip" && state.view === "plan";

function render() {
  const grid = planning() && wideNow();
  // The phone frame is 375 wide everywhere else in the app. The Planner at a
  // desk is the same view at another density (PLAN.md 4f), so the frame grows
  // to hold the grid and shrinks back on the way out.
  frame.classList.toggle("wide", grid);

  frame.replaceChildren();
  if (state.screen === "trips") frame.append(screenTrips());
  else if (state.screen === "newTrip") frame.append(screenNewTrip());
  else if (state.screen === "trip") {
    frame.append(planning() ? (grid ? screenGrid() : screenPlan()) : screenTrip());
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
}

// The two densities are one view, so crossing the width re-renders into the
// other one rather than leaving a phone layout stretched across a desk.
window.matchMedia(WIDE).addEventListener("change", () => { if (planning()) render(); });

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

function openLayer(close) {
  backStack.push(close);
  history.pushState({ depth: backStack.length }, "");
}

/** What every X, scrim and Cancel calls. */
function closeLayer() {
  if (backStack.length) history.back();
}

window.addEventListener("popstate", () => {
  const close = backStack.pop();
  // Nothing of ours left: this is the trip list, and back leaves the app.
  if (close) close();
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
      h("button", { class: "me-avatar", text: state.me ? state.me.initials : "" }, []),
    ]),
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

function mapLegend() {
  const key = (color, ink, label) =>
    h("span", { class: "k", style: "color:" + ink }, [
      h("i", { style: "background:" + color }, []),
      label,
    ]);
  return h("div", { class: "map-chip" }, [
    key("#6F9A6B", "#4E7A4B", "today"),
    key("#E0B355", "#96752F", "ahead"),
    key("#BDB4A7", "#9A9184", "done"),
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

  const day = state.trip.days.find((d) => d.id === state.openDayId);
  const stops = day ? day.stops.filter((s) => s.location) : [];
  if (!stops.length) return;

  const bounds = new maps.LatLngBounds();
  for (const stop of stops) {
    const status = statusOf(day, stop);
    const selected = stop.id === state.selectedStopId;
    const icon = window.__PIN__[status][selected ? "selected" : "plain"];
    const marker = new maps.Marker({
      position: stop.location,
      map: gmap,
      title: stop.title,
      icon: { url: icon },
      zIndex: selected ? 2 : 1,
    });
    marker.addListener("click", () => {
      state.selectedStopId = selected ? null : stop.id;
      state.menuOpen = false;
      render();
    });
    gmarkers.push(marker);
    bounds.extend(stop.location);
  }

  // The sheet covers the lower half, so the pins are fitted into the band
  // above it rather than into the whole viewport.
  const sheet = $("sheet");
  const covered = sheet ? sheet.getBoundingClientRect().height : 0;
  gmap.fitBounds(bounds, { top: 60, right: 40, bottom: covered + 20, left: 40 });
  if (stops.length === 1) gmap.setZoom(15);
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

  return located.map((stop) => {
    const st = statusOf(day, stop);
    const selected = stop.id === state.selectedStopId;
    const size = selected ? 26 : 20;
    const x = 16 + ((stop.location.lng - minLng) / spanLng) * 68;
    const y = 40 - ((stop.location.lat - minLat) / spanLat) * 26;
    return h("div", {
      class: "pin",
      style: "left:" + x + "%;top:" + y + "%",
      title: stop.title,
    }, [
      h("i", {
        style: "width:" + size + "px;height:" + size + "px;background:" + STATUS_FILL[st] +
          ";border-color:" + (selected ? "#33302B" : "#FFFCF6"),
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
        const body = h("div", { class: "day-body" }, shown.map((stop) => stopCard(day, stop, showTimes)));
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

function stopCard(day, stop, showTimes) {
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

    state.drag = {
      stopId: stop.id,
      fromDayId: day.id,
      title: stop.title,
      description: stop.description,
      y: event.clientY,
      targetDayId: day.id,
      afterStopId: undefined,
      gridTime: undefined,
      gridY: null,
      hoverDayId: null,
      hoverStart: 0,
      moved: false,
    };

    // The listeners go on the window, not on this button, and deliberately so:
    // starting a drag re-renders, which replaces this element and would throw
    // away a pointer capture held on it. Nothing would move and nothing would
    // drop. The window survives every render.
    const move = (e) => {
      if (!state.drag) return;
      state.drag.moved = true;
      state.drag.y = e.clientY;
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
      if (drag.moved) commitDrag(drag);
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
function resolveDropTarget(x, y) {
  const drag = state.drag;
  const wraps = [...document.querySelectorAll(".drop-zone[data-day-id]")];

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
  if (!hit) { endHover(); return; }

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

  const top = drag.y - frame.getBoundingClientRect().top - 23;
  card.style.top = top + "px";
  card.style.left = "";
  card.style.width = "";

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
    h("div", { class: "sheet modal", style: "height:auto" }, [
      h("div", { class: "grabber", onclick: close }, [h("i", {}, [])]),
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
        // Two entries to unwind when the Plan view is showing: this menu, and
        // the Plan view itself. Its own close is what puts the map back.
        onclick: () => {
          closeLayer();
          if (state.view === "plan") setTimeout(closeLayer, 0);
        },
      }),
      item("grid", "Plan view", {
        on: state.view === "plan",
        onclick: () => {
          closeLayer();
          if (state.view !== "plan") setTimeout(showPlan, 0);
        },
      }),
      h("div", { class: "rule" }, []),
      item("arrowLeft", "Back to trips", {
        onclick: () => {
          // Close the menu, then the trip: two entries, so back and this
          // button leave the history in the same place. showTrips re-reads.
          closeLayer();
          setTimeout(closeLayer, 0);
        },
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
    h("div", { class: "sheet modal", style: "max-height:92%" }, [
      h("div", { class: "grabber", onclick: close }, [h("i", {}, [])]),
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
    h("div", { class: "grabber", onclick: closeSearch }, [h("i", {}, [])]),
    h("div", { class: "search-head" }, [
      // The way out, named. PlaceSearch.dc.html puts a bare X inside the field
      // instead, which reads as "clear what I typed" as readily as "leave".
      h("button", { class: "back-to-trip", onclick: closeSearch }, [
        icon("arrowLeftSoft"),
        h("span", { text: "Back to trip" }, []),
      ]),
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
  state.trayFull = false;
  planDay();
  render();
}

/** The way out of the Plan view, through the history rather than around it. */
function leavePlan() {
  if (state.view === "plan") closeLayer();
}

function showMap() {
  state.view = "map";
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
  state.planPage = Math.floor(Math.max(0, planIndex()) / GRID_DAYS) * GRID_DAYS;
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

function screenPlan() {
  const trip = state.trip;
  planDay();
  const day = trip.days.find((d) => d.id === state.planDayId);
  const at = planIndex() + 1;

  return h("div", { class: "screen plan" }, [
    planBar("Plan view · day " + at + " of " + trip.days.length),
    dayRail(),
    day ? dayClock(day) : h("div", { class: "err", text: "This trip has no days." }, []),
    planTray(),
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
 * The day as a clock: the time down the side, the rows beside it, and a
 * dashed slot wherever the day has a gap worth filling.
 */
function dayClock(day) {
  const rows = PLAN.planRows(day.stops.map((s) => ({ id: s.id, time: s.time, status: s.status })));
  const byId = {};
  rows.forEach((r) => { byId[r.id] = r; });

  const gutter = h("div", { class: "clock-gutter" }, day.stops.map((stop) =>
    h("button", {
      class: "clock-time" + (stop.time ? "" : " unset"),
      style: "height:" + byId[stop.id].height + "px",
      title: stop.time ? "Change the time" : "Set a time",
      onclick: () => openTime(stop),
    }, stop.time ? [stop.time] : [icon("plusTiny")])));

  const list = h("div", {
    class: "clock-list drop-zone open",
    "data-day-id": day.id,
  }, day.stops.map((stop) => planRow(day, stop, byId[stop.id])));

  list.append(
    h("button", { class: "add-stop", onclick: () => openSearch(day.id) }, [icon("plusGrey")]),
  );

  const body = h("div", { class: "day-clock" }, [
    day.stops.length ? gutter : null,
    day.stops.length ? h("div", { class: "clock-rule" }, []) : null,
    day.stops.length ? list : emptyClock(day),
  ]);

  swipeDays(body);
  return body;
}

function emptyClock(day) {
  return h("div", { class: "clock-list drop-zone open", "data-day-id": day.id }, [
    h("div", { class: "empty-state" }, [
      h("h3", { text: "Nothing on this day" }, []),
      h("p", { text: "Find somewhere to go, or drag something up from To be planned." }, []),
      h("div", { class: "empty-actions" }, [
        h("button", { class: "primary", onclick: () => openSearch(day.id) }, [
          icon("searchLight"), "Find a place",
        ]),
      ]),
    ]),
  ]);
}

function planRow(day, stop, row) {
  const done = statusOf(day, stop) === "done";
  const dragging = state.drag && state.drag.stopId === stop.id;

  const card = h("div", {
    class: "plan-row order-row" + (done ? " done" : "") + (dragging ? " ghost" : ""),
    "data-stop-id": stop.id,
    style: "height:" + row.height + "px",
  }, [
    h("div", { class: "plan-row-top" }, [
      dragHandle(day, stop),
      h("div", { class: "stop-text" }, [
        h("span", { class: "plan-name", text: stop.title }, []),
        h("span", {
          class: "plan-meta" + (stop.note ? " note" : ""),
          text: planMeta(stop),
        }, []),
      ]),
      h("span", {
        class: "plan-author",
        style: "background:" + stop.authorColor,
        text: stop.author,
        title: stop.author + " added this",
      }, []),
    ]),
    row.free
      ? h("button", {
          class: "free-slot",
          title: "Plan something into this gap",
          onclick: () => openSearch(day.id, row.freeAt),
        }, [h("span", { text: row.free }, []), icon("plusTiny")])
      : null,
  ]);
  return card;
}

/**
 * A note beats the derived line here, and is drawn darker for it: the artboard
 * writes "Booked 13:15, they release the table" in a stronger grey than the
 * "park / 12 min walk" beside it, because a person wrote it.
 */
function planMeta(stop) {
  return stop.note || stop.description || "";
}

/**
 * Days are swiped, PLAN.md 4f. A swipe has to be sideways and long enough to
 * be meant, so a scroll down the day never changes the day underneath it.
 */
function swipeDays(el) {
  let x = 0;
  let y = 0;
  let live = false;

  el.addEventListener("pointerdown", (e) => {
    if (state.drag) return;
    x = e.clientX; y = e.clientY; live = true;
  });
  el.addEventListener("pointerup", (e) => {
    if (!live) return;
    live = false;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    stepDay(dx < 0 ? 1 : -1);
  });
  el.addEventListener("pointercancel", () => { live = false; });
}

/**
 * The tray. PLAN.md 4f: To be planned has no good home anywhere else on a
 * phone, and here it sits directly under the day you are filling.
 */
function planTray() {
  const all = state.trip.unplanned;
  const full = state.trayFull;

  const head = h("div", { class: "tray-head" }, [
    h("span", { class: "tray-label", text: "TO BE PLANNED" }, []),
    h("span", { class: "tray-count", text: String(all.length) }, []),
    h("span", { style: "flex-grow:1" }, []),
    all.length
      ? h("button", {
          class: "tray-more",
          onclick: () => { state.trayFull = !full; render(); },
          text: full ? "collapse" : "pull up for all",
        }, [])
      : null,
    h("span", { class: "tray-sep" }, []),
    h("button", {
      class: "round-btn small",
      title: "Bringing in a My Map is not built yet",
      disabled: true,
      style: "opacity:0.45",
    }, [icon("pinChip")]),
  ]);

  const body = h("div", {
    class: full ? "tray-list drop-zone open" : "tray-strip drop-zone open",
    "data-day-id": "unplanned",
  }, all.length
    ? all.map((stop) => trayCard(stop, full))
    : [h("span", { class: "tray-empty", text: "Nothing waiting. Anything you add without a date lands here." }, [])]);

  const tray = h("div", { class: "plan-tray" + (full ? " full" : "") }, [
    h("div", {
      class: "grabber",
      onclick: () => { state.trayFull = !full; render(); },
    }, [h("i", {}, [])]),
    head,
    body,
  ]);
  return tray;
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
    h("div", { class: "sheet modal" }, [
      h("div", { class: "grabber", onclick: close }, [h("i", {}, [])]),
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

/** design/Planner.dc.html shows a week at a time and pages through the trip. */
const GRID_DAYS = 7;

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

function screenGrid() {
  planDay();
  const trip = state.trip;
  const total = trip.days.length;
  const from = Math.min(state.planPage, Math.max(0, total - GRID_DAYS));
  const days = trip.days.slice(from, from + GRID_DAYS);
  const span = PLAN.gridSpan(gridTimes(days));
  const band = bandHeight(days);

  return h("div", { class: "screen desk" }, [
    gridBar(from, total),
    h("div", { class: "grid-main" }, [
      h("div", { class: "grid-days" }, [
        gridHeaders(days),
        gridScroll(days, span, band),
      ]),
      traySide(),
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

function gridBar(from, total) {
  const page = (by) => {
    state.planPage = Math.min(Math.max(0, total - GRID_DAYS), Math.max(0, from + by * GRID_DAYS));
    render();
  };
  const last = Math.min(total, from + GRID_DAYS);

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
      h("button", { class: "sq-btn", onclick: () => page(-1), disabled: from === 0 }, [
        h("span", { style: "display:flex;transform:rotate(90deg)", html: ICONS.chevron }, []),
      ]),
      h("span", {
        class: "desk-range",
        text: "day " + (from + 1) + "–" + last + " of " + total,
      }, []),
      h("button", { class: "sq-btn", onclick: () => page(1), disabled: last >= total }, [
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

function gridHeaders(days) {
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
        h("div", { class: "gcol-top" }, [
          h("span", { class: "gcol-hue", style: "background:" + day.hue }, []),
          h("span", { class: "gcol-label", text: day.label }, []),
          isToday ? h("span", { class: "today-tag", text: "TODAY" }, []) : null,
        ]),
        h("div", { class: "gcol-sub" + (nothing ? " nothing" : ""), text: line }, []),
      ]);
    }),
  ]);
}

function gridScroll(days, span, band) {
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

  return h("div", { class: "grid-scroll" }, [
    h("div", { class: "grid-inner", style: "height:" + height + "px" }, [
      gutter,
      lines,
      // The last columns hang their popover to the left, where there is room.
      ...days.map((day, i) => gridColumn(day, span, band, i >= days.length - 2)),
    ]),
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
function traySide() {
  const all = state.trip.unplanned;
  return h("div", { class: "tray-side" }, [
    h("div", { class: "tray-side-head" }, [
      h("span", { class: "tray-label", text: "TO BE PLANNED" }, []),
      h("span", { style: "flex-grow:1" }, []),
      h("span", { class: "tray-count", text: String(all.length) }, []),
    ]),
    h("div", { class: "tray-side-list drop-zone open", "data-day-id": "unplanned" },
      all.length
        ? all.map((stop) => trayCard(stop, false))
        : [h("span", { class: "tray-empty", text: "Nothing waiting. Anything you add without a date lands here." }, [])]),
    h("div", { class: "tray-side-foot" }, [
      h("button", { class: "add-place", onclick: () => openSearch("unplanned") }, [
        icon("plusGrey"), "Add a place",
      ]),
    ]),
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
  const data = await api("/api/trips");
  state.trips = data.trips;
  state.me = data.me;
  render();
})();
`;
