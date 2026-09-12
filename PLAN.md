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
| 2 | Import a Google Maps saved list | **no public API exists** — see §3 |
| 3 | Read a planning spreadsheet and assign stops to days | the sheet is a grid, not a table — see §4 |
| 4 | Colour by day and by progress | two encodings competing for one channel — see §7 |
| 5 | Mark visited, add notes | none |
| 6 | Import flights from Gmail | Google OAuth verification — see §5 |
| 7 | Live collaboration, no refreshing | ordering conflicts on drag-reorder — see §6 |
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
   ├── Email Worker          trips@yvr.kocho.sh — forwarded confirmations (§5)
   └── Cron                  */5  poll spreadsheet;  hourly  re-read Maps list
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
- **Email Routing** because it removes an entire OAuth verification project. See §5.

**Frontend**: React 19 + Vite + TanStack Router + MapLibre GL JS. Tailwind v4 with the palette as
CSS variables; no component library, the UI is small and specific. Framer Motion only for the sheet.

**Offline is a requirement, not a nice-to-have.** You will open this in a basement ramen shop with
no signal. Ops are written to IndexedDB first, applied optimistically, and flushed to the DO when
the socket comes back. The DO rejects or rebases anything stale and the client re-renders. This
shapes the data model below, which is why ordering is a string and not an integer.

---

## 3. The Google Maps list problem

**There is no API for a user's saved lists.** Not in Maps Platform, not in Drive, not in People.
This is the single biggest unknown in the project and I want to decide it before writing code.

Four ways in, honestly ranked:

**a. Google Takeout upload** — the user exports their list, gets a CSV of `Title, Note, URL`, and
uploads it. Supported, stable, no ToS grey area. Costs one manual step per refresh, so it is an
import rather than a sync. We still have to geocode each title against the Places API because the
CSV has no coordinates.

**b. Google My Maps instead of a saved list** — a different Google product. A My Map has a real
public KML endpoint (`/maps/d/kml?mid=...`) that returns coordinates directly, no geocoding, no
scraping, refreshable on a cron. Fully live sync. The catch is it is not the saved-list UI you
already use, so it means changing how you collect places.

**c. Parse the shared list page** — a public list URL returns HTML with the places in an embedded
JSON blob. It works today. It is automated access to Google's site, it breaks whenever they ship a
change, and datacenter IPs get challenged. I would build this only as a convenience path with (a)
as the fallback the moment it returns nothing.

**d. Paste place links** — you share individual places into the app, we resolve each with Places
API. Reliable and boring. Fine as the always-available manual path regardless of what else we do.

**Recommendation**: build (a) and (d) first, since they are the ones that cannot break. Add (c)
behind a flag as "try to fetch it for me", and treat (b) as the answer if you want genuinely live
sync from Google.

**Places API terms**: place IDs may be stored indefinitely; other place content (name, address,
coordinates) is subject to caching limits and needs periodic refresh. The `places` table carries a
`refreshed_at` for exactly this. I will confirm the current clause before we ship.

---

## 4. The spreadsheet

Your sheet is a **grid**, not a table: columns are days, rows are time slots, cells hold activity
names. A lot of trip spreadsheets look like this and a lot look like a flat `date | time | place`
list instead. The parser has to detect which it is.

Grid parse, as applied to your sheet:

- Row 1 holds dates (`Sep 30`, `Oct 1`, …) → one `day` per column.
- Row 2 holds weekday names → confirms the axis, discarded.
- Row 3 holds the day's location (`Fukuoka`, `Fukuoka->Kagoshima`) → `days.place_label`, and the
  `->` gives us travel days for free.
- Column A holds times (`08:00`…`23:00`) → `stops.start_time`, taken from the row a cell starts in.
- A merged or tall cell spanning rows means a duration → `end_time`.
- The `House 🏠` row at the bottom is accommodation, not a stop → its own `lodging` record per night.

Each non-empty cell becomes an import candidate. Then it has to become either a place or a note:

- `Kanetora Rich Soup Ramen` → looks like a place → geocode, make a pin.
- `Take train to Kagoshima` → looks like an activity → keep as a note on the day, no pin.
- `Dinner` → too vague → keep as an unpinned note and say so.

That classification plus the fuzzy match against the Maps list is what the **Reconcile** wireframe
shows. I would rather show you 7 uncertain matches than silently pin the wrong ramen shop.

**Sync direction**: one-way, sheet → app, is much safer and is what I would build. Two-way means
resolving "Mika moved it in the app while you moved it in the sheet", and spreadsheets have no
per-cell identity to merge against. Open question §10.2.

**Sync mechanism**: Drive API push notifications when the file changes, with a 5-minute cron poll
as the fallback, since Drive channels expire and drop.

---

## 5. Flights from Gmail

The obvious path is the Gmail API with `gmail.readonly`. That is a **restricted scope**: to let
anyone but you use it, Google requires an app verification and an independent CASA security
assessment, which is a multi-week project with an annual cost. For a trip app this is out of
proportion.

**The alternative is better anyway**: Cloudflare Email Routing gives us `trips@yvr.kocho.sh`. You
set a Gmail filter that auto-forwards airline and hotel confirmations there. An Email Worker parses
the message and files the flight. No OAuth, no verification, no standing read access to your inbox,
and it works for anyone you share the trip with regardless of their mail provider.

Parsing: structured data first (many confirmations carry schema.org `FlightReservation` JSON-LD),
then per-airline templates, then an LLM pass for the rest with the result shown for confirmation
rather than applied silently. The wireframe shows that "confirm" state on the Hakone ryokan row.

If you want true zero-touch Gmail reading for just your own account, a personal OAuth client works
without verification for a handful of users. It does not scale past that.

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

There is a real alternative: hue = day, and status shown as fill vs hollow vs struck-through. It
makes multi-day clusters legible at a glance and makes "what have I done today" harder. This is
open question §10.4 and it is worth deciding by looking at the canvas.

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
                 -- kind: google_maps_list | google_sheet | email | manual
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

## 10. Open questions

1. **Maps list import** — which of §3 a/b/c/d do we commit to? This changes whether the list is a
   live sync or a periodic upload.
2. **Spreadsheet** — one-way sheet → app, or two-way? One-way is a week of work, two-way is a month
   and can lose data.
3. **Gmail** — forwarding address, or personal OAuth for your account only?
4. **Colour** — status on the pins with day as a dim, or day hue on the pins with status as fill
   style? Worth looking at the canvas before answering.
5. **Auth and sharing** — Google sign-in only? And can a share link be view-only-no-account, or must
   every viewer sign in?
6. **Trip scale** — is 11 days and ~50 stops the shape, or should this hold a 30-day trip with 300?
   It changes the day list design, not the data model.
7. **Times** — your sheet leaves many cells without times. Should a stop without a time sort to the
   end of its day, or hold a position in the order anyway?
8. **Visited** — per person or per trip? If Mika eats the ramen and you do not, is it visited?
