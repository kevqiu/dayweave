# Working on this repo

Read `PLAN.md` for what the product is and why each decision went the way it
did. Read `ENVIRONMENT.md` before trying to deploy. This file is about one
thing only: **the design in `design/` is the specification for the UI, and the
UI is expected to match it 1:1.**

## The artboards are the source of truth

`design/*.dc.html` are not mockups to be loosely inspired by. They are the spec.
Every colour, size, weight, radius and gap in them is a decision. When you build
or change a screen, open the matching artboard and copy the values out of it.
Do not invent a palette, do not round 13.5px to 14px, and do not substitute a
component library.

`design/canvas.json` places each artboard on a canvas and gives it a title.
That is the map of what exists:

| Artboard | The screen it specifies | Built |
| --- | --- | --- |
| `Trips.dc.html` | The trip list: happening now, coming up, past | yes, less the invite banner |
| `NewTrip.dc.html` | Starting a trip — name, then the date range (§4d) | yes |
| `EmptyTrip.dc.html` | A trip with no stops yet | yes |
| `Main.dc.html` | The phone home screen: map, bottom sheet, days, stops (§4c, §7) | yes |
| `PlaceSearch.dc.html` | Adding a place from inside the app (§4b) | yes |
| `KebabMenu.dc.html` | The stop's kebab (§4e) | yes |
| `MoveToDay.dc.html` | Move to another date, with the §8 suggestion | yes |
| `TripMenu.dc.html` | The one dropdown on the trip name (§4h) | yes, less Plan view |
| `SheetFull.dc.html` | The sheet expanded, and drag-to-reorder | the sheet and its Filter, not the title or the drag |
| `AddNote.dc.html` | Only the button reading Add note. See below | n/a |
| `SignIn.dc.html` | Sign in (§5) | no — needs Better Auth |
| `Planner.dc.html`, `PlannerStop.dc.html`, `PlannerMobile.dc.html` | The day grid (§4f) | no |
| `Offline.dc.html`, `Import.dc.html`, `Members.dc.html` | The other states (§4g) | no |
| `Desktop.dc.html` | The wide layout | no |
| `DirectionA/B/C.dc.html` | Rejected directions. Reference only — do not build these | n/a |

**Several artboards are Main.dc.html with one state changed**, and diffing them
against it is the fastest way to see what they actually specify:
`AddNote` selects a stop with no note, so all it says is that the button reads
*Add note* rather than *Edit note* — **it does not draw a note editor**, and
the one in `sheetNote` is written in the system's own language instead.
`KebabMenu` opens the kebab. `TripMenu` adds a real overlay.

### How to read one

They are plain HTML with inline styles, wrapped in `<x-dc>`, plus a `<helmet>`
holding the fonts and a `body` rule. Some carry a `<script data-dc-script>`
block with a `data()` method and a `renderVals()` method: **that script is the
interaction spec**. `Main.dc.html`'s `renderVals` is where the rules for a
stop's colour by status, the open day's highlight, and the visited toggle are
actually written down. Read it rather than guessing.

Templating you will see inside them:

- `{{value}}` — a binding, filled from `renderVals()`
- `<sc-for list="{{days}}" as="day">` — repeat
- `<sc-if value="{{day.open}}">` — conditional

`support.js` is referenced but not in the repo; the artboards are read as
source, not run.

## The tokens, taken from the artboards

Implemented in `src/worker/ui/tokens.ts`. Change them there and nowhere else.

**Frame**: the phone artboards are all `375 x 667`, `overflow: hidden`.

**Type**: `Newsreader` (serif) for trip names, screen titles and section
headings. `Figtree` for everything else. Both from Google Fonts, weights
400/500/600/700. Body sizes run small and specific: 13.5px row titles, 12.5px
day labels, 11px chips, 10.5px and 9.5px for the grey secondary lines.

**Surfaces**: `#FBF6EE` page, `#FFFCF6` raised card, `#F6EFE2` selected or
highlighted row, `#F0E9DC` and `#EFE8DB` the map ground.

**Ink**: `#33302B` primary, `#6B645B` secondary, `#9A9184` and `#A8A093` the
grey lines, `#A0978A` the smallest meta.

**Lines**: `#F1E9DA` the light divider, `#E9DFCE` and `#E4D9C5` borders,
`#EFE6D6` the sheet's own edge.

**Accent**: `#C4826A` is the terracotta used for the caret, the user avatar and
the bias circle. `#A8663C` is link text.

**Status** (pin fill, PLAN.md §7): `#6F9A6B` today, `#E0B355` ahead,
`#BDB4A7` done. The rings around them are `#E4EEE1`, `#F8EECF`, `#EFE9DF`.

**Day hues** are a green-to-yellow ramp, one per day. `Main.dc.html` pins the
first four of an eleven-day trip exactly: `#3F6B4A`, `#57794C`, `#70864D`,
`#8C8C4C`. Those four are copied verbatim; the rest of the ramp is interpolated
on to a pale yellow, because no artboard shows a trip's later days. The
To be planned bucket is `#94897A`, which is not on the ramp.

## Rules the artboards imply

- **A stop's second line is derived, never typed.** `Main.dc.html` writes it as
  `meta`: `ramen`, `park · 12 min walk`, `izakaya · 4 min walk`. Lowercase
  category, then the walk from the previous stop, joined by ` · `. The note is
  a separate thing and only appears when a person has written one. PLAN.md §4c.
- **A trip card's subtitle is derived too**: dates, then the cities, as
  `Sep 30 – Oct 10 · Fukuoka, Kagoshima, Hakone`. With no stops the cities half
  is absent, not empty. PLAN.md §4d.
- **Search rows are 52px** with a 30px rounded icon tile, and read
  `Ramen · 4.3 · 450 m from Ohori Park` — category, rating, then distance from
  the named bias anchor. A place already on the trip gets the `#F6EFE2` row,
  `Already on Sat Oct 3`, and no add button. A result outside the circle is
  dimmed to 0.65 and says `outside the day`.
- **A result outside the bias circle has no add button.** The artboard draws
  that row dimmed to 0.65 with no control at all, so the only way to a distant
  place is *Search anywhere*, which drops the bias and makes it addable. That
  is deliberate, not an omission.
- **Move to day explains itself in words** (§8): a green BEST FIT card naming
  the stops it would slot between, then every other day with the reason it is
  not the answer — *already past*, *different city · 290 km away*, *travel day
  · 8 km detour*. The sentences are built on the server so nothing in the
  client reasons about distance.
- **The bottom sheet has two heights, and the handle is real.**
  `Main.dc.html` puts a click on the handle that toggles the sheet between 312
  and 617 of its 667, so the full state is everything below the 50px top bar.
  Both are kept as a ratio and a `calc` so a phone that is not 667 tall gets
  the same proportions. The handle also drags and snaps, because a handle on a
  phone has to, and its hit area is extended to about 34px without moving the
  38x4 bar the artboard draws. Expanded, the sheet grows the Filter pill from
  `SheetFull.dc.html`.

  **`SheetFull.dc.html` titles that row "All stops" and we deliberately do
  not.** The collapsed sheet has no header at all, so a heading that appears
  only on expanding reads as the sheet turning into a different screen rather
  than the same one getting taller. The two artboards disagree because they
  were drawn as separate screens; the app has one sheet with two heights. Do
  not add the title back.
- **Nothing is a placeholder.** Where the app does not know something, the
  artboards leave it out rather than filling it with a dash. Two consequences
  worth knowing: the map carries no place labels, because the artboards' own
  (HAKATA BAY, OHORI PARK) would be a lie on any other trip; and the 36px time
  column collapses when no stop on the day has a time.

## Where it is implemented

- `src/worker/ui/` — `tokens.ts` the palette and the day ramp, `icons.ts` the
  SVGs, `styles.ts` the stylesheet, `map.ts` the drawn map, `client.ts` the
  browser app, `page.ts` the document. No framework yet; PLAN.md §2 describes
  a React app that does not exist.

  **`client.ts` is one big `String.raw` template, so it must contain no
  backticks at all** — comments included. Use `"a" + b` rather than a template
  literal, and write `design/Main.dc.html` in a comment without quoting it.
- `src/worker/index.ts` — Hono routes.
- `src/worker/store.ts` — D1 reads and writes.
- `src/lib/` — pure, tested logic: Places client, bias circle, derived text,
  order keys, KML.

## Writes are optimistic

An edit applies to the screen first and goes to the network behind it. Saving a
note closes the sheet and shows the text immediately; the write follows. PLAN.md
§2 makes this the shape of every edit, because this gets used on hotel wifi and
in basements, and a round trip is the slowest part of typing six words.

When a write fails the screen goes **back to what it said before** and a notice
in the palette says why. No artboard draws that notice — §4g settles on
last-writer-wins and never shows a conflict — but a write that failed outright
still has to be admitted rather than silently dropped.

## Checks

`npm test`, then `npm run typecheck`, then `npm run deploy`. Verify a UI change
against the deployed Worker and look at it, rather than trusting the tests.
