# yvr.kocho.sh — trip map

A shared map of a trip. Stops come in from the places you already saved and the
spreadsheet you already wrote, get grouped by day, and grey out as you visit them.
Built to be used one-handed, on a phone, on hotel wifi.

Wireframes are in `design/`, and they are the specification — `CLAUDE.md` is the
law on how to read and follow them.

---

## 0. Where this is, and what to pick up next

*Last walked over the deployed Worker on 2026-09-13, at phone, tablet and desk
widths. Everything below was checked in the running app, not inferred from the
code.*

### Built and working

| | Where |
|---|---|
| Trips list — happening now, coming up, past; derived subtitles | §4d |
| Starting a trip — name, then the date range on a real calendar | §4d |
| The empty trip, with its two ways forward | §4g |
| The phone home screen — map, two-height sheet, day accordion, stops | §4c, §7 |
| Place search — Text Search, biased to the open day, KV-cached, deduped | §4b |
| Derived text everywhere — the grey line, the trip subtitle, the cities | §4c |
| The stop's actions and kebab; Navigate, Visited, notes | §4e |
| Move to day, with the BEST FIT card and a reason on every other day | §8 |
| Drag to reorder, across days, with spring-loaded opening | §4e |
| The one trip menu, and history-backed back navigation | §4h |
| The Plan view, phone and desk, with times, free slots and the tray | §4f |
| The real Google map, styled to the palette, with the drawn map as fallback | §7 |
| Optimistic writes on every edit, with a revert and a notice on failure | §2 |
| Renaming a trip and moving its dates, days reconciled rather than rebuilt | §4d |
| Naming a day, and colouring it out of a palette or a colour picker | §7 |
| Where you are sleeping — a stay over a range, and the Planner's lodging row | §5b |
| The map's two controls: fit the whole trip, and where I am | §7 |

### Next, in the order it is worth doing

1. **Sign in (§5).** Better Auth on D1, Google only. Everything in the two lists
   below that is *blocked* is blocked on this: there is no real person, so
   there is nobody to invite, no avatar that means anything, and no way to tell
   two phones apart. `design/SignIn.dc.html` is drawn and untouched. This is
   the single biggest unlock in the file.
2. **Members and invites (§5).** `trip_invites` and `trip_share_links` are in
   the schema with no API behind them. `design/Members.dc.html` is drawn. The
   invite button in the trip bar and the Trips invite banner are both waiting
   on this and currently do nothing.
3. **Fix "today" (see the bugs below).** One-line-ish, and wrong in a way that
   matters to the whole premise of the app.
4. **Bringing in a My Map (§3).** The KML parser is written and tested and the
   spike route works; nothing writes to `places` from it, nothing uses
   `sources`, and there is no hourly sync. `design/Import.dc.html` is drawn,
   and *Bring in a My Map* on the empty trip does nothing when tapped.
5. **Offline (§4g).** Stated as a requirement in §2 and drawn in
   `design/Offline.dc.html`; nothing is built. No service worker, no queued
   writes, no strip under the nav. The optimistic write path is the right
   shape for it, but it drops a failed write rather than holding it.
6. **Live changes (§6).** `TripRoom` is a stub Durable Object that accepts
   sockets and broadcasts. Nothing in the client opens one, so two phones on
   one trip never see each other.
7. **The wide layout (`design/Desktop.dc.html`).** The Planner grid is the only
   screen that has a desk density; the Trips list and the map still centre a
   375px frame on a 1440px window.
8. **Deleting a trip.** Renaming one and moving its dates is built — *Change
   trip* in the one dropdown — but there is still no way to delete one, and no
   artboard draws the confirmation that would need.

Infrastructure has its own backlog in **INFRA.md** — the Places key, the custom
domain, the Maps browser key, Alchemy state. None of it blocks the list above
except sign-in, which needs the Google OAuth client in INFRA.md §4.

### Known bugs

1. **"Today" is computed in UTC, and the trip's own timezone is never read.**
   `todayIso()` is `new Date().toISOString().slice(0, 10)` in both
   `src/worker/index.ts` and the client. `trips.timezone` is written at
   creation and read by nothing. In Japan before 09:00 local it is still
   yesterday; in Vancouver after 17:00 it is already tomorrow. That decides the
   TODAY tag, which day the trip opens on, the done/ahead colour of every pin
   and card, the now line in the Planner, and "day 3 of 11". For an app whose
   whole question is *what am I doing today, in the country I am standing in*,
   this is the one to fix first.
2. **Tap targets are under the floor, as §11 guessed.** Measured on a 375px
   viewport: the Navigate / Visited / Add note buttons are **30px** tall and
   the search row's `+` is **32x32**. Apple asks 44 and Google 48. The
   artboards draw them at those sizes, so this is a real conflict between the
   spec and a device, and it needs settling rather than quietly rounding.
3. **Two controls are drawn and do nothing when tapped.** *Invite someone* in
   the trip bar (both views), the account avatar on the Trips list, and *Bring
   in a My Map* on the empty trip. Each is blocked on an item above — but a
   control that responds to nothing is worse than one that is not there, so
   either wire them or take them out. The two map controls were on this list
   and are now wired; the layers button is gone, because there was never a
   second basemap for it to switch to.
4. **A failed write is announced and then forgotten.** The revert is right, but
   there is no retry and nothing is queued, so an edit made on bad hotel wifi
   is simply lost. §2 promised better than this; see *Offline* above.
5. **A drag cannot be undone.** A drop commits the moment you let go, and
   §11.7 already names the fix — a toast reading *Moved to Sat Oct 3* with an
   Undo, which the op log makes cheap.

### Drawn but deliberately not built

Recorded so nobody builds them by accident: the "All stops" title on the
expanded sheet, the "Search anywhere" control, and the X inside the search
field are all **deliberate departures** with the reasoning in `CLAUDE.md`. The
Planner's travel and lodging rows and its add-a-day rails are left out because
`travel_legs` and `lodging` have no API and nothing can fill them (§5b).

---

## 1. What it has to do

| | Capability | Hard part | Built |
|---|---|---|---|
| 1 | Show every stop on one full-screen map, clustered | none, solved problem | yes, less clustering |
| 2 | Pull places in from Google | saved lists have no API, so we use My Maps — §3 | parser only |
| 3 | Plan days and times as a grid | built in, replacing the spreadsheet — §4 | yes |
| 3b | Sign in, invite people to a trip | picking an auth library that runs on Workers — §5 | no |
| 3c | Search for places and add them | biasing results to the day you are planning — §4b | yes |
| 4 | Colour by progress, group by day | two encodings, one channel — §7 | yes |
| 5 | Mark visited, add notes | none | yes |
| 6 | ~~Import flights from Gmail~~ | deferred past v1 — §5b | n/a |
| 7 | Live collaboration, no refreshing | ordering conflicts on drag-reorder — §6 | stub DO only |
| 8 | Drag a stop to another day, or "move to day" with a suggestion | the suggestion needs a distance model — §8 | yes |

---

## 2. Infrastructure

Everything on Cloudflare, declared in `alchemy.run.ts`.

```
yvr.kocho.sh
   │
   ├── Worker "web"          React SPA (Vite) served from Workers Assets
   ├── Worker "api"          Hono. REST + WebSocket upgrade
   │      ├── Better Auth   Google OAuth, sessions, per-account token refresh
   │      ├── Places proxy  Autocomplete + Details, key server-side, KV-cached
   │      ├── D1             relational truth: trips, days, stops, places, members
   │      ├── DO  TripRoom   one per trip. WebSocket hibernation, op sequencing, presence
   │      ├── R2  tiles      Protomaps basemap (.pmtiles) — self-hosted, no per-tile cost
   │      ├── R2  uploads    Takeout CSVs, photos
   │      ├── KV  sessions   signed session lookup, OAuth state
   │      ├── Queue          import jobs
   │      └── Workflow       ImportRun — durable multi-step import, retries per place
   │
   └── Cron                  hourly — re-read the My Maps KML
```

**Why these pieces**

- **D1** for anything you query across (a day's stops, a trip's members). SQLite semantics, one
  binding, no connection pooling to think about.
- **Durable Object per trip** is the collaboration spine. It is the single writer that assigns a
  sequence number to every op, so two phones dragging the same stop get a deterministic answer.
  WebSocket hibernation means an idle trip costs nothing while staying connected.
- **Workflows** for imports specifically. An import is: fetch list → resolve 46 places → match 34
  sheet rows → write. Any step can fail on a rate limit. Workflows checkpoint each step and retry
  just that one, which a Queue consumer would have to reimplement badly.
- **R2 + Protomaps** instead of Google's map tiles. One `.pmtiles` file for Japan is a few hundred
  MB, R2 has no egress fee, and MapLibre lets us style it to the warm palette. Google tiles would
  cost per load, cannot be restyled past their preset themes, and force Google's UI attributions
  into a design meant to be calm.
- **Better Auth on D1** for sign-in, sessions and the Google tokens Drive will need later. See §5.
- **No Gmail and no Sheets integration in v1.** Sign-in asks for `openid email profile` only.

**Alchemy version: pinned to `0.94.0`, not `latest`.** This matters more than a pin usually does.
`npm install alchemy` resolves to `2.0.0-beta.77`, which is a different product: v2 is
Infrastructure-as-Effects, built on the Effect library, and its own README calls it alpha with
breaking changes expected. Adopting it would make Effect the paradigm for the entire codebase and
tie an MVP to an alpha IaC tool. The 0.x line is what the ecosystem guides describe, has the
`alchemy/cloudflare/vite` integration the frontend needs, and its resource names are the ones this
document assumes. Revisit when v2 is stable.

**Frontend**: React 19 + Vite + TanStack Router + MapLibre GL JS. Tailwind v4 with the palette as
CSS variables; no component library, the UI is small and specific. Framer Motion only for the sheet.

**Offline is a requirement, not a nice-to-have.** You will open this in a basement ramen shop with
no signal. Ops are written to IndexedDB first, applied optimistically, and flushed to the DO when
the socket comes back. The DO rejects or rebases anything stale and the client re-renders. This
shapes the data model below, which is why ordering is a string and not an integer.

---

## 3. Places come from Google My Maps

*Status: the KML parser is written and tested and the spike route fetches a real map. Nothing yet
writes those places into a trip, `sources` is an empty table, and there is no hourly sync. See §0.*

**Decided.** There is no API for a Google Maps *saved list* — not in Maps Platform, not in Drive,
not in People. Every route into one is either a manual export or scraping a page that will change.

So we use **Google My Maps** instead, which is a different product with a real public endpoint:

```
https://www.google.com/maps/d/kml?mid=<map id>&forcekml=1
```

That returns KML with a `<Placemark>` per pin, each carrying name, description and **coordinates**.
No Places API call, no geocoding, no name matching, no scraping, and nothing that breaks when
Google reskins the Maps front end. A cron re-reads it hourly and new pins land in **To be planned**.

What this costs you: places get collected in My Maps rather than by tapping Save in the Maps app.
Mitigations, in order of how much they help:

- **Import your existing saved list once.** Google Takeout exports a saved list as CSV, and My Maps
  imports CSV directly. One migration, then you are on My Maps for good.
- **Paste a place link** in the app any time. We resolve it with the Places API and write it straight
  to the trip, so a place found while walking around never needs My Maps at all.
- Layers in a My Map can mirror categories, which gives us `places.category` for free.

Places added by link still touch the Places API, so `places.refreshed_at` stays in the schema to
honour Google's content caching limits. KML pins do not, because we hold the coordinates ourselves.

---

## 4. The spreadsheet: replaced, not parsed

**Decided, and then cut further.** A sync means committing to parse layouts we have never seen,
forever, and a parser that is 70% right *continuously* is worse than useless. A one-time import is
safer, but "write a parser for arbitrary grid layouts" is still a vague, open-ended piece of work to
put in front of an MVP. **So there is no spreadsheet import at all.**

What survives is the part that was actually worth having. The reason to use a sheet is not the file,
it is the **grid**: days across, time down, the whole trip visible at once. That is a view.

**The Planner is that view.** Days as columns, hours as rows, stops as cards you drag between days
and times, a travel row for flights and trains, and a lodging row along the bottom where your
`House 🏠` row was. Click any empty cell and place search opens there, already scoped to that day and
that hour (§4b). Once this exists the spreadsheet has no job left, because the cells now know where
they are on Earth and who has been there.

Getting an existing trip in is manual: the To be planned sidebar fills from your My Map, and you drag
places onto days. For an 11-day trip that is one sitting, and it is the sitting where you would be
rethinking the plan anyway.

---

## 4b. Adding places from inside the app

*Status: built, and measured against the deployed Worker. Two departures from what follows are
recorded in `CLAUDE.md`: there is no "Search anywhere" (dropping the bias searches near the
Cloudflare edge, not near you), and the bias never gates a result, only ranks it.*

**Google Places API (New)**, proxied through the Worker so the key never reaches the browser.

Two calls:

- **Autocomplete (New)** as you type, then **Place Details** on the one you pick. Both share a
  **session token**, which is what makes them bill as a single session instead of per keystroke.
  One token per search, discarded when the search closes.
- **Text Search (New)** for the "search anywhere" case, where you want a list rather than a
  completion.

**Yes, the geographic snapping is a tunable parameter — two of them.** Both calls take either
`locationBias` or `locationRestriction` (one or the other, never both), each given as a circle of
centre plus radius in metres, up to 50 000 m.

- `locationBias` ranks nearby results higher but still returns distant ones.
- `locationRestriction` hard-filters everything outside the circle.

**Use bias, not restriction.** Restriction means you cannot search a Hakone teahouse while sitting in
Fukuoka, which is exactly what people do when planning. Distant results appear greyed with their
distance, as on the Add a place artboard, and "Search anywhere" drops the bias entirely.

Where the circle comes from, in order:

1. The **centroid of the open day's stops**, radius 3 km. Planning Friday in Fukuoka biases to
   Friday's stops, not to the trip.
2. That day's **lodging**, if the day has no stops yet.
3. The **nearest day** either side that does have stops, for an empty day in a new city.
4. The **map viewport**, as the last resort.

The Planner does the same from the cell you clicked, which is why the popover on the canvas reads
"near Kagoshima" for Monday even though you are looking at a Fukuoka trip.

**Cost control**: debounce at 250 ms, never fire below 3 characters, one session token per search,
and cache `query + rounded bias centre` in KV for an hour. Place IDs are stored indefinitely;
everything else on a place carries `refreshed_at`.

Places already on the trip are matched by `google_place_id` and shown as "on trip" rather than
offered a second time.

---

## 4c. Two lines of text, and only one of them is ours

A stop shows two pieces of text, and it matters that they never blur together.

**The description** is the small grey line under the name. It is **derived, never typed**: the
category from Places, then the walking time from the previous stop. `ramen · 6 min walk`.
It is generated, so it is never wrong in an interesting way, and nobody has to maintain it.

Earlier drafts had this line saying things like `hamburg steak · booked` and `sushi · reservation`.
That was wrong, and worth naming: we have no way of knowing a table is booked. Those strings were
invented. They are gone.

**The note** is written by a person. Free text, blank until someone types something, shown directly
under the description when it exists. This is where `Booked 13:15, they release the table if you are
late` lives.

**This is how a booking time gets in, and it should stay that way.** Uploading a confirmation email
is too much friction for something you already know; you are standing outside the restaurant, you
remember the time, you type six words. So the action row is **Navigate · Visited · Add note**, plus
the kebab. The button reads **Edit note** once a note exists, which is also how you can tell at a
glance whether anyone has written anything.

Nothing auto-generates a note. If the field is empty the card simply shows nothing, which is the
honest state and keeps the compact list compact.

---

## 4d. Starting a trip

**Two fields: a name and the dates.** Nothing else. No starting city, no explanation text, no second
step. The name comes first and is required, because a trip people are sharing needs something to be
called, and "October trip" is not a thing anyone says.

The screen asks in words rather than labelling fields: **"Where are we going?"** over the name, then
**"And when?"** over the calendar. Same voice as the rest of the app, and *we* rather than *you*,
because a trip is a thing people do together.

**The cities are derived, the name is not.** This is the split that matters: `trips.name` is typed
by a person and is the only name the app ever shows. The line under it on a trip card is a separate,
computed thing — the cities the trip's stops are actually in, in day order, as
`Fukuoka, Kagoshima, Hakone`.

**With no stops yet, that line is simply absent.** A brand new trip shows its dates and nothing else,
which is honest: we do not know where it goes, so we say nothing rather than guessing. Portugal on
the Trips artboard is that state.

An earlier draft had the name itself derive from the cities. That was clever and wrong: a name that
changes under you is unsettling on a trip three people are sharing, and it made the schema carry two
name columns to keep a typed name safe. One typed name and one derived subtitle is simpler and never
surprises anyone.

The city on each place is reverse-geocoded once at import and stored, not recomputed per render.

### Changing the dates later

*Not built. There is no way to rename a trip, move its dates, or delete one — the trip menu holds
Map view, Plan view and Back to trips, and nothing else. What follows is still the plan.*

Trips get extended and cut short, so this cannot live in a settings screen. The Planner has a **plus
at each end of the day grid**: one adds a day before the trip, one adds a day after, and both are a
single click that widens `trips.start_date` or `end_date` and inserts a `days` row. Removing a day
at either end is the same control in reverse, and it refuses while that day still has stops rather
than silently orphaning them.

For a trip too long to fit on screen, arrows beside the view switcher page through it a week at a
time. The grid shows which window you are on.

---

## 4e. What a stop's menu holds

The same three or four actions everywhere, split the same way on both surfaces: the things you do
constantly stay visible, and the things you do rarely go behind a kebab.

| | Phone, on the card | Planner, on click |
|---|---|---|
| visible | Navigate · Visited · Add note | — |
| in the menu | Move to date · Remove from list | Edit · Add note · Delete |

The phone needs Navigate and Visited in the open because that is the whole job while travelling. The
Planner needs neither: you are at a desk, you are not walking anywhere, and nothing is being ticked
off. So its popover is just the three edits.

Both read **Edit note** rather than Add note once a note exists, which is how you tell at a glance
whether anyone has written anything.

**Editing a time has no menu item on the phone.** It belongs on the time itself, which is already a
tap target on every row, and an earlier draft that put "Change the time" in the kebab was one item
too many for a two-item menu. This is worth confirming on a real device.

### Drag and drop

Everything draggable is draggable the same way, and the Planner artboard shows both halves at once:

- **An event already on the grid** picks up with a grip, leaves a dashed ghost in the slot it came
  from, and follows a green drop line that names the time it would land on. Dragging sideways across
  a column moves it to that day.
- **An item in To be planned** drags out of the sidebar onto any cell. Its row stays in place as a
  dashed outline until the drop lands, so the list does not jump under your hand mid-drag.

Both write the same op: a `day_id` change, an `order_key` between its new neighbours, and a
`start_time` from the row it lands on.

---

## 4f. Planning on a phone

**In v1, and built.** A seven-column grid cannot work at 375 px at any density, so the phone Plan
view is one day per screen: the time running down the side, the gaps drawn to scale, days swiped on a pill rail.
It is Direction C from the explorations page, which earns its place after all.

**The tray along the bottom is why it is worth building.** *To be planned* has no good home anywhere
else on a phone: the Today sheet is a day at a time, and the full list buries it under eleven days.
Here it sits directly under the day you are filling, ready to drag up. That is a job nothing else in
the app does.

The desktop Planner stays the grid. They are the same view at two densities, not two features.

**As built**, the grid appears from 780 px rather than the 1440 the artboard was drawn at, and deals
as many days as fit — seven at 1280 and up, fewer below, never a column under 120 px. Times are set
on the time itself, and a stop without one waits in a band under the hours instead of being given a
time nobody chose. `CLAUDE.md` holds the four judgement calls the artboards did not settle.

---

## 4g. The states that are not the happy path

Two of these were missing entirely and both would have been found late.

**An empty trip is the first screen every single user sees**, and everything else on the canvas
assumed a full one. It has no pins, no stops, and exactly two ways forward: find a place, or bring in
a My Map. The day accordion still lists every day at `0/0`, so the shape of the trip is visible
before anything is in it.

**Offline is a stated requirement with no design.** Section 2 says the app has to work in a basement
ramen shop; nothing showed what that looks like. It now does, and the rules it sets are:

- A strip under the nav says there is no connection and counts what is waiting. It is informative,
  not an error, and nothing is blocked behind it.
- A change made offline keeps its normal appearance and gains a small clock: *marked visited, will
  sync*. The change is real to you immediately.
- Something created offline is dashed until it has been shared, because the difference between "I
  added this" and "we all have this" is the thing that matters on a shared trip.
- Collaborator avatars dim, since we cannot know who is looking.
- The map still draws, from cached tiles, and says `saved map` rather than pretending to be live.

**On reconnect, last writer wins and nothing is shown.** This is a decision, not an omission. A
conflict UI for two friends editing a trip is a lot of machinery for a case that will happen rarely
and matter less than it sounds: the loser sees the winner's value arrive live, which on a shared
trip usually reads as "oh, Mika changed it" rather than as data loss. The op log in section 6 keeps
the history if we ever want to surface it.

---

## 4h. Getting around

**One menu, and it is the chevron beside the trip name.** No hamburger, no kebab in the nav bar. A
second menu next to the first is how an app ends up with two half-answers to "where is that thing".

```
Map view      ← default, ticked when current
Plan view
──────────
Back to trips
```

The same nav runs on every screen inside a trip, so the trip name is always both the title and the
way out.

**People sits next to the avatars, not in the menu.** A small add-person button at the end of the
avatar stack opens the People screen. It belongs there because that is already where the question
"who is on this trip" is being answered, and it keeps the nav to one menu rather than two.

**Sources lives in the Planner**, at the foot of the To be planned sidebar, as a row showing which
My Map is connected and when it last synced. That is the right place: the sidebar is the thing the
My Map fills, so the source of those places belongs directly under them rather than in a settings
screen two taps away. The phone Plan view carries the same control as a small button on the tray
header.

---

## 5. Auth

*Status: not built, and the largest single thing missing. Today every visitor is an anonymous id in
a cookie, `app_user` holds a stub row, and avatars are two letters derived from that id. Invites and
share links are in the schema with no API. See §0.*

**Better Auth**, which is the right call. Alternatives considered:

| | |
|---|---|
| **Better Auth** | Runs on workerd with no Node shims, has first-class D1 support through Drizzle, and stores per-provider `access_token` and `refresh_token` with refresh handled for you. That last part is what makes Drive possible later. |
| Auth.js (`@auth/core`) | Works on Workers with the D1 adapter, but you write invitations, roles and token refresh yourself. |
| Lucia | No longer a library. It became a learning resource, so there is nothing to install. |
| Clerk, WorkOS, Stack Auth | Hosted, good, and a third party plus a bill for a trip app for your friends. |
| Hand-rolled OAuth | About 200 lines and genuinely viable, but you own session rotation, CSRF, token refresh and invite tokens forever. |

The sign-in screen is one button and nothing else: no email form, no password, no second provider.
The button reads **"Continue with Google"** rather than "Connect with", because Google's sign-in
branding guidelines permit only a fixed set of strings and Connect is not among them. The `G` mark
in the wireframe is a placeholder; Google ships the real asset.

The screen also says, in one line, that we ask for a name and an email and nothing else. That is a
promise §5 has to keep, and it is why Drive is a separate later consent.

**Setup**: Google as the only social provider, sessions in a cookie with the lookup in KV, Better
Auth's tables in D1 alongside ours through Drizzle.

**There are no roles.** Inviting someone to a trip means you want them editing it, so membership
itself is the permission: if you are in `trip_members`, you can change anything. Better Auth's
organization plugin is not used either, since a trip is not an org. This can grow a role column
later without moving any data.

`trips.owner_id` survives as a record of who started the trip, not as a permission. The one thing it
should gate eventually is deleting the whole trip.

**Invites** are a signed token emailed to an address, carrying just the trip. **They do not expire**
— an invite to a trip in eight months is a normal thing to send, and an expiry would turn that into
a support problem. Accepting while signed out sends you through Google first and then straight into
the trip. Revoking is an explicit action, which is the honest version of what an expiry was
pretending to do.

**The view-only link is not a role.** It is an unauthenticated read of one trip, for someone who
should not have to make an account to look at the map. It never writes.

### Drive

Worth being straight about: **now that the spreadsheet import is cut, nothing in the MVP needs
Drive.** Its first real job is attaching files to a stop — a reservation PDF, a scanned rail pass,
photos — and that is post-MVP.

What we do build now is the plumbing, because retrofitting it is unpleasant:

- **Incremental authorisation.** Sign-in asks for `openid email profile` and nothing else. Drive is a
  second consent, requested the first time you attach something. A sign-in screen that asks for your
  Drive is how you lose users at the first screen.
- **Scope choice: `drive.file`.** It only ever sees files the app created or that you explicitly hand
  over through the Google Picker. It is a non-sensitive scope, so it needs no verification project.
  `drive.readonly` would see your whole Drive and is a sensitive scope with a review attached.
- Better Auth keeps the refresh token, so a Drive call months later does not bounce you through
  consent again.

---

## 5b. Flights and hotels

*Status: hotels are built. A stay is a name, an optional place, and a range of dates; it is added
from the Accommodations tab of the sheet and drawn as one bar across the Planner's lodging row,
with the day of a changeover split in half between the two. Flights and trains are not built —
`travel_legs` still has no API — and the paragraphs below are about them.*

Added by hand for now. The Planner's travel row is where they go: a plane and a train icon per day,
sitting above the lodging row, so "Shinkansen at 11:00" is visible without eating a grid cell.

Recorded for later, because the obvious path is the wrong one. Gmail's `gmail.readonly` is a
**restricted scope**: shipping it to anyone but yourself requires Google app verification plus an
independent CASA security assessment, which is a multi-week project with an annual fee.

When we come back to it, the answer is almost certainly **Cloudflare Email Routing**:
`trips@yvr.kocho.sh`, a Gmail filter that forwards confirmations there, and an Email Worker that
parses them. No OAuth, no verification, no standing access to anyone's inbox, and it works for
everyone on the trip regardless of their mail provider.

---

## 6. Realtime

*Status: `TripRoom` exists as a stub that accepts sockets, broadcasts, and hibernates. Nothing in
the client opens one, and no op is written or replayed. Two phones on one trip do not see each
other; a change lands after the other side re-reads the trip. The op log below is also what an undo
and an offline queue would be built on, so it is worth more than live cursors.*

`TripRoom` Durable Object per trip.

- Client connects over WebSocket, gets a snapshot plus the current sequence number.
- Every change is an **op**: `{type, entity, id, patch, actorId, clientSeq}`.
- The DO checks the actor is a member, assigns `seq`, writes to D1, broadcasts.
- Clients apply optimistically, then reconcile against the authoritative op.
- Conflict rule is per field, last writer wins, **except ordering**.

**Ordering uses fractional indexing.** `stops.order_key` is a string like `a0`, `a1`, `a0V`. To drop
a stop between two others you generate a key between their keys. Two people reordering at once
produce different keys rather than fighting over the same integer, and nothing has to be renumbered.
This is also what makes offline reorder work.

**Presence is out of the MVP.** Live cursors on a shared map look impressive and are a lot of work
for something two people planning a trip will rarely see at the same moment. What ships instead is
the cheap 90%: changes arrive live, and a stop shows who added it. When presence does come, it lives
only in DO memory and is never persisted.

---

## 7. Colour

You asked for two things that want the same channel:

1. Days as colour groups, so clusters read as "this is the Kagoshima day".
2. Green today / yellow ahead / grey visited or past.

With 11 days, doing both on the pin fill gives 11 hues and the progress reading disappears.

**What the wireframes do**: pin fill carries status only — soft green, soft yellow, grey. The day's
own hue appears as a small dot next to its header in the list, and on the thin route thread on the
map. Opening a day's accordion dims every other day's pins, which is what actually makes a day's
cluster readable — dimming, not hue.

**Decided.** The alternative — hue = day, status as fill style — makes multi-day clusters legible
at a glance but makes "what have I done today" harder, and today is what you look at while
travelling.

**Day hues were a ramp, and are now a palette of eight.** The ramp ran deep green to pale yellow
through olive and orange, on the reasoning that a trip is a sequence and the colour should encode
one. That reasoning was sound and the result was not: a ramp has a single axis, and past about day
six the step between two days is smaller than the eye separates, so half of a long trip came out
the same olive. Eight colours as far apart on the wheel as this palette's register allows tell
eleven days apart; a ramp of eleven does not. Beyond eight, a golden-angle step keeps picking hues
far from the ones already used.

The first colour is still `#3F6B4A`, the green every artboard draws on day one and on the today
pin, so nothing in the drawn screens moved.

**And a day's colour belongs to whoever is planning the trip.** Every day header carries a pencil
that opens a name field and the ten swatches — the eight, white, and a colour input for anything
else. Which is the honest answer to the thing the ramp was reaching for: the app cannot know that
three of these days are the Kagoshima days and one is the day everything goes wrong, and the person
holding the phone can.

People get their own small palette that is deliberately outside the day colours, so an avatar never
reads as a day.

Palette, warm and low-saturation throughout:

```
paper    #FBF6EE     ink      #33302B     line     #E9DFCE
surface  #FFFCF6     ink-2    #8C8479     surface-2 #F6EFE2
today    #6F9A6B on #E4EEE1        ahead  #E0B355 on #F8EECF
done     #BDB4A7 on #EFE9DF
days     #3F6B4A #2F7D86 #3F6BA6 #6A5FA6 #9C5E8E #C4826A #C0913C #7E8C42   then a golden-angle step
avatars  #C4826A #6E8CA8 #8A83AE #A87A93        (people, deliberately off the day colours)
```

**The phone target is 375 x 667, not 390 x 844.** The earlier drafts were drawn at the size of a
large phone with no browser chrome, which is a viewport almost nobody has. A small phone is 375 wide,
and once the browser's address bar and toolbar are taken off, 667 is a generous estimate of what is
left. Designing at 844 quietly buys 177 px of list that does not exist, and the first real device
test is where you find out.

What that cost, in the density pass: nav bars 60 to 50, day headers 46 to 40, stop rows 48 to 42,
action buttons 36 to 30, primary buttons 50 to 44.

Type: **Newsreader** for headings, a warm literary serif. **Figtree** for UI, rounded and friendly
without being cute. Both from Google Fonts, both with real fallback stacks.

---

## 8. "Move to day" suggestion

When you tap Move to day, the sheet proposes one. The ranking is deliberately simple and explainable,
because a suggestion you cannot understand is worse than no suggestion:

1. Drop days in a different city, unless nothing else scores.
2. For each remaining day, find the insertion point that adds the least walking, using straight-line
   distance between the stop and its would-be neighbours.
3. Penalise days that are already full, and days where the stop's opening hours do not fit.
4. Show the reason in words: *"after Menya Ishii, before the Ainoshima ferry. 400 m away, adds 5 min."*

No routing API call at suggest time. Straight-line distance is close enough to rank, and we only
spend a Directions call if you ask for the real walking time.

---

## 9. Data model

D1, SQLite. Abbreviated; timestamps and audit columns omitted.

```sql
-- Better Auth owns these four. Do not hand-edit them.
user             id, email, name, image
session          id, user_id, token, expires_at
account          id, user_id, provider_id, access_token, refresh_token, scope
verification     id, identifier, value, expires_at
                 -- account.scope is how we know whether Drive was ever granted (§5)

-- ours
trips            id, name, slug, start_date, end_date, timezone, owner_id, cover_color
                 -- name is required and typed by a person. the cities under it on a trip card
                 --   are derived from places.city at read time, and absent when there are none
trip_members     trip_id, user_id, joined_at
                 -- membership IS the permission. no role column in v1
trip_invites     id, trip_id, email, token_hash, invited_by, accepted_at, revoked_at
                 -- no expiry. revoking is explicit
trip_share_links id, trip_id, token_hash, revoked_at
                 -- read-only, unauthenticated. not a role, a separate door

days             id, trip_id, date, label, place_label, hue
                 -- place_label is "Fukuoka" or "Fukuoka -> Kagoshima", set by hand in the Planner

places           id, trip_id, google_place_id, name, name_local, lat, lng,
                 address, city, country_code, category, maps_url, source, refreshed_at
                 -- city and country_code are reverse-geocoded once at import. city is what
                 --   the subtitle on a trip card is built from
                 -- the geographic thing, deduped per trip by google_place_id
                 -- source: my_map | search | link
                 -- refreshed_at drives the Places content refresh. KML pins never need it

stops            id, trip_id, day_id, place_id, title, note,
                 start_time, end_time, order_key, status, visited_at, visited_by,
                 created_by, deleted_at
                 -- day_id NULL  => the To be planned bucket, the sidebar
                 -- place_id NULL => a note with no pin
                 -- created_by is the avatar on the card
                 -- order_key is a fractional index string, see §6
                 -- status: planned | visited | skipped

travel_legs      id, trip_id, day_id, mode, carrier, code, depart_at, arrive_at,
                 from_place_id, to_place_id, note
                 -- mode: plane | train | ferry | bus | car. the Planner travel row
lodging          id, trip_id, place_id, name, check_in, check_out, note
                 -- spans nights, so it is a date range rather than one day

attachments      id, trip_id, stop_id, kind, r2_key, drive_file_id, name, size
                 -- post-MVP. drive_file_id is why §5 plumbs drive.file now

sources          id, trip_id, kind, config, last_synced_at, cursor, status
                 -- kind: google_my_map | manual
import_runs      id, source_id, workflow_id, status, stats, started_at, finished_at

ops              id, trip_id, seq, actor_id, entity_type, entity_id, patch
                 -- append-only. replay for offline clients, and an undo history for free
```

Presence is DO memory. Tiles are R2 objects. Nothing else is stateful.

**Deletion is soft** (`deleted_at`). Someone removing a stop on a shared trip while another person is
offline editing it needs to be undoable.

**The To be planned sidebar is not a separate table.** It is `stops WHERE day_id IS NULL`, which is
what makes dragging onto a day a single field update and keeps drag-back-off free.

## 10. Decisions made

| | | |
|---|---|---|
| Places in | **Google My Maps**, KML endpoint, hourly sync | §3 |
| Spreadsheet | **Replaced** by the Planner grid. No import, no export in v1 | §4 |
| Place search | **Places API (New)**, `locationBias` circle centred on the open day | §4b |
| Stop text | Description derived, note typed. Bookings are notes, not imports | §4c |
| Mobile planner | **In v1.** One day per screen, with the To be planned tray | §4f |
| Navigation | One dropdown on the trip name. Invite with the avatars, Sources in the Planner | §4h |
| Conflicts | Last writer wins, silently. Deliberate for v1 | §4g |
| Stop actions | Navigate, Visited, note on the phone. Edit, note, delete in the Planner | §4e |
| Trip name | Typed and required. Cities under it are derived, and hidden when empty | §4d |
| Auth | **Better Auth** on D1, Google only, no roles, invites never expire | §5 |
| Drive | Plumbed but unused in v1. `drive.file`, asked incrementally | §5 |
| Flights | **Out of v1.** Hand-entered in the Planner travel row | §5b |
| Colour | **Status on the pins**, day as a dot in its own colour | §7 |
| Presence | Live cursors **out of v1**. Live changes stay in | §6 |

## 11. Still open

*Three of these were answered by walking the deployed app on 2026-09-13; the
answers are folded in below and the live ones are listed in §0.*

1. **Naming the sidebar.** You suggested Planned or Scheduled. I used **Planned**, because the list
   holds places that are *not* on a day yet, so Scheduled would say the opposite of what it means.
   Shortlist and Ideas both work too. Easy to change.
2. **Trip scale** — is 11 days and ~50 stops the shape, or should this hold a 30-day trip with 300?
   It changes the Planner's column widths and forces horizontal paging, not the schema.
3. ~~**Times** — many stops will have none. End of the day, or hold a position in the order anyway?~~
   **Settled by the Plan view.** A stop keeps its place in the day's order whether or not it has a
   time; the phone's time gutter simply shows a plus where there is none, and the Planner's grid
   holds untimed stops in a band under the hours until someone drags one on to a time. Nothing is
   pushed to the end of the day, and no time is invented.
4. **Visited** — per person or per trip? If Mika eats the ramen and you do not, is it visited?
5. **Tap targets on the phone.** Now measured rather than guessed: the action buttons are **30 px**
   tall and the search row's add button is **32 x 32**, against Apple's 44 and Google's 48. The
   artboards draw them at those sizes, so this is the spec and a real device disagreeing, and it
   wants a decision — grow them and depart from the artboards, or keep them and extend the hit area
   invisibly the way the sheet handle already does.
6. **Which timezone is "today"?** Not previously asked, and it turns out to matter more than
   anything else in this list. The trip has a `timezone` column that nothing reads, and both the
   Worker and the client ask UTC what day it is. See §0's bug list.
7. **Undoing a drag.** There is no rearrange mode and so no Done button, which means a drop is
   committed the moment you let go. Still true of the sheet, and now of the Planner grid too. On a live shared list that wants an undo, most likely a toast
   reading "Moved to Sat Oct 3" with an Undo action. The op log in section 6 already makes this
   cheap, but nothing in the wireframes shows it yet.
8. **Getting data out.** CSV export is cut from v1. Worth adding back before anyone trusts this with
   a trip they cannot afford to lose, since there is no longer a spreadsheet holding a second copy.
