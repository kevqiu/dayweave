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
| `Trips.dc.html` | The trip list: happening now, coming up, past, and the invite waiting at the top | yes |
| `NewTrip.dc.html` | Starting a trip — name, then the date range (§4d) | yes, with two date fields rather than the open calendar |
| `EmptyTrip.dc.html` | A trip with no stops yet | yes |
| `Main.dc.html` | The phone home screen: map, bottom sheet, days, stops (§4c, §7) | yes, less the legend; the sheet has two tabs |
| `PlaceSearch.dc.html` | Adding a place from inside the app (§4b) | yes |
| `KebabMenu.dc.html` | The stop's kebab (§4e) | yes |
| `MoveToDay.dc.html` | Move to another date, with the §8 suggestion | yes |
| `TripMenu.dc.html` | The one dropdown on the trip name (§4h) | yes |
| `SheetFull.dc.html` | The sheet expanded, and drag-to-reorder | yes, less the title |
| `AddNote.dc.html` | Only the button reading Add note. See below | n/a |
| `SignIn.dc.html` | Sign in with Google (§5) | yes, less the view-only door |
| `Planner.dc.html`, `PlannerStop.dc.html` | The day grid (§4f) | yes, less the travel row |
| `PlannerMobile.dc.html` | The phone Planner as a list of rows | **superseded** — the phone draws one column of the grid instead. See below |
| `Members.dc.html` | Who is on this trip, and the link that adds one (§5) | yes, less the invite-by-email half |
| `Offline.dc.html`, `Import.dc.html` | The other states (§4g) | no |
| `Desktop.dc.html` | The wide layout: bar, itinerary rail, map, detail panel | yes, less the sources block |
| `DirectionA/B/C.dc.html` | Rejected directions. Reference only — do not build these | n/a |
| `weather-options.html` | Three drafts of the weather chip on a day header. **Option B is the one built**; A and C are reference only | yes (B) |

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

**Avatars** are dealt terracotta, blue, violet, mauve **in the order people
joined the trip**, which is the order every artboard draws them in and the only
way two people are certain to be different circles. A hash of the id was fine
while a trip had one person on it; it stopped being fine the moment an invite
could be accepted. `peopleOfTrip` deals them, and it is what every avatar on a
trip screen reads — the members in the bar, the author on a stop, your own
circle, and the inviter's on the pending card. The hash survives only for
someone with no name and no place in a trip's join order.

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

- **A stop with a note carries a scroll after its name** — an icon from
  `icons.ts`, never an emoji — on the sheet's rows, the desk rail, the
  Planner's cards and To be planned. Inline where the name wraps, beside it
  where the name truncates, so an ellipsis never cuts it off. A stop with no
  place is its own note and carries none.
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

- **A day header carries the day's weather, in a chip before its count.**
  No `.dc.html` draws it; `design/weather-options.html` drew three ways and
  option B was chosen. The chip holds the sky as a two-tone icon, then the
  chance of rain behind a droplet (only when above 0%), a hairline, and the
  day's high. It is on the sheet's day headers and the desk rail's, not the
  Planner.

  It comes from **Open-Meteo**, which needs no key: one request per trip,
  from `GET /api/trips/:id/weather`, cached three hours in `PLACES_CACHE`
  under `wx:v1:`. `src/lib/weather.ts` decides what is asked and what the
  answer means. A day's point is the centroid of its own located stops, else
  where you sleep that night, rounded to 0.1° so a city is one location.
  Highs travel in °C and `weatherChip` converts for Settings' temperature
  unit, which is the first thing to read that setting.

  **No badge is better than a made-up one**: a day with no point, or outside
  the forecast's reach (92 days back, 16 ahead), draws no chip, and so does
  every day when Open-Meteo is down — the route answers `{ days: {} }` rather
  than an error. It is its own route, asked for behind the trip read, because
  the trip must never wait on a third party; and its reply never renders
  under a drag or a focused field.

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

  **Where you are is a dot, and it pulses only while it is live.** A light blue
  dot (`here` in `tokens.ts`) on a cream ring, drawn as an overlay rather than
  a pin because it is not a thing on the trip. Live means `watchPosition` is
  running and its last answer was a position; then a halo swells and fades
  every three seconds (held still under reduced motion). Under it sits a faint
  circle of the accuracy the phone reports, in metres, so it scales with the
  map. When the signal is lost, the tab is hidden or the map is left, the watch
  stops or errors and the dot stays where it was last seen, grey and still — a
  pulsing dot that is not moving with you is lying. Opening a trip never
  prompts: the browser is asked only by the locate button, and after that, or
  when the site is already allowed, the map follows by itself. A refusal takes
  the dot away. Nothing is stored or sent.

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
  the nearest stop already on the day (else the bias anchor). A place already
  on the trip gets the `#F6EFE2` row, `Already on Sat Oct 3`. **The list shows
  five**, and a *Show N more* row under them reveals the rest; the map's
  suggestion pins follow what is showing. Google is asked for twenty, which
  costs the same request as ten.
- **A search keeps to the trip, and to the day when the day has stops.**
  This reverses the rule that used to be here, that the bias only ranks and
  never gates: on a day with something on it, "ramen" coming back with a shop
  in Tokyo or Ohio is noise, not choice. `src/lib/nearby.ts` is the rule, and
  it is two ranges:

  - **The day.** When the day being added to has located stops, a result more
    than 30 km from all of them is dropped, and the rest are ordered by the
    distance to whichever stop is nearest. An empty day — or To be planned —
    has nothing to measure from, so it keeps Google's order and can reach
    anywhere on the trip. That is where planning the Hakone day from Fukuoka
    still works.
  - **The trip.** Whatever the day, a result has to be in a country the trip
    already has a stop or a stay in, or within 500 km of one. Another city in
    Japan is a fair thing to add to a Japan trip; the same name in the USA is
    not. A trip with nothing located on it keeps everything.

  A pasted Maps link is never dropped: it is one place somebody chose. When
  everything Google found was out of range the list says so — *Nothing within
  30 km of this day's stops* — rather than *Nothing found*.
- **A Google Maps link is a search.** The artboard's *Paste a Google Maps
  link* row opened a second field for the link, a step that only existed
  because the first field did not know a link when it saw one. Now a query
  that is a Maps link (`isMapsLink`, `src/lib/maps-link.ts`, held to its
  browser copy by a test) is followed on the server, the place it names is
  looked up, and it comes back as one ordinary result row, added by the same
  plus. The row is gone, and so is the *Add as a note* row while a link is in
  the field.
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
- **Move to day explains itself in words** (§8): a green BEST FIT card naming
  the stops it would slot between, then every other day with the reason it is
  not the answer — *already past*, *different city · 290 km away*, *travel day
  · 8 km detour*. The sentences are built on the server so nothing in the
  client reasons about distance.
- **A stop at a time its place is shut says so.** No artboard draws opening
  hours; this was designed on a canvas of three options and a mix of two was
  chosen. Places gives `regularOpeningHours` in the same billing tier as the
  `rating` already asked for, and `src/lib/hours.ts` cuts its periods at
  midnight into seven lists of minutes — `places.opening_hours` — which ride
  on every stop to the browser. The browser checks them itself
  (`hours-client.ts`, held to `hours.ts` by a test), because the day and the
  time both change optimistically under a drag and the answer has to follow.

  - **The flag is words on the second line, not a badge**: a struck clock and
    `opens 11:00`, `closed after 22:00` or `closed Mondays`, in `#A06B52`
    (the ink *Remove* is written in) ahead of the derived line. Not a red:
    the day palette starts on one, so red would read as day one. A Planner
    card leads with the flag in place of its time, because a column is too
    narrow for both. A stop with no time is only flagged on a day the place
    is shut all day.
  - **Opened, the day's hours are a bar**: six to midnight, open hours filled
    in the "fine" green, shut hours hatched, the stop's time a tick. The day
    shown is always the day the stop is on, so moving it changes the bar.
    On the day that is today, a dotted line in the "today" green (`#6F9A6B`)
    marks the time it is now, so *is it open yet* reads at a glance.
    It sits above the actions on the phone, in an HOURS block between NOTES
    and TIME on the desk panel, and in the Planner's popover.
  - **When it is wrong, a notice under the bar carries the fix** in the warm
    attention card: *Move to 11:00* — the next opening that day — or, on a day
    it is shut, *Move to Sun Oct 4*: the nearest day of the trip, same city,
    not past, open at the stop's time, else open at all with the time moved
    to its opening (`nearestOpenDay`). *Pick a day* opens Move to day, where
    every day's reason carries its hours and a day shut at the stop's time
    is ranked down, not hidden: below the other days in the city when it
    opens later, below a different city when it is shut all day.
  - **Dragging a place with hours hatches the hours it is shut** in every
    Planner column, labelled *OPENS 11:00*, *CLOSED 15:00 – 17:30*, *CLOSED
    MONDAYS*, and the drop line turns `#A06B52` over a shut hour.

  Hours are **regular hours only** — Google publishes a holiday's special
  hours a week ahead, and a trip is usually further out. A place added before
  hours existed has `hours_at` NULL; the trip read asks Google for up to 20 of
  those behind the response (`waitUntil`, never in front of it), and again
  for any older than thirty days, which is also what keeps them inside the
  caching limit. They show up on the next read. A place Google has no hours
  for draws nothing at all.

- **The bottom sheet has two heights, and the handle is real.**
  `Main.dc.html` puts a click on the handle that toggles the sheet between 312
  and 617 of its 667, so the full state is everything below the 50px top bar.
  Both are kept as a ratio and a `calc` so a phone that is not 667 tall gets
  the same proportions. The handle also drags and snaps, because a handle on a
  phone has to, and its hit area is extended to about 34px without moving the
  38x4 bar the artboard draws. Expanded, the sheet grows the Filter pill from
  `SheetFull.dc.html`.

  **Pulled all the way down it has a third height**, which no artboard draws:
  the handle and one day's header — the open day's, else today's, else the
  first — and nothing else, so the map gets the screen and the day is still
  named. The header loses its pencil and its chevron turns up; tapping it, or
  the handle, brings the list back at 312. Picking a pin on the map does too,
  because the stop it selects has to be seen. The drag snaps to whichever of
  the three heights it is left nearest.

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

  **Holding the card near the top or bottom of the list scrolls it**, faster
  the closer to the edge, so a stop can be carried to a day that is off
  screen. It works on whichever list is under the finger — the sheet, the desk
  rail, the Planner's hours, the drawer — and is run every frame rather than
  on `pointermove`, because a finger held still at the edge fires nothing.
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

    **Smart Plan puts a place only where it is open.** It fits each visit
    inside one of that weekday's opening sessions (`openStart` in
    `src/lib/smart-plan.ts`), starting at the opening when that is later than
    the slot, and leaves a place in the band on a day it is shut rather than
    give it a time the Planner would then flag. A place with no hours is open
    whenever the day is.
  - **A time is set on the time.** PLAN.md §4e puts editing a time on the time
    itself rather than in a menu, so the clock gutter is the control on a
    phone — a faint plus where a stop has no time yet — and the Planner's
    popover carries it as *Set a time* / *Edit time*, which is what the
    artboard's *Edit* can actually do: the name comes from the place and the
    note has its own item. No artboard draws the editor itself; it is the note
    editor's sheet with a time field. The popover also carries *View in Maps*
    for a stop with a place, and every icon in it is drawn at 15px in a 16px
    box, whatever size it is registered at elsewhere.
  - **A card in To be planned opens the same popover**, less the time: a time
    on something with no day is not a plan, and Smart Plan passes over
    anything that already has one. It hangs under the card rather than beside
    it, because the list scrolls. The card keeps its plus, which puts it on
    the day.
  - **The lodging row is one bar per stay, not one cell per day, and it sits
    above the hours rather than under them.** `Planner.dc.html` rules it at
    the foot of the grid, where it is below the fold on any column that has
    scrolled. Where you are sleeping is the frame the day sits inside, so it
    is read before the day: the strip is directly under the day headers.

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
    of its own colour, and anything done — a day in the past, or a stop
    ticked off — is smaller and at 70%, unless it is the one selected. A bed is
    exempt from every part of that, size included — it is never mini;
  - selecting a stop pushes the rest of that day to 75% and every other day to
    30%, and leaves the selected pin itself at full strength — dimming the
    thing you just tapped would be an odd way to point at it;
  - the number on a pin is repeated in the row as a small outlined circle, so
    a dot and a line can be matched without counting.
  - **once anything on a day has a time, only the timed stops are numbered.**
    They are listed first, by the clock — the order the Planner draws them in
    — and the rest follow under a `NO TIME` divider, the band's own words,
    with an empty circle in the day's colour and no number. Their pins stay on
    the map, unnumbered, and the day's trail runs through the numbered stops
    only. A day with no times at all is not split: the order somebody dragged
    it into is the only route it has. `mapOrder` in `client.ts` is the rule.
  - **a stop dropped between two timed stops in the list gets a time about
    halfway** (`timeBetween` in `src/lib/plan.ts`), unless its own already
    falls between them, so it lands in the Planner where it was put rather
    than in the band. Dropped among the untimed, a time it had is cleared.

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

  The search sheet's last row makes one, and it
  reads back whatever is in the field so it is obvious what it will make. It
  takes the day and the time the sheet was opened with, exactly as a place
  does, so tapping 14:00 in the Planner and then this puts the thing at 14:00.
  Afterwards it is an ordinary stop: it drags between days and hours, takes a
  time, can be ticked off and noted.

  What it does not have is a place, so it has no pin on the map, no walk on
  its second line, and **no Open Maps button** — a stop with no place has no
  listing to open. The button opens the place's Maps listing (`mapsUrl` in
  `src/worker/store.ts`), not directions: it lands on the place itself, where
  its hours, photos and reviews are, and directions start from there.

- **An invite is a link, not an email.** `Members.dc.html` draws an address
  field over a Send invite button, and there is no email service behind it —
  adding one so four friends can be told about a trip is a whole dependency
  for one sentence. So the screen makes **one reusable link per trip** instead,
  and whoever is inviting sends it however they already talk to that person.
  The artboard's own *Anyone with the link* card is what carries it, switch and
  copy row and all.

  **That card is drawn for the view-only share link, and it governs the invite
  link instead.** The read-only door (§5, `trip_share_links`) is a separate
  thing and is not built, so its switch would be furniture with nothing behind
  it; the switch that is there turns the invite link on and off, which is the
  explicit revoke §5 puts in place of an expiry. The second line under it says
  which door it is: *can join the trip and edit it*.

  The email field, the *Send invite* button and the *INVITED, NOT YET JOINED*
  list all go with it. Nobody is invited-but-not-listed in a link model: you
  either hold the link or you are on the trip.
- **Following a link joins nobody.** `/i/<token>` puts the invite in the
  visitor's session and hands them the app. Being enrolled on a trip by
  clicking a URL, before you have seen what it is, is not an invitation. The
  yes is the **Join** button on the card `Trips.dc.html` draws, and a browser
  with no account keeps the invite through signing in — which is what the
  `yvr_invite` cookie is for, and why it is a cookie rather than a query string
  that the round trip to Google would drop.
- **The sign-in screen is one button and it goes to Google.** §5: no email
  form, no password, no second provider. The button reads **Continue with
  Google** because Google's sign-in branding permits a fixed set of strings and
  that is one of them, and the `G` beside it is Google's own four-colour asset
  rather than the artboard's dashed placeholder, which §5 already calls a
  placeholder. The scopes are `openid email profile` and nothing else, which is
  what the line under the button promises and why Drive is a later, separate
  consent.

  The divider and *Open it without an account* under it are left out for the
  same reason the share-link switch is: that is the view-only door, and it is
  not built.

  **The button posts rather than links.** Better Auth answers
  `/api/auth/sign-in/social` with the URL to send the browser to instead of
  redirecting the fetch, because a redirect followed by an XHR lands Google's
  consent screen inside a `JSON.parse`. So the button is a `<button>` that posts
  and then sets `location.href`, and it says *Taking you to Google…* while it
  waits.

  **Signing in keeps the trips a browser was already carrying.** A browser that
  made trips before there was a door brings them through it rather than meeting
  its own trips as a stranger — `adoptDevIdentity` moves everything the old
  `yvr_dev_uid` id touches, in one batch.

  **That adoption happens on the way out of the callback, not on the next
  `/api` call**, and the difference is a window. If it waited for the first API
  request, a browser could sign in, stop, and leave the cookie's trips still
  owned by `dev_…` — and a second Google account waving the same cookie would
  take them. It is spent by the sign-in that proves the browser, and the cookie
  is cleared on the way past. A cookie anybody can write must never open an
  account, and this one cannot: it only ever adds trips to a session that
  already exists.
- **Sign-in is Better Auth, and `src/worker/auth.ts` is the whole of it.**
  §5 asked for it, a branch hand-rolled the flow instead, and it went back —
  the reasoning is in §5. Two things worth knowing about the configuration:
  the session lookup is **KV in front of D1, not KV instead of it**, because KV
  is eventually consistent and a read that misses its own write is a person
  bounced back to the sign-in screen; and the D1 binding goes in raw, with no
  Drizzle and no adapter package, because Better Auth's Kysely adapter
  recognises a D1 binding on its own.

  **Better Auth owns `user`, `session`, `account` and `verification`**, and
  migration 0003 is its own generated SQL, copied verbatim. Do not edit those
  tables by hand: regenerate. `usersById` is the **only** place this app reads
  `user` at all — everywhere else a person is an id on a row.

  **`basePath` is `/api/auth`, and that is a deployment fact, not a
  preference.** The two redirect URIs registered with Google are built from it
  (INFRA.md item 4). Changing it breaks sign-in in production with nothing
  failing in a test.

  **One `/api` route answers signed out**, and only one: `/api/invite/pending`.
  A sign-in screen reached by following Mika's link has to be able to say who
  invited you and to what, and `/api/trips` cannot tell it — that call is the
  401 that put the screen up. It reveals a trip name and a first name to
  whoever holds the token, which is exactly what the person who sent the link
  meant to tell them.
- **Membership is enforced, not just documented.** §5 has always said
  membership IS the permission, and until there was somebody to invite nothing
  checked it. Every trip and stop route does now.

  **A trip you are not on answers exactly as a trip that does not exist does.**
  404, never 403: there are no roles, so there is no "you may not" to report,
  and a 403 would confirm to a stranger holding an id that it names a real
  trip. The writes that never load a row say the same thing as a `WHERE`
  clause instead — see `ON_A_TRIP_OF_MINE` — so saving a note does not grow a
  round trip to check.
- **The clock is a setting, and it only changes what is drawn.** Settings
  offers 24-hour (the default, and what every artboard draws) or 12-hour,
  saved on the device beside the units. Times are still stored and sent as
  `14:05`; `displayTime` in `client.ts` is the only thing that reads the
  setting. A 12-hour time is drawn as `2:05` with **no AM or PM**: on a trip
  the half of the day is never in doubt, and the 36px time column keeps the
  artboard's width. The time
  editor is hour, minute and AM/PM selects rather than `<input type="time">`,
  because a native time input draws the browser locale's clock whatever the
  setting says.
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

**Two writes are not optimistic, and both are the same reason.** Turning the
invite link on has nothing to put on the screen until the Worker mints the
token, and Join has nothing to show until the trip it hands back has been read.
A write whose whole result comes from the server cannot be applied first.

When a write fails the screen goes **back to what it said before** and a notice
in the palette says why. No artboard draws that notice — §4g settles on
last-writer-wins and never shows a conflict — but a write that failed outright
still has to be admitted rather than silently dropped.

**The notice goes by itself after five seconds**, and at a desk it is a card in
the bottom-right corner as wide as its words, not a bar across the window. A
notice that reports something that worked — Smart Plan's count — is drawn in
ink rather than the rust of a failure (`inform` in `client.ts`).

## Checks

`npm test`, then `npm run typecheck`, then `npm run deploy`. Verify a UI change
against the deployed Worker and look at it, rather than trusting the tests.

**When there is no Cloudflare token on the environment there is no deploy**, and
a session can still run the thing: `src/worker/__tests__/invites.test.ts` stands
the real Worker up over `node:sqlite` with the actual migrations applied and
drives it through HTTP, Google sign-in included — the only call the flow makes
to Google is the code-for-tokens exchange, so stubbing that one `fetch` is the
whole of the stand-in. The D1 and KV bindings it shims are forty lines between
them, and the same shims behind an `http.createServer` will serve the app on
localhost for a real browser to open. That is not a substitute for looking at
the deployed Worker — it has no Places key and no Maps key — but it is the
difference between checking a route and guessing at one.
