/**
 * One page, served by the Worker, hand-written.
 *
 * This is not the React app PLAN.md section 2 describes and it is not trying
 * to be: it is the smallest real client that exercises place search end to
 * end, so the feature can be seen working against the deployed Worker rather
 * than only against tests. The palette is the wireframes' warm cream so it
 * does not look alien next to design/PlaceSearch.dc.html.
 *
 * The three cost controls section 4b puts in the browser live here: a 250 ms
 * debounce, a three-character floor, and one session token per search.
 */

export function page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>yvr.kocho.sh — place search</title>
<style>
  :root {
    --paper: #FFFCF6; --card: #FBF6EE; --line: #F1E9DA; --edge: #E9DFCE;
    --ink: #33302B; --grey: #6B645B; --faint: #9A9184; --green: #4E7A4B;
    --rust: #A8663C;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font: 15px/1.5 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  }
  main { max-width: 720px; margin: 0 auto; padding: 28px 20px 80px; }
  h1 { font-size: 20px; font-weight: 620; margin: 0 0 2px; letter-spacing: -0.01em; }
  h2 { font-size: 13px; font-weight: 600; color: var(--grey); margin: 28px 0 10px;
       text-transform: uppercase; letter-spacing: 0.07em; }
  .sub { color: var(--grey); font-size: 14px; margin: 0 0 22px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
  label { display: block; font-size: 13px; color: var(--grey); margin: 0 0 5px; }
  input {
    width: 100%; padding: 9px 11px; font: inherit; color: var(--ink);
    background: var(--paper); border: 1px solid var(--edge); border-radius: 8px;
  }
  input:focus { outline: 2px solid var(--green); outline-offset: -1px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .row > * { flex: 1 1 150px; }
  button {
    font: inherit; font-weight: 550; padding: 9px 15px; border-radius: 8px; cursor: pointer;
    background: var(--green); color: #fff; border: 1px solid transparent;
  }
  button.quiet { background: transparent; color: var(--grey); border-color: var(--edge); }
  button:disabled { opacity: 0.45; cursor: default; }
  .trip-name { font-size: 18px; font-weight: 620; }
  .cities { color: var(--grey); font-size: 14px; }
  .cities:empty { display: none; }
  .dates { color: var(--faint); font-size: 13px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .suggestion {
    display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    padding: 10px 12px; background: transparent; color: var(--ink); font-weight: 400;
    border: 0; border-top: 1px solid var(--line); border-radius: 0;
  }
  .suggestion:first-child { border-top: 0; }
  .suggestion:hover:not(:disabled) { background: var(--line); }
  .suggestion .text { flex: 1; min-width: 0; }
  .suggestion .primary { display: block; }
  .suggestion .secondary { display: block; color: var(--grey); font-size: 13px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .suggestion.far { opacity: 0.55; }
  .far-label, .on-trip { font-size: 12px; color: var(--faint); white-space: nowrap; }
  .on-trip { color: var(--green); }
  .day { border-top: 1px solid var(--line); padding: 12px 0; }
  .day:first-child { border-top: 0; }
  .day-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--grey); }
  .hue { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .day.open .day-head { color: var(--ink); font-weight: 600; }
  .stop { padding: 8px 0 8px 17px; }
  .stop .title { font-weight: 520; }
  .stop .desc { color: var(--grey); font-size: 13px; }
  .stop .desc:empty { display: none; }
  .hint { color: var(--faint); font-size: 13px; padding: 10px 2px; }
  .bias { color: var(--faint); font-size: 12px; padding: 6px 2px 0; }
  .error { color: var(--rust); font-size: 13px; padding: 8px 2px; }
  .results { border: 1px solid var(--line); border-radius: 10px; overflow: hidden;
             background: var(--paper); margin-top: 8px; }
  .results:empty { display: none; border: 0; }
</style>
</head>
<body>
<main>
  <h1>yvr.kocho.sh</h1>
  <p class="sub">Place search against the deployed Worker — PLAN.md section 4b.</p>

  <section id="new-trip" class="card">
    <h2 style="margin-top:0">Where are we going?</h2>
    <div class="row">
      <input id="trip-name" placeholder="Kyushu in October" autocomplete="off">
    </div>
    <div class="row" style="margin-top:10px">
      <input id="trip-start" type="date">
      <input id="trip-end" type="date">
      <button id="create">Start the trip</button>
    </div>
  </section>

  <section id="trip" hidden>
    <div class="card">
      <div class="trip-name" id="name"></div>
      <div class="cities" id="cities"></div>
      <div class="dates" id="dates"></div>
    </div>

    <h2>Add a place</h2>
    <div class="card">
      <label for="q">Search, then pick one. Nothing fires under three characters.</label>
      <input id="q" placeholder="ramen" autocomplete="off">
      <div class="row" style="margin-top:10px; align-items:center">
        <label style="margin:0; flex:1 1 auto">
          <input type="checkbox" id="anywhere" style="width:auto; margin-right:6px">Search anywhere
        </label>
      </div>
      <div class="bias" id="bias"></div>
      <div class="error" id="error"></div>
      <div class="results" id="results"></div>
    </div>

    <h2>The days</h2>
    <div class="card" id="days"></div>
  </section>
</main>

<script type="module">
const $ = (id) => document.getElementById(id);

const DEBOUNCE_MS = 250;
const MIN_CHARS = 3;

let trip = null;
let openDayId = null;

/**
 * One token per search, not per keystroke. It is minted on the first
 * keystroke of a search and thrown away the moment a place is picked or the
 * box is emptied, which is what makes Google bill the whole thing once.
 */
let sessionToken = null;
const sessionFor = () => (sessionToken ??= crypto.randomUUID());
const endSession = () => { sessionToken = null; };

let debounceTimer = null;
let inFlight = 0;

$("create").addEventListener("click", async () => {
  const name = $("trip-name").value.trim();
  if (!name) return $("trip-name").focus();

  const body = {
    name,
    startDate: $("trip-start").value || today(0),
    endDate: $("trip-end").value || today(3),
  };
  const res = await fetch("/api/trips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) return showError(data.error ?? "could not start the trip");

  trip = data.trip;
  openDayId = data.days[0]?.id ?? null;
  $("new-trip").hidden = true;
  $("trip").hidden = false;
  await refresh();
  $("q").focus();
});

$("q").addEventListener("input", () => {
  const query = $("q").value.trim();
  clearTimeout(debounceTimer);

  if (query.length < MIN_CHARS) {
    // Below the floor there is no search, so there is no session either.
    if (query.length === 0) endSession();
    render([], null, "Keep typing — three characters before anything is sent.");
    return;
  }
  debounceTimer = setTimeout(() => search(query), DEBOUNCE_MS);
});

$("anywhere").addEventListener("change", () => {
  const query = $("q").value.trim();
  if (query.length >= MIN_CHARS) search(query);
});

async function search(query) {
  const params = new URLSearchParams({ q: query, session: sessionFor() });
  if (openDayId) params.set("dayId", openDayId);
  if ($("anywhere").checked) params.set("anywhere", "1");

  const ticket = ++inFlight;
  const res = await fetch(\`/api/trips/\${trip.id}/place-search?\${params}\`);
  // A slower earlier request must not overwrite a newer list.
  if (ticket !== inFlight) return;

  const data = await res.json();
  if (!res.ok) return showError(data.error ?? "search failed");
  showError("");
  render(data.suggestions, data.bias, null, data.cacheHit);
}

function render(suggestions, bias, hint, cacheHit) {
  const list = $("results");
  list.replaceChildren();

  $("bias").textContent = bias
    ? \`biased to \${bias.source.replace("-", " ")} · \${bias.centre} · \${Math.round(bias.radius / 1000)} km\${cacheHit ? " · cached" : ""}\`
    : suggestions.length
      ? \`unbiased\${cacheHit ? " · cached" : ""}\`
      : "";

  if (hint) {
    const p = document.createElement("div");
    p.className = "hint";
    p.textContent = hint;
    list.append(p);
    return;
  }

  for (const s of suggestions) {
    const far = s.distanceMetres !== null && s.distanceMetres > 30000;
    const button = document.createElement("button");
    button.className = "suggestion" + (far ? " far" : "");
    button.disabled = s.onTrip;

    const text = document.createElement("span");
    text.className = "text";
    const primary = document.createElement("span");
    primary.className = "primary";
    primary.textContent = s.primary;
    const secondary = document.createElement("span");
    secondary.className = "secondary";
    secondary.textContent = s.secondary;
    text.append(primary, secondary);

    const tag = document.createElement("span");
    if (s.onTrip) {
      tag.className = "on-trip";
      tag.textContent = "on trip";
    } else if (s.distanceMetres !== null) {
      tag.className = "far-label";
      tag.textContent = formatDistance(s.distanceMetres);
    }

    button.append(text, tag);
    button.addEventListener("click", () => pick(s.placeId));
    list.append(button);
  }
}

async function pick(placeId) {
  const res = await fetch(\`/api/trips/\${trip.id}/stops\`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ placeId, sessionToken: sessionFor(), dayId: openDayId }),
  });
  const data = await res.json();
  if (!res.ok) return showError(data.error ?? "could not add that place");

  // The pick closes the session: Details is the last call it pays for.
  endSession();
  $("q").value = "";
  render([], null, null);
  await refresh();
}

async function refresh() {
  const res = await fetch(\`/api/trips/\${trip.id}\`);
  const data = await res.json();

  $("name").textContent = data.trip.name;
  // Absent rather than empty when the trip has no stops yet — section 4d.
  $("cities").textContent = data.cities.join(", ");
  $("dates").textContent = \`\${data.trip.start_date} → \${data.trip.end_date}\`;

  const days = $("days");
  days.replaceChildren();
  for (const day of data.days) {
    const el = document.createElement("div");
    el.className = "day" + (day.id === openDayId ? " open" : "");

    const head = document.createElement("div");
    head.className = "day-head";
    const dot = document.createElement("span");
    dot.className = "hue";
    dot.style.background = day.hue;
    const label = document.createElement("span");
    label.textContent = day.date;
    head.append(dot, label);
    head.style.cursor = "pointer";
    head.addEventListener("click", () => { openDayId = day.id; refresh(); });
    el.append(head);

    for (const stop of day.stops) {
      const row = document.createElement("div");
      row.className = "stop";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = stop.title;
      const desc = document.createElement("div");
      desc.className = "desc";
      // Derived, never typed. Empty means the card shows nothing — section 4c.
      desc.textContent = stop.description;
      row.append(title, desc);
      el.append(row);
    }
    days.append(el);
  }
}

const showError = (message) => { $("error").textContent = message; };

function formatDistance(metres) {
  return metres < 1000 ? \`\${Math.round(metres)} m\` : \`\${Math.round(metres / 1000)} km\`;
}

function today(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

$("trip-start").value = today(0);
$("trip-end").value = today(3);
</script>
</body>
</html>`;
}
