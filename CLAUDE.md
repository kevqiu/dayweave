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
| `NewTrip.dc.html` | Starting a trip — name, then the date range (§4d) | yes, with two date fields rather than the open calendar |
| `EmptyTrip.dc.html` | A trip with no stops yet | yes |
| `Main.dc.html` | The phone home screen: map, bottom sheet, days, stops (§4c, §7) | yes, less the legend; the sheet has two tabs |
| `PlaceSearch.dc.html` | Adding a place from inside the app (§4b) | yes |
| `KebabMenu.dc.html` | The stop's kebab (§4e) | yes |
| `MoveToDay.dc.html` | Move to another date, with the §8 suggestion | yes |
| `TripMenu.dc.html` | The one dropdown on the trip name (§4h) | yes |
| `SheetFull.dc.html` | The sheet expanded, and drag-to-reorder | yes, less the title |
| `AddNote.dc.html` | Only the button reading Add note. See below | n/a |
| `SignIn.dc.html` | Sign in (§5) | no — needs Better Auth |
| `Planner.dc.html`, `PlannerStop.dc.html`, `PlannerMobile.dc.html` | The day grid (§4f) | yes, less the travel row |
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

**Frame**: the phone artboards are all `375 x 667`, `overflow: hidden`. On a
real device the frame fills instead, and the threshold for that is **779px
wide or 700px tall**, not the 420 it used to be: an iPhone Pro Max is 430 CSS
pixels across and 932 down, so it matched neither half of the old query and
got the artboard floating in the middle of the screen. 779 is one below the
width at which the Planner's grid starts working, so the phone layout and the
filling agree about what a phone is.

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

**Day colours** are a palette of eight, handed out in order, then a
golden-angle step past them for a trip longer than eight days. `dayColor` in
`tokens.ts` is the whole rule, and a day's colour is a person's to change
afterwards (see the day's pencil, below). The To be planned bucket is
`#94897A`, which is not in the palette.

This replaced a green-to-yellow ramp interpolated out of the four days
`Main.dc.html` pins exactly (`#3F6B4A`, `#57794C`, `#70864D`, `#8C8C4C`). The
first of those four is still the first colour of the palette, because it is the
green every artboard draws on day one and on the today pin. The other three are
gone, and deliberately: a ramp has one axis, and past about day six the step
between neighbouring days is smaller than the eye separates, so half of a
three-week trip came out the same olive. The eight are as far apart on the
wheel as the palette's register allows.

## Rules the artboards imply

- **A stop's second line is derived, never typed.** `Main.dc.html` writes it as
  `meta`: `ramen`, `park · 12 min walk`, `izakaya · 4 min walk`. Lowercase
  category, then the walk from the previous stop, joined by ` · `. The note is
  a separate thing and only appears when a person has written one. PLAN.md §4c.
- **A trip card's subtitle is derived too**: dates, then the cities, as
  `Sep 30 – Oct 10 · Fukuoka, Kagoshima, Hakone`. With no stops the cities half
  is absent, not empty. PLAN.md §4d.
- **The trip card's map strip carries a node per day.** `Trips.dc.html` draws
  four status pins across the 62px strip of a trip that is eleven days long, so
  what it specifies is the shape rather than the count: one node a day, at the
  centroid of that day's stops, filled by its §7 status. A day with nothing
  located on it has no node, because a node in the middle of the strip would be
  a guess about where a day nobody has planned yet is going to be.
  `src/lib/preview.ts` does the fitting and the trips endpoint hands the client
  finished percentages, so nothing in the browser reasons about coordinates.

  Two things the fit has to settle that no artboard does. **Days in one city
  land on top of one another**, and a heap of six days is a preview of one, so
  the nodes are eased apart until 17px separates their centres: the cluster
  stays where it was and opens into a constellation. **The `DAY 3 OF 11` chip
  is all but opaque**, so a node that lands in its corner is pushed out from
  under it, down or back along the strip, whichever is the smaller lie about
  where the day is. A day hidden behind a label is a day the strip failed to
  preview.
- **A day is a thing a person names and colours.** Every day header carries a
  pencil to the right of its `done/total` count, and it opens a panel under
  that header with a name field and ten swatches: the eight of `DAY_PALETTE`,
  white, and a colour input for anything else. The name is `days.label`, a
  column the first migration declared and nothing wrote to until now; the date
  stays the day's heading, because it is the thing that cannot be wrong, and
  the name sits under it beside the city. An empty name is *no* name, so the
  line goes away rather than becoming blank.

  **The day's colour dot is drawn at the size the map draws it**: 16px on a
  2.5px cream ring with the pin's own shadow, and it does not dim when the day
  is closed. `Main.dc.html` draws a 9px dot at 45% opacity, from a time when
  the colour was one step of a ramp and carried almost nothing. It is now the
  thing that says which day a pin belongs to, so it is drawn like one.

- **The sheet has two tabs: Destinations and Accommodations.** Everything else
  in the app is a place you go on a day. Where you sleep is not: it is one
  thing covering a run of days, and there is no honest way to put it in a
  day's list — repeated on six days it reads as six hotels, and shown on one
  it reads as a single night. So the sheet lists stays separately, with the
  dates on them, and the Plan view draws them (below). No artboard draws the
  tabs; they are the sheet's own row.

- **The three-key map legend is gone.** `Main.dc.html` puts *today · ahead ·
  done* over the top left of the map. The ring around a pin already says done
  or not, the open day in the list beside it says which day is which, and
  three words of glossary cost more of a 375px map than they explain. The
  same chip still appears, once, to say a trip has nothing on the map yet.

- **The map's two controls do something.** The artboard draws a layers button
  and a locate button, and PLAN.md's own bug list had both of them doing
  nothing. Layers had nothing behind it — §2 turns Google's basemaps off and
  there is no second one — so the pair is now *fit the whole trip* and *where
  I am*. They are drawn **only over the real Google map**: the drawn fallback
  has no camera to move, and a control that responds to nothing is worse than
  one that is not there.

  **The camera is only fitted when what it is showing changes.** It used to be
  re-fitted on every render, so ticking a stop off or saving a note threw away
  a pan. `dayFitKey()` is the token: opening another day changes it and the map
  follows, and the two controls stamp it so a camera somebody moved by hand is
  left where they put it.

- **Both ends of a date range are fields, and the calendar is a picker.**
  `NewTrip.dc.html` opens six months of calendar and asks for two taps on it.
  That works on an artboard whose trip starts in the month already showing;
  on a phone the range is invisible until both taps land, a mis-tap silently
  restarts it, and a trip in April means scrolling for a month that may not be
  among the six. So there are two fields saying which end is which and what has
  been chosen, and tapping one opens the same calendar on that end's month.
  One calendar serves all of it: a new trip, a trip being changed, and a stay.

- **A trip can be renamed and its dates moved** (§4d's *changing the dates
  later*, written and unbuilt). *Change trip* is the third item in the one
  dropdown. Days inside both the old range and the new one keep their rows,
  which is what keeps their stops, their names and the colours somebody chose;
  anything on a day that falls outside the new range lands in To be planned,
  because the one thing a date change must never do is throw away places
  somebody found.

- **Search rows are 52px** with a 30px rounded icon tile, and read
  `Ramen · 4.3 · 450 m from Ohori Park` — category, rating, then distance from
  the named bias anchor. A place already on the trip gets the `#F6EFE2` row,
  `Already on Sat Oct 3`, and no add button. A result outside the circle is
  dimmed to 0.65 and says `outside the day`.
- **The bias never gates anything — it ranks.** A result outside the circle is
  dimmed to 0.65 and says how far, and is added by the same button as any
  other. `PlaceSearch.dc.html` happens to draw its far row without a control,
  and an earlier pass read that as a prohibition and wrote it down here as
  deliberate. It was wrong: PLAN.md §4b picks `locationBias` over
  `locationRestriction` precisely so a Hakone teahouse stays findable from
  Fukuoka, and a UI that refuses to add one has reimposed the restriction the
  API call was chosen to avoid.
- **There is no "Search anywhere", and there should not be.** The artboard
  draws one and §4b describes it, but measured against the deployed Worker it
  does the opposite of its name. Dropping `locationBias` does not search
  anywhere: Google falls back to the caller's location, which is the
  Cloudflare edge serving the request. "onsen" with it on returned San
  Francisco, Desert Hot Springs and two places in Oregon. It also bought
  nothing — "hakone teahouse", "nara park" and "tsutaya books daikanyama"
  returned identical results with and without the bias, because a name is
  specific enough on its own. The bias only orders generic queries, and
  ordering those by the day you are planning is the whole point.
- **"Outside the day" is only said when the circle came from the open day** —
  its own stops or its lodging. When the circle fell back to a neighbouring day
  or the viewport (§4b's third and fourth cases), the open day has no location
  of its own, so nothing can be outside it and the row says only how far away
  it is.
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
- **Dragging a stop** (§4e) leaves a dashed ghost in the slot it came from,
  lifts a card that follows the finger at `rotate(-1.1deg) scale(1.015)`, and
  draws a green thread where it would land labelled with the walk it adds.
  A collapsed day header turns `#FCF6E6` with a dashed edge and says
  `DROP HERE TO MOVE`.
- **The search view has no top bar.** `PlaceSearch.dc.html` runs the map to the
  top of the frame with the sheet over its lower 28px. The map there shows the
  trip's stops as small green pins, the bias circle dashed in terracotta, and
  the result being looked at as one bigger terracotta pin. Tapping a row looks
  at it; only the `+` adds it.

  **The way out is a "Back to trip" button above the field, not the X the
  artboard draws inside it.** An X in a search field reads as "clear what I
  typed" as readily as "leave", and this is the one screen with no top bar to
  fall back on. It uses the same arrow and 13px label as *Back to trips* in
  `TripMenu.dc.html`. Do not put the X back. The drop writes one op: a day, and an order key between
  the two rows it landed between.

  **Holding a dragged stop over a collapsed day springs it open**, so the stop
  can be placed between that day's items rather than only tacked on its end.
  No artboard draws this; it is built from the palette. Nothing moves for the
  first 500ms, because a finger passing over a day on its way somewhere else
  must not disturb it. Over the next 1000ms a skeleton accordion grows under
  the header and the card in the air shrinks from `scale(1.015)` to `0.915`
  as it straightens — the growing *is* the progress, so there is no separate
  "keep holding" indicator. At the end the day really opens.

  The skeleton has as many rows as the day has stops, up to three, so it is
  not a lie about what is about to appear. All of it is painted frame by frame
  through `requestAnimationFrame` with direct DOM writes, because the finger is
  still and `pointermove` has stopped firing, and because a `render()` would
  destroy the skeleton mid-grow.

  **What is being dropped is decided by whether a neighbour is known, not by
  which day it started on.** After a day springs open the stop is being ordered
  inside a day it did not come from, so the green thread shows; the
  `DROP HERE TO MOVE` highlight is only for a day whose list is not showing.

  **A drag's `pointermove` and `pointerup` listeners go on the `window`, never
  on the handle.** Starting a drag re-renders, which replaces the handle and
  throws away any pointer capture held on it — nothing moves and nothing
  drops. This has now been the cause of two bugs, the sheet handle and this
  one.
- **The Plan view is one view at two densities, not two screens.** PLAN.md §4f:
  a seven-column grid cannot work at 375px, so the phone draws the day as a
  clock and the desk draws the week as a grid. Both read the same trip payload
  and write the same ops, and crossing 780px re-renders from one into the
  other. `#frame` fills the viewport up to `1440 x 900` while the grid is
  showing and shrinks back on the way out; every other screen stays the 375px
  phone, because `Desktop.dc.html` is not built.

  **780 is where the grid starts working, and it is not the artboard's 1440.**
  1440 is the width the Planner was drawn at, not the width it needs: what it
  needs is a column per day wide enough to read a place name in, and room for
  the tray beside them. So the grid deals **as many days as fit** — seven at
  1280 and up, fewer below, never a column under 120px and never fewer than
  three days — rather than squeezing seven columns into a tablet. The height
  half of the query keeps a phone on its side out of it.

  **It opens where the day is.** A calendar that opens on 08:00 with the day
  below the fold has hidden what it was opened for, and on a trip where
  nothing has a time yet everything is in the band under the hours. So the
  first render of a page scrolls to the earliest card, or the band, or the
  hour it is now — and only the first, because after that the scroll belongs
  to whoever is reading it.

  **Everything the two densities measure lives in `src/lib/plan.ts`**, where it
  is tested: the row heights, the free slots, the hours a column covers, where
  a card sits and what time a drop lands on. The browser needs the same
  arithmetic and there is no bundler between them, so
  `src/worker/ui/plan-client.ts` carries it again as a script — and
  `plan-client.test.ts` runs that script and checks it agrees with
  `src/lib/plan.ts` on a table of inputs, so the copy cannot drift quietly.

  Four things the artboards do not settle, decided here:

  - **A row's height answers to the gap after it.** `PlannerMobile.dc.html`
    draws five rows at 46/62/46/74/46 against times that no single rule
    reproduces — the 62 in particular answers to nothing else on the page.
    What it does say is that the row with the largest following gap is the one
    carrying the dashed slot. So every row is 46, and a row grows by the slot
    when the gap after it is 75 minutes or more. A visited stop never grows
    one: that gap is in the past, and the plus on the slot is an invitation to
    plan.
  - **Untimed stops wait in a band under the hours.** Every card on
    `Planner.dc.html` has a time and most stops on a real trip have none
    (PLAN.md §11). Giving them one nobody chose is exactly the placeholder this
    file forbids, so they sit in a `NO TIME` band at the foot of their column,
    dashed, and drag up on to the hours to get the time they land on. Dragging
    one back down clears it.
  - **A time is set on the time.** PLAN.md §4e puts editing a time on the time
    itself rather than in a menu, so the clock gutter is the control on a
    phone — a faint plus where a stop has no time yet — and the Planner's
    popover carries it as *Set a time* / *Edit time*, which is what the
    artboard's *Edit* can actually do: the name comes from the place and the
    note has its own item. No artboard draws the editor itself; it is the note
    editor's sheet with a time field.
  - **The lodging row is one bar per stay, not one cell per day.**
    `Planner.dc.html` writes the hotel's name into every column it covers, so
    "The Blossom Hakata" is drawn three times in a row and reads at a glance as
    three hotels. A stay is one thing spanning days, so it is drawn as one bar
    spanning columns. The day you change hotels belongs to both of them and the
    artboard has no answer for that — it prints one name per cell and picks —
    so that day is split down the middle: the stay you are leaving keeps the
    left half, the one you are arriving at takes the right, and the seam falls
    on the change. Three stays on one day would put two of them in one half;
    that is a trip nobody is planning, and lanes for it would cost the strip
    the height that makes it legible. A bar running off the edge of the page
    squares that end off and dashes it. All of it is `lodgingBars` in
    `src/lib/plan.ts`, tested there and mirrored into `plan-client.ts`.

    On a phone there is one day showing and nothing to span, so the stays for
    that day sit as chips under the rail — both of them, in order, on the day
    of a change.

  - **The travel row is not built.** `Planner.dc.html` rules a second strip
    under the grid for flights and trains. `travel_legs` is a table with no API
    and no way to put anything in it, so drawing the row would be furniture
    with nothing behind it. The same goes for the add-a-day rails either side
    of the grid.

  **What is being dragged decides how the drop is read.** A sheet stacks its
  days, so the finger's y says which one it is over. The Planner's columns sit
  side by side and share every y, so there the x is the whole answer — and a
  hit test that only checked y quietly dropped everything on Monday.

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
  order keys, the Plan view's geometry, the trip card's nodes, KML.

## The map

`Main.dc.html` draws the map by hand, and `src/worker/ui/map.ts` reproduces that
drawing. It is the fallback, not a placeholder: it renders the day's real
coordinates as pins in their real relative positions.

When `GOOGLE_MAPS_BROWSER_KEY` is set the screen shows the real Google map
instead, with the day's stops as the artboards' status pins. **PLAN.md §2
decided against Google tiles** — per-load cost, tiles that cannot be restyled,
and Google's furniture in a calm design — and that decision was overridden
later. Two of the three objections are answered in `gmap.ts`: the style takes
the map down to the palette in `tokens.ts`, and every default control is off so
the only furniture is ours. The cost is real and remains.

The key in the page is **never** `GOOGLE_PLACES_KEY`. A Maps JavaScript key is
public by design; the Places key is a server credential. See INFRA.md.

If the Maps script does not load within 8 seconds the drawn map comes back.
That timeout is not decoration: on a network that drops the connection
silently the script tag fires no event at all, and without it the map hangs
forever. This is an app for basements.

## Back means back

Every screen and every sheet pushes a history entry, so the phone's back
gesture closes the search, then the stop, then the trip, in the order they were
opened. A layer closed by its own X or scrim calls `closeLayer()`, which asks
the browser to go back; the `popstate` listener is the only thing that actually
closes anything. One source of truth, so the two can never drift.

## Painting after the render, not during it

Three things measure the DOM: the lifted drag card, the search map layer, and
the Google map's fit. All three run **after** `render()` has assembled the
frame, never while it is being built — the element they measure against does
not exist yet during the build. The search circle was positioned against a
667px map instead of the 138px the sheet leaves, and landed behind the sheet.

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
