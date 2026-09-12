# yvr.kocho.sh — trip map

A shared map of a trip. Stops come in from the places you already saved and the
spreadsheet you already wrote, get grouped by day, and grey out as you visit them.
Built to be used one-handed, on a phone, on hotel wifi.

Status: planning. No application code yet. Wireframes are in `design/`.

---

## 1. What it has to do

| | Capability | Hard part |
|---|---|---|
| 1 | Show every stop on one full-screen map, clustered | none, solved problem |
| 2 | Pull places in from Google | saved lists have no API, so we use My Maps — §3 |
| 3 | Plan days and times as a grid | built in, replacing the spreadsheet — §4 |
| 3b | Sign in, invite people to a trip | picking an auth library that runs on Workers — §5 |
| 3c | Search for places and add them | biasing results to the day you are planning — §4b |
| 4 | Colour by progress, group by day | two encodings, one channel — §7 |
| 5 | Mark visited, add notes | none |
| 6 | ~~Import flights from Gmail~~ | deferred past v1 — §5b |
| 7 | Live collaboration, no refreshing | ordering conflicts on drag-reorder — §6 |
| 8 | Drag a stop to another day, or "move to day" with a suggestion | the suggestion needs a distance model — §8 |

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

**Frontend**: React 19 + Vite + TanStack Router + MapLibre GL JS. Tailwind v4 with the palette as
CSS variables; no component library, the UI is small and specific. Framer Motion only for the sheet.

**Offline is a requirement, not a nice-to-have.** You will open this in a basement ramen shop with
no signal. Ops are written to IndexedDB first, applied optimistically, and flushed to the DO when
the socket comes back. The DO rejects or rebases anything stale and the client re-renders. This
shapes the data model below, which is why ordering is a string and not an integer.

---

## 3. Places come from Google My Maps

**Decided.** There is no API for a Google Maps *saved list* — not in Maps Platform, not in Drive,
not in People. Every route into one is either a manual export or scraping a page that will change.

So we use **Google My Maps** instead, which is a different product with a real public endpoint:

```
https://www.google.com/maps/d/kml?mid=<map id>&forcekml=1
```

That returns KML with a `<Placemark>` per pin, each carrying name, description and **coordinates**.
No Places API call, no geocoding, no name matching, no scraping, and nothing that breaks when
Google reskins the Maps front end. A cron re-reads it hourly and new pins land in **Planned**.

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

**Export CSV stays**, in the top right of the Planner. No lock-in, and the reason nobody has to trust
us with the only copy.

Getting an existing trip in is manual: the Planned sidebar fills from your My Map, and you drag
places onto days. For an 11-day trip that is one sitting, and it is the sitting where you would be
rethinking the plan anyway.

---

## 4b. Adding places from inside the app

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

## 5. Auth

**Better Auth**, which is the right call. Alternatives considered:

| | |
|---|---|
| **Better Auth** | Runs on workerd with no Node shims, has first-class D1 support through Drizzle, and stores per-provider `access_token` and `refresh_token` with refresh handled for you. That last part is what makes Drive possible later. |
| Auth.js (`@auth/core`) | Works on Workers with the D1 adapter, but you write invitations, roles and token refresh yourself. |
| Lucia | No longer a library. It became a learning resource, so there is nothing to install. |
| Clerk, WorkOS, Stack Auth | Hosted, good, and a third party plus a bill for a trip app for your friends. |
| Hand-rolled OAuth | About 200 lines and genuinely viable, but you own session rotation, CSRF, token refresh and invite tokens forever. |

**Setup**: Google as the only social provider, sessions in a cookie with the lookup in KV, Better
Auth's tables in D1 alongside ours through Drizzle.

**Roles are ours, not the library's.** Better Auth ships an organization plugin, but a trip is not an
org: people belong to several trips at different levels and there is no tenant above them. So
`trip_members(trip_id, user_id, role)` stays hand-rolled and every API call checks it.

**Invites** are a signed token emailed to an address, valid 7 days, carrying the trip and the role.
Accepting while signed out sends you through Google first and then straight into the trip. The
Members artboard shows both sides of this, including a view-only share link for people who should
not have to make an account at all.

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

## 5b. Flights and hotels — not in v1

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

`TripRoom` Durable Object per trip.

- Client connects over WebSocket, gets a snapshot plus the current sequence number.
- Every change is an **op**: `{type, entity, id, patch, actorId, clientSeq}`.
- The DO validates against membership role, assigns `seq`, writes to D1, broadcasts.
- Clients apply optimistically, then reconcile against the authoritative op.
- Conflict rule is per field, last writer wins, **except ordering**.

**Ordering uses fractional indexing.** `stops.order_key` is a string like `a0`, `a1`, `a0V`. To drop
a stop between two others you generate a key between their keys. Two people reordering at once
produce different keys rather than fighting over the same integer, and nothing has to be renumbered.
This is also what makes offline reorder work.

Presence (who is looking, whose cursor is where) lives only in DO memory and is never persisted.

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

Palette, warm and low-saturation throughout:

```
paper    #FBF6EE     ink      #33302B     line     #E9DFCE
surface  #FFFCF6     ink-2    #8C8479     surface-2 #F6EFE2
today    #6F9A6B on #E4EEE1        ahead  #E0B355 on #F8EECF
done     #BDB4A7 on #EFE9DF
day hues #C4826A #B98F4E #8E9A57 #6E9A78 #5E9694 #6E8CA8 #8A83AE #A87A93 #B07A6E #94897A
```

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
trip_members     trip_id, user_id, role            -- owner | editor | viewer
trip_invites     id, trip_id, email, token_hash, role, expires_at, invited_by, accepted_at
trip_share_links id, trip_id, token_hash, role, revoked_at
                 -- the view-only link, so someone can look without an account

days             id, trip_id, date, label, place_label, hue
                 -- place_label is "Fukuoka" or "Fukuoka -> Kagoshima", set by hand in the Planner

places           id, trip_id, google_place_id, name, name_local, lat, lng,
                 address, category, maps_url, source, refreshed_at
                 -- the geographic thing, deduped per trip by google_place_id
                 -- source: my_map | search | link
                 -- refreshed_at drives the Places content refresh. KML pins never need it

stops            id, trip_id, day_id, place_id, title, note,
                 start_time, end_time, order_key, status, visited_at, visited_by,
                 created_by, deleted_at
                 -- day_id NULL  => the Planned bucket, the sidebar
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

**The Planned sidebar is not a separate table.** It is `stops WHERE day_id IS NULL`, which is what
makes dragging onto a day a single field update and keeps drag-back-off free.

## 10. Decisions made

| | | |
|---|---|---|
| Places in | **Google My Maps**, KML endpoint, hourly sync | §3 |
| Spreadsheet | **Replaced** by the Planner grid. No import at all. CSV export | §4 |
| Place search | **Places API (New)**, `locationBias` circle centred on the open day | §4b |
| Auth | **Better Auth** on D1, Google only, roles hand-rolled | §5 |
| Drive | Plumbed but unused in v1. `drive.file`, asked incrementally | §5 |
| Flights | **Out of v1.** Hand-entered in the Planner travel row | §5b |
| Colour | **Status on the pins**, day as a dot and as dimming | §7 |

## 11. Still open

1. **Naming the sidebar.** You suggested Planned or Scheduled. I used **Planned**, because the list
   holds places that are *not* on a day yet, so Scheduled would say the opposite of what it means.
   Shortlist and Ideas both work too. Easy to change.
2. **Trip scale** — is 11 days and ~50 stops the shape, or should this hold a 30-day trip with 300?
   It changes the Planner's column widths and forces horizontal paging, not the schema.
3. **Times** — many stops will have none. End of the day, or hold a position in the order anyway?
4. **Visited** — per person or per trip? If Mika eats the ramen and you do not, is it visited?
5. **The Planner on mobile** — the grid is a desktop view. Is the day accordion enough on a phone, or
   does the Planner need a one-column-per-screen version?
6. **Tap targets.** You asked for thinner buttons and I made them 36 px tall. Both Apple and Google
   put the floor at 44-48 px. The buttons carry 4 px of padding so the real target clears 44, but if
   they feel small on a real phone that is the number to raise.
