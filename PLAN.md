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
| 4 | Colour by progress, group by day | two encodings, one channel — §7 |
| 5 | Mark visited, add notes | none |
| 6 | ~~Import flights from Gmail~~ | deferred past v1 — §5 |
| 7 | Live collaboration, no refreshing | ordering conflicts on drag-reorder — §6 |
| 8 | Drag a stop to another day, or "move to day" with a suggestion | the suggestion needs a distance model — see §8 |

---

## 2. Infrastructure

Everything on Cloudflare, declared in `alchemy.run.ts`.

```
yvr.kocho.sh
   │
   ├── Worker "web"          React SPA (Vite) served from Workers Assets
   ├── Worker "api"          Hono. REST + WebSocket upgrade + OAuth callbacks
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
- **No Gmail and no Sheets integration in v1**, so no Google OAuth beyond sign-in. See §4 and §5.

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
Google reskins the Maps front end. A cron re-reads it hourly and new pins land in **Unscheduled**.

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

## 4. The spreadsheet: replaced, not integrated

**Decided, and you were right to push on it.** A sync means committing to parse layouts we have never
seen, forever, and a parser that is 70% right *continuously* is worse than useless — it re-breaks
every time anyone edits a cell.

But "ignore spreadsheets entirely" loses something real. The reason you use one is not the file. It
is the **grid**: days across, time down, the whole trip visible at once. That is a view, not a data
source.

So:

**1. The app grows a Planner view that is the grid.** Days as columns, hours as rows, stops as cards
you drag between days and times, the lodging row along the bottom (your `House 🏠` row). It is the
`Planner` artboard on the canvas. Once that exists the spreadsheet has no job left, because the
cells now know where they are on Earth and who has been there.

**2. A one-time import, not a sync.** Upload a CSV or paste a range. A best-effort parse handles both
the grid shape (yours) and the flat `date | time | place` shape, then drops you in the Reconcile
screen to fix what it got wrong. A 70%-correct parse is completely fine when it runs once and a
human reviews it. Nobody has to keep their sheet in a schema, because after the import there is no
sheet.

**3. Export CSV, always available.** No lock-in, and the reason nobody has to trust us.

What the grid parse gets from your sheet, for reference:

- Row 1 dates → one `day` per column. Row 2 weekdays confirm the axis and are discarded.
- Row 3 locations → `days.place_label`, and the `->` in `Fukuoka->Kagoshima` marks travel days.
- Column A times → `stops.start_time`; a cell spanning rows gives `end_time`.
- The `House 🏠` row → lodging per night, not a stop.
- Each cell then classifies as a place (`Kanetora Rich Soup Ramen` → pin), an activity
  (`Take train to Kagoshima` → note, no pin), or too vague (`Dinner` → note, flagged).

---

## 5. Flights and hotels — not in v1

**Decided: out of scope for the first build.** Added by hand, like any other stop.

Recorded for later, because the obvious path is the wrong one. Gmail's `gmail.readonly` is a
**restricted scope**: shipping it to anyone but yourself requires Google app verification plus an
independent CASA security assessment, which is a multi-week project with an annual fee.

When we do come back to this, the answer is almost certainly **Cloudflare Email Routing**:
`trips@yvr.kocho.sh`, a Gmail filter that auto-forwards confirmations to it, and an Email Worker
that parses them. No OAuth, no verification, no standing access to anyone's inbox, and it works for
every person you share a trip with regardless of their mail provider. Parsing goes structured data
first (many confirmations carry schema.org `FlightReservation` JSON-LD), then per-airline templates,
then an LLM pass whose result is shown for confirmation rather than applied silently.

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
users            id, email, name, avatar_color
trips            id, name, slug, start_date, end_date, timezone, owner_id
trip_members     trip_id, user_id, role            -- owner | editor | viewer
trip_invites     id, trip_id, token_hash, role, expires_at

days             id, trip_id, date, label, place_label, hue, lodging_stop_id
                 -- place_label is "Fukuoka" or "Fukuoka -> Kagoshima", straight from the sheet

places           id, trip_id, google_place_id, name, name_local, lat, lng,
                 address, category, maps_url, refreshed_at
                 -- the geographic thing. deduped per trip. refreshed_at drives the
                 --   Places API cache refresh

stops            id, trip_id, day_id, place_id, title, note,
                 start_time, end_time, order_key, status, visited_at, visited_by,
                 source_id, source_ref, deleted_at
                 -- day_id NULL  => the Unscheduled bucket
                 -- place_id NULL => a note with no pin ("take train to Kagoshima")
                 -- order_key is a fractional index string, see §6
                 -- status: planned | visited | skipped

sources          id, trip_id, kind, config, credential_ref, last_synced_at, cursor, status
                 -- kind: google_my_map | sheet_import | manual   (email later)
import_runs      id, source_id, workflow_id, status, stats, started_at, finished_at
import_candidates id, import_run_id, raw, matched_stop_id, matched_place_id,
                 confidence, decision, resolved_by
                 -- backs the Reconcile screen. never auto-applies below a confidence floor

ops              id, trip_id, seq, actor_id, entity_type, entity_id, patch
                 -- append-only. replay for offline clients, and an undo history for free
```

Presence is DO memory. Tiles are R2 objects. Nothing else is stateful.

**Deletion is soft** (`deleted_at`). Someone removing a stop on a shared trip while another person
is offline editing it needs to be undoable.

---

## 10. Decisions made

| | | |
|---|---|---|
| Places | **Google My Maps**, KML endpoint, hourly sync | §3 |
| Spreadsheet | **Replaced** by an in-app Planner grid. One-time import, CSV export | §4 |
| Flights | **Out of v1.** Email Routing when we come back to it | §5 |
| Colour | **Status on the pins**, day as a dot and as dimming | §7 |

## 11. Still open

1. **Auth and sharing** — Google sign-in only? And can a share link be view-only with no account, or
   must every viewer sign in?
2. **Trip scale** — is 11 days and ~50 stops the shape, or should this hold a 30-day trip with 300?
   It changes the day list and the Planner's column widths, not the data model.
3. **Times** — many of your cells have no time. Should a stop without one sort to the end of its day,
   or hold a position in the order anyway?
4. **Visited** — per person or per trip? If Mika eats the ramen and you do not, is it visited?
5. **The Planner on mobile** — the grid is a desktop view. On a phone, is the day accordion enough,
   or does the Planner need a one-column-per-screen version?
