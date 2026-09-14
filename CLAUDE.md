# Working on this repo

Read `PLAN.md` for what the product is and why each decision went the way it
did. Read `ENVIRONMENT.md` before trying to deploy, and `INFRA.md` for the
state of the live account — every item in it is closed bar two Google quotas. This file is about one
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
| `TripMenu.dc.html` | The one dropdown on the trip name (§4h) | yes |
| `SheetFull.dc.html` | The sheet expanded, and drag-to-reorder | yes, less the title |
| `AddNote.dc.html` | Only the button reading Add note. See below | n/a |
| `SignIn.dc.html` | Sign in (§5) | yes, less the share-link line |
| `Planner.dc.html`, `PlannerStop.dc.html` | The day grid (§4f) | yes, less the travel row |
| `PlannerMobile.dc.html` | The phone Planner as a list of rows | **superseded** — the phone draws one column of the grid instead. See below |
| `Offline.dc.html`, `Import.dc.html`, `Members.dc.html` | The other states (§4g) | no |
| `Desktop.dc.html` | The wide layout: bar, itinerary rail, map, detail panel | yes, less the sources block |
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
- **The window is not a phone.** `#frame` used to be 375 x 667 at every size
  above a phone, so a monitor got a business card of an app floating in an
  ocean of cream — and the Planner, the one screen that grew, stopped at
  1440 x 900 and floated too. There is no reading of "the artboards are 375
  wide" that makes that right: an artboard is drawn at the size of the device
  it is for, and a desk is a different device.

  Below 780px the frame is the phone. At or above, it fills the window and
  each screen lays itself out for the room:

  - **The trip** gets `design/Desktop.dc.html`, which was in this table as not
    built and is the reason the gap existed. Three columns under one bar: the
    316px itinerary rail on the left, the map taking whatever is left, and the
    334px panel for the stop being looked at. The rail's rows keep the phone's
    drag contract — a `drop-zone` with a day id, an `order-row` with a stop id
    — so dragging between days works without a second implementation. **The
    panel is absent when nothing is selected**, rather than held open empty.
  - **The Planner** is the same grid, dealing as many days as fit.
  - **Trips, New trip and Sign in are one column of content each.** There is
    no second pane for them to grow into and inventing one would be furniture,
    so the window holds the column, centred, as a card — which is what it
    always was, minus the pretence. The card hugs its content, so a trip list
    with one trip on it does not hold 700px of cream open underneath; sign-in
    and New trip keep a full height, because their layouts are anchored to the
    bottom of one.

  The artboard's **"WHERE THIS CAME FROM"** block is not built: `sources` is a
  table with no importer behind it. Nor is the "Sheet in sync" chip, for the
  same reason.

- **The Plan view is one grid at every width — one column on a phone.** It was
  two screens: PLAN.md §4f reasoned that a seven-column grid cannot work at
  375px, so the phone drew the day as a clock, a list of rows with the times
  down the side, and the desk drew the week as a grid.

  The premise was right and the conclusion was wrong. The answer to "seven
  columns will not fit" is **one column**, not a different screen. A day at
  375px with real hours in it is a calendar, and you can see the shape of the
  day and the holes in it; a list of rows is an agenda, which is a different
  thing and loses exactly that. So `screenGrid` is the whole Plan view now, and
  `gridDays()` returns 1 below 780px. The clock — `screenPlan`, `dayClock`,
  `planRow`, the phone's own tray strip — is gone, along with its CSS.

  What the phone keeps of its own: the pill rail picks the day (so the column
  header does not repeat the date, and carries the city and the count
  instead), a sideways swipe steps a day, and To be planned is a drawer rather
  than a panel. `#frame` fills the viewport up to `1440 x 900` only for the
  wide grid; the phone stays 375, because `Desktop.dc.html` is not built.

  **780 is where more than one column starts working, and it is not the
  artboard's 1440.** 1440 is the width the Planner was drawn at, not the width
  it needs: what it needs is a column per day wide enough to read a place name
  in, and room for the tray beside them. So above 780 the grid deals **as many
  days as fit** — seven at 1280 and up, fewer below, never a column under
  120px and never fewer than three. The height half of the query keeps a phone
  on its side out of it.

  **To be planned is a drawer on the right, on a phone.** At a desk it is a
  column beside the grid and always open, because there is room for both and
  nothing is covered. At 375px there is no such room, so it slides in over the
  calendar and is shut by default — the calendar is what the screen is for and
  the drawer is where you go to fetch something. Two consequences follow from
  that and are built:

  - **Dragging a card out of it closes it.** The point of picking something up
    in there is to put it down on the day, and the day is underneath.
  - **Dragging a card back against the right edge opens it.** A shut drawer is
    a drop target you cannot see into; holding a card there slides it out so
    the card can go among the others rather than through a slot. It waits
    350ms first, the same reason a collapsed day in the sheet waits before
    springing open: a finger crossing the edge on its way to the last column
    must not drag the drawer out from under it. It is done with a class rather
    than a `render()`, because a render mid-drag would replace the handle and
    the card in the air.

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

  Things the artboards do not settle, decided here:

  - **Where you sleep is pinned above the hours.** `Planner.dc.html` rules a
    lodging strip and this file used to say it was not built, because
    `lodging` is a table with no API and the row would have been furniture
    with nothing behind it. There is something behind it now: a stop whose
    category reads as lodging is an accommodation node, so the strip is fed by
    the trip's own stops. It sits **above** the hours and outside the
    scroller, because a hotel is not an event at a time — it is the fact the
    whole day hangs off — so it should not scroll away with the morning. A bed
    is drawn there and only there: it is skipped in the column, so it does not
    also turn up in the `NO TIME` band.
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
  - **The travel row is not built.** `Planner.dc.html` rules a strip under the
    grid for flights and trains. `travel_legs` is a table with no API and no
    way to put anything in it, so drawing the row would be furniture with
    nothing behind it. The same goes for the add-a-day rails either side of
    the grid. Lodging *is* built, from stops rather than from the `lodging`
    table — see above.

  **A drop is hit-tested on both axes, always.** It used to check y alone
  unless the zone was a grid column, on the reasoning that a sheet stacks its
  days so the horizontal says nothing about which one you are over. True of a
  sheet, and false of everything else — and it caused two bugs. The shut
  drawer is parked off the right edge at full height, so on y alone it matched
  every drop and swallowed the lot: nothing could be put back into To be
  planned. On the desk, a card dragged over the map landed on whichever rail
  day happened to share its y. Where a zone really is full width the extra
  check costs nothing.

  **Overlay zones are asked first.** The drawer sits over a column that spans
  nearly the whole width, so both match; the one on top has to win, or a drop
  into the drawer resolves as a drop on the calendar underneath it.

- **The sign-in screen leaves out its last line, and the avatar gained a
  menu.** `SignIn.dc.html` ends with *Someone sent you a link to look at?
  **Open it without an account***. That is the door for a view-only share link
  (§5), and `trip_share_links` is a table with no API and no way to make one —
  so the words describe a door that is not there. A person who was sent a link
  would also have opened the link rather than arriving at this screen, so the
  line has nothing to do from here even once the door exists. It comes back
  when share links do.

  Going the other way: `Trips.dc.html` draws the header avatar as a `<button>`
  in the terracotta reserved for you, and no artboard draws what it opens. An
  app you can sign in to and not out of is not finished, so it opens a menu
  with the account's email and one item, *Sign out* — built like the stop's
  kebab rather than like the trip menu, because it is a dropdown on a control
  and not a layer over the screen.

  The `G` is Google's own mark now, in `icons.ts`. §5 called the artboard's
  dashed circle a placeholder and said Google ships the real one, so the
  dashed ring went with the placeholder — a border drawn around their logo is
  a restyling of it, which their branding terms do not allow. It is the one
  icon in `icons.ts` that takes no colour, for the same reason. The words are
  theirs too: *Continue with Google*, never *Connect with*, which is not on
  their permitted list.

- **A pin's colour is its day, not its status — and the map shows the whole
  trip.** This is a deliberate departure from PLAN.md §7, which says pin fill
  carries status and nothing else, and from `Main.dc.html`, which draws the
  open day alone and legends it *today / ahead / done*.

  The reason is that the sheet beside the map already colours each day with
  the §7 ramp, and the map was colouring the same stops by clock instead — so
  the row said one thing and its pin said another. Colour now answers "which
  day is this" in the same vocabulary on both sides of the screen. Status did
  not go away: a day gone by, or a stop ticked off, is still grey, and it is
  now grey *and* small *and* half-there rather than grey and full size.

  The whole set of rules lives in `pinLook` in `client.ts` and is tested in
  `src/worker/__tests__/pins.test.ts`, which lifts the function out of the
  client script the way `plan-client.test.ts` lifts the Plan view's
  arithmetic. In short:

  - the open day is full size and **numbered**, every other day is a mini dot
    of its own colour, and a day in the past is mini, grey and at 50%. A bed is
    exempt from every part of that, size included — it is never mini;
  - selecting a stop pushes the rest of that day to 75% and every other day to
    30%, and leaves the selected pin itself at full strength — dimming the
    thing you just tapped would be an odd way to point at it;
  - the number on a pin is repeated in the row as a small outlined circle, so
    a dot and a line can be matched without counting.

  The legend was rewritten to match, because *today / ahead / done* now
  describes a scheme the map does not use. It reads *this day · other days ·
  done*, and its first swatch takes the open day's own hue rather than naming
  a colour.

  **The drawn fallback map still shows the open day only.** Its projection is
  that day's bounding box stretched over a band of the drawing; it is truthful
  about one day's relative positions and says nothing about where the next
  city is, so putting another day through it would place those stops somewhere
  specific and wrong. The pins that are there get the same colours, sizes and
  numbers.

- **Somewhere you sleep is not a stop on the route.** A place whose category
  reads as lodging (`isAccommodation` in `src/lib/derive.ts`) is drawn as a
  solid deep-green pin with a roof in it, takes no number, and is never dimmed
  or recoloured by the day being over or by something else being selected. A
  hotel is where the day begins and ends, so it stays legible whatever else is
  going on.

  It is **derived from the category, not stored in a column**: Places gives
  `hotel`, `hostel`, `japanese inn` and the app already keeps that word. So a
  stop added before the rule existed is recognised too — and a hotel Google
  files under something else is not. The word list is deliberately narrow;
  `apartment` and `campground` are left out, being as often somewhere you are
  visiting as somewhere you are staying.

- **A stop does not have to be a place.** `0001_init.sql` has always allowed
  one — `stops.place_id` is nullable and its comment reads "NULL = a note, no
  pin" — and nothing could make one, so a trip could hold only what Google
  knows about. Half of what is on a day is not that: picking up the rental
  car, getting ready, the two hours before a concert.

  The search sheet's last row makes one, under the Paste-a-link row, and it
  reads back whatever is in the field so it is obvious what it will make. It
  takes the day and the time the sheet was opened with, exactly as a place
  does, so tapping 14:00 in the Planner and then this puts the thing at 14:00.
  Afterwards it is an ordinary stop: it drags between days and hours, takes a
  time, can be ticked off and noted.

  What it does not have is a place, so it has no pin on the map, no walk on
  its second line, and **no Navigate button** — a stop with nowhere to go
  cannot offer to take you there.

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

  **`styles.ts` is the same trap wearing a different coat.** It returns one
  template literal, so a backtick in a comment *inside* the function ends the
  stylesheet there. `tsc --noEmit` does not mind — the wreckage parses — so
  typecheck passes and the deploy is what fails, with esbuild pointing at a
  line. `npm test` does catch it, which is the argument for running the
  checks in the order the last section of this file gives them.

- `src/worker/auth.ts` — Better Auth, and the only place that decides who
  someone is. PLAN.md §5.
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
