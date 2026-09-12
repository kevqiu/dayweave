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
  trips: [],
  trip: null,
  openDayId: null,
  selectedStopId: null,
  menuOpen: false,
  search: null,
  newTrip: null,
  tripMenu: false,
  sheetFull: false,
  hideVisited: false,
  error: null,
  move: null,
  noteFor: null,
  preview: null,
};

const frame = $("frame");

function render() {
  frame.replaceChildren();
  if (state.screen === "trips") frame.append(screenTrips());
  else if (state.screen === "newTrip") frame.append(screenNewTrip());
  else if (state.screen === "trip") frame.append(screenTrip());
  if (state.search) frame.append(sheetSearch());
  if (state.tripMenu) frame.append(...tripMenu());
  if (state.move) frame.append(...sheetMove());
  if (state.noteFor) frame.append(...sheetNote());
}

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
      h("button", { class: "icon-btn", onclick: () => { state.screen = "trips"; render(); } }, [icon("close")]),
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
  await openTrip(trip.trip.id);
}

/* ------------------------------------------------------------------ trip */

async function openTrip(tripId) {
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

  return h("div", { class: "screen" }, [
    h("div", { class: "trip-bar" }, [
      h("div", { class: "trip-bar-text" }, [
        h("button", {
          style: "display:flex;align-items:center;gap:5px;background:none;border:0;padding:0;text-align:left;min-width:0",
          onclick: () => { state.tripMenu = true; render(); },
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
      h("div", { style: "position:absolute;inset:0", html: window.__MAP__ }, []),
      ...mapPins(openDay),
      hasStops ? mapLegend() : emptyMapChip(),
      h("div", { class: "map-controls" }, [
        h("button", {}, [icon("layers")]),
        h("button", {}, [icon("locate")]),
      ]),
    ]),
    h("div", { class: "sheet stops" + (full ? " full" : ""), id: "sheet" }, [
      grabber(),
      // The header the sheet grows into, from design/SheetFull.dc.html. It
      // belongs to the expanded state only; collapsed, the days start at the
      // handle as Main.dc.html draws them.
      full
        ? h("div", { class: "all-stops" }, [
            h("div", { class: "all-stops-title", text: "All stops" }, []),
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
    const wrap = h("div", { class: open ? "day-wrap open" : "day-wrap" }, []);
    const done = day.stops.filter((s) => statusOf(day, s) === "done").length;
    // The progress count stays honest: it counts the day, not what is shown.
    const shown = state.hideVisited
      ? day.stops.filter((s) => statusOf(day, s) !== "done")
      : day.stops;

    wrap.append(
      h("button", {
        class: open ? "day-head open" : "day-head",
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
    h("div", { class: "day-wrap" }, [
      h("button", { class: "day-head", onclick: () => { state.openDayId = "unplanned"; render(); } }, [
        h("span", { class: "day-hue", style: "background:#94897A" }, []),
        h("div", { class: "day-head-text" }, [
          h("div", { class: "day-head-top" }, [
            h("span", { class: "day-label", text: "To be planned" }, []),
          ]),
        ]),
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

  const card = h("div", { class: "stop" + (selected ? " selected" : "") + (done ? " done" : "") }, [
    h("button", {
      class: "stop-row",
      onclick: () => { state.selectedStopId = selected ? null : stop.id; state.menuOpen = false; render(); },
    }, [
      h("span", { style: "display:flex", html: ICONS.grip }, []),
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
  ]);

  if (selected) card.append(stopActions(stop, done, showTimes));
  return card;
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
        href: stop.mapsUrl || "#",
        target: "_blank",
        rel: "noreferrer",
      }, [icon("navigateLight"), "Navigate"]),
      h("button", {
        class: done ? "action on" : "action",
        onclick: async () => { await post("/api/stops/" + stop.id + "/visited", { visited: !done }); await refreshTrip(); },
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
          onclick: async () => { await post("/api/stops/" + stop.id + "/delete", {}); state.menuOpen = false; await refreshTrip(); },
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
  const close = () => { state.noteFor = null; render(); };

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

  state.noteFor = null;
  render();

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

/* ------------------------------------------------------------- trip menu */

/**
 * The one dropdown in the app, hanging off the trip name (PLAN.md section 4h),
 * drawn by design/TripMenu.dc.html.
 *
 * Plan view is the day grid the Planner artboards specify and it is not built
 * yet, so the item is here and says so rather than being left out: the menu
 * the artboard draws has three items.
 */
function tripMenu() {
  const close = () => { state.tripMenu = false; render(); };
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
      item("pinInk", "Map view", { on: true }),
      item("grid", "Plan view", { disabled: true, title: "The day grid is not built yet" }),
      h("div", { class: "rule" }, []),
      item("arrowLeft", "Back to trips", {
        onclick: async () => {
          state.tripMenu = false;
          state.trips = (await api("/api/trips")).trips;
          state.screen = "trips";
          render();
        },
      }),
    ]),
  ];
}

/* ----------------------------------------------------------- move to day */

async function openMove(stopId) {
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
  const close = () => { state.move = null; state.preview = null; render(); };

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

async function moveTo(dayId) {
  await post("/api/stops/" + state.move.stop.id + "/move", { dayId });
  state.move = null;
  state.preview = null;
  state.selectedStopId = null;
  if (dayId) state.openDayId = dayId;
  await refreshTrip();
}

/* ---------------------------------------------------------------- search */

const DEBOUNCE_MS = 250;
const MIN_CHARS = 3;

function openSearch(dayId) {
  state.search = { dayId: dayId === "unplanned" ? null : dayId, query: "", rows: [], bias: null, anywhere: false, note: null, busy: false };
  render();
  const field = $("q");
  if (field) field.focus();
}

function closeSearch() {
  state.search = null;
  render();
}

let debounceTimer = null;
let searchTicket = 0;

function sheetSearch() {
  const s = state.search;

  const results = h("div", { class: "results", id: "results" }, []);
  renderResults(results);

  return h("div", { class: "sheet", style: "height:529px" }, [
    h("div", { class: "grabber", onclick: closeSearch }, [h("i", {}, [])]),
    h("div", { class: "search-head" }, [
      h("div", { class: "search-field" }, [
        icon("search"),
        h("input", {
          id: "q",
          value: s.query,
          placeholder: "Search for a place",
          autocomplete: "off",
          oninput: onSearchInput,
        }, []),
        h("button", { class: "clear", onclick: closeSearch, title: "Close" }, [icon("closeFaint")]),
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
        h("span", { style: "flex-grow:1" }, []),
        h("button", {
          class: "chip-link",
          "aria-pressed": s.anywhere ? "true" : "false",
          onclick: () => { s.anywhere = !s.anywhere; if (s.query.trim().length >= MIN_CHARS) runSearch(s.query.trim()); else render(); },
        }, ["Search anywhere"]),
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
  if (s.anywhere) params.set("anywhere", "1");

  const ticket = ++searchTicket;
  s.busy = true;
  try {
    const data = await api("/api/trips/" + state.trip.trip.id + "/place-search?" + params);
    if (ticket !== searchTicket) return;
    s.rows = data.results;
    s.bias = data.bias;
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

  if (row.outside) {
    return h("div", { class: "result far" }, [
      h("div", { class: "result-tile grey" }, [icon("bowlGrey")]),
      h("div", { class: "result-text" }, [
        h("span", { class: "result-name", text: row.name }, []),
        h("span", { class: "result-meta", text: row.meta }, []),
      ]),
    ]);
  }

  return h("div", { class: "result" }, [
    h("div", { class: "result-tile" }, [icon("bowl")]),
    h("div", { class: "result-text" }, [
      h("span", { class: "result-name", text: row.name }, []),
      h("span", { class: "result-meta", text: row.meta }, []),
    ]),
    h("button", { class: "result-add", title: "Add to the trip", onclick: () => addPlace(row.placeId) }, [
      icon("plus"),
    ]),
  ]);
}

async function addPlace(placeId) {
  const s = state.search;
  await post("/api/trips/" + state.trip.trip.id + "/stops", { placeId, dayId: s.dayId });
  state.trip = await api("/api/trips/" + state.trip.trip.id);
  // The search stays open, and the place it just added now reads "On trip".
  if (s.query.trim().length >= MIN_CHARS) await runSearch(s.query.trim());
  else render();
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
