# Infrastructure: what is wired, and what is waiting for you

`ENVIRONMENT.md` explains how to configure a Claude Code cloud session so a
deploy can work at all. This file is the running state of the actual
infrastructure, and in particular **the things only you can do, at a computer,
signed in to Cloudflare and Google Cloud.**

Last checked against the live account: 2026-09-13.

The numbering below is stable — items keep their number once they are done, so
"item 3" means the same thing in a week's time as it does today.

---

## Needs you, at a computer

### 1. Replace the Places API key with a server key — DONE, verified 2026-09-13

The key on the environment is now a server key. Checked two ways: a bare
`places:searchText` from this session with **no `Referer` header at all**
returns 200, and the deployed Worker searches, biases and writes a stop with
the header gone from the code.

The workaround is removed with it — `PLACES_REFERRER` is out of
`alchemy.run.ts`, the `Referer` header and the `referer` field are out of
`src/lib/places.ts`. Nothing in the repo writes a referrer about itself any
more.

Two things this session could **not** check, because the Google Cloud console
is not reachable from here:

- That the key is restricted **by API** to Places, rather than unrestricted.
  Absence of a referrer check does not prove presence of an API restriction.
  The nearest evidence is negative: the same key on the Geocoding API is
  refused, but for "API not activated on this project", which is about the
  project rather than the key.
- That a **quota** is set on the Places API. Do set one. Autocomplete and
  Details are billed per session and the app is careful about that, but a
  quota is the only thing that actually stops a loop in a future session from
  spending real money.

### 2. Alchemy state does not survive a session — DONE, verified 2026-09-13

It does now. `alchemy.run.ts` uses `CloudflareStateStore`, which keeps the
state in a SQLite Durable Object behind a Worker Alchemy provisions itself:
**`alchemy-state-service`**, on the account's workers.dev subdomain, with
`ALCHEMY_STATE_TOKEN` as its bearer token. Both that token and
`ALCHEMY_PASSWORD` were already on the environment; nothing read either until
now.

Proved rather than assumed, in three deploys:

1. The first announced `[CloudflareStateStore] Creating...` and then adopted
   every resource, because the new store starts empty. That was the last adopt.
2. The second skipped four resources as unchanged and updated only the Worker
   — but `.alchemy/` still held yesterday's files, so that proved nothing.
3. So a **fresh clone with no `.alchemy/` at all** was deployed. It skipped the
   same four. That is the state coming back off the account, which is the whole
   of what this item asked for.

Two things to know now that it is on:

- **`ALCHEMY_PASSWORD` is load-bearing.** Secrets go into state as `@secret`
  ciphertext, and that state now outlives the container. Lose the password and
  the state store is still there and still unreadable. Keep it with the state
  token.
- **The state service is a public URL** — `alchemy-state-service.yvr-kocho.
  workers.dev` — and the bearer token is the only thing in front of it. Same
  care as the API token.

`adopt: true` stays. It is no longer the mechanism, it is the recovery path for
the day the state is lost anyway — a rotated token, a store deleted by hand —
because without it that day ends with a deploy that cannot proceed and a
database it will not touch.

### 3. The custom domain is half-wired, and the half that exists is wrong

The token scopes landed on 2026-09-13 — `dns_records` and `workers/routes`
both read now, where both answered `10000 Authentication error` the same
morning. That unblocked the check, and the check found a route already there:

```
pattern: yvr.kocho.sh    script: yvr-kocho-sh-api-dev
```

**That pattern only matches the root.** A Cloudflare route with no path has an
implied path of `/`, so it matches `https://yvr.kocho.sh/` and nothing else.
Every `/api/...` call would miss it and fall through to the origin, which on
this zone is the wildcard `*.kocho.sh` CNAME to `pixie.porkbun.com`. The page
would load and then every fetch behind it would come back a parking page. It
wants to be `yvr.kocho.sh/*`.

There is also **no DNS record of its own** for `yvr.kocho.sh`. It resolves
today because that wildcard is proxied, which is enough for a route to fire,
but it means the app's hostname is inherited from a record that has nothing to
do with the app.

So there are two ways to finish this, and they conflict — a custom domain and a
route cannot both hold the same hostname:

- **Let Alchemy own it.** Delete the hand-made route, uncomment
  `domains: ["yvr.kocho.sh"]` in `alchemy.run.ts`. A Workers custom domain
  brings its own proxied DNS record, matches every path without a `/*`, and
  lands in the state store with everything else. This is what this file has
  always meant by "wired".
- **Or keep it by hand**, and fix the pattern to `yvr.kocho.sh/*`. One edit,
  but nothing in the repo then knows the domain exists.

The first is better and is the plan of record.

**Do not drop `url: true` at the same time.** INFRA used to say to. The
workers.dev hostname is what a session can actually reach — `yvr.kocho.sh` is
not on the network allowlist — and it is half of the redirect URI pair item 4
wants registered. Drop it once sign-in works on the custom domain, not before.

### 4. Google sign-in is not set up — partly done

What is done: `accounts.google.com` and `oauth2.googleapis.com` are on the
network allowlist and reachable from a session, and the OAuth client resolves
— Google answers for `GOOGLE_CLIENT_ID` rather than `invalid_client`.

What is not: **no redirect URI is registered.** Both of the two the app will
want come back `redirect_uri_mismatch`:

```
https://yvr-kocho-sh-api-dev.yvr-kocho.workers.dev/api/auth/callback/google
https://yvr.kocho.sh/api/auth/callback/google
```

That path is Better Auth's own convention, so it is the pair to register, and
registering them costs nothing before the code exists. The consent screen was
not checked from here; a mismatch is refused before consent is ever reached.

And **nothing uses any of it** — Better Auth is not in `package.json` and
PLAN.md section 5 is unbuilt. That is not a thing you can do at a computer, it
is a thing to build.

There are still **two different stand-ins for a signed-in user**, and
section 5 has to collapse them into one:

- `app_user`, a table holding a single `local-user` row.
- A per-browser id in a `yvr_dev_uid` cookie, which is what actually owns trips
  and stops today.

### 5. The map needs its own browser key

The app can draw the real Google map with the trip's stops on it, and the code
is deployed, but it is **switched off** until you provision a key for it. Until
then the screen shows the drawn map from the artboards, which is a real
fallback rather than a placeholder.

Three things, in the Google Cloud console on the same project:

1. **Maps JavaScript API is already enabled** — no action. Maps Static API and
   Map Tiles API are **not**, and are not needed by this approach.
2. **Create a second key**, restricted by HTTP referrer to the app's hosts:

   ```
   https://yvr-kocho-sh-api-dev.yvr-kocho.workers.dev/*
   https://yvr.kocho.sh/*
   ```

   Restrict it by API to the Maps JavaScript API only.
3. Put it on the environment as `GOOGLE_MAPS_BROWSER_KEY` and start a new
   session.

**It must not be the Places key.** A Maps JavaScript key is public by design —
it is in the page, and its referrer list is all that protects it. The Places
key is a server credential. Sharing one key between them would put a key that
can spend Places quota into every page load.

Note the cost: PLAN.md section 2 chose a self-hosted Protomaps basemap partly
to avoid per-load tile charges. Google tiles bill per map load, so set a quota
on the Maps JavaScript API at the same time. Dynamic Maps is 10,000 free loads
a month and then about $7 per thousand, so a trip this size will not pay
anything — which is also why the cost half of section 2's argument is weaker
than it reads. See item 6.

### 6. The basemap bucket is empty — and do not fill it yet

The R2 bucket `yvr-kocho-sh-dev-tiles` exists and has **zero objects**. PLAN.md
section 2 wants a Protomaps `.pmtiles` extract for Japan served from it. Before
anyone uploads one, three things that were checked on 2026-09-13 and change the
decision.

**Protomaps is a file, not a service.** A `.pmtiles` archive carries the tiles
and a directory index in one object; the browser reads it with HTTP Range
requests, so object storage is the whole server. R2 is the right host because
it has no egress fee. The renderer is MapLibre GL JS with the `pmtiles`
protocol shim, and `@protomaps/basemaps` builds the MapLibre style — about 70
layers — out of a small colour object it calls a flavour, which is exactly the
shape `src/worker/ui/tokens.ts` is already in.

**"A few hundred MB" is probably wrong.** The published planet is around 120 GB
at z0–z15 and a country-sized extract lands in the low gigabytes. Capping
`maxzoom` at 14 roughly halves it, and vector tiles overzoom cleanly, so z14
data still draws sharp at z17. Measure it with `pmtiles extract` against the
remote build — which does not download the planet — before believing any
figure here, and do it on a real computer: a cloud session has a fixed disk
allowance and pushes its uploads through the egress proxy.

**And the blocker is not technical.** Google's Maps Platform Service Specific
Terms forbid using Places content with a non-Google map. Places content may be
shown with no map at all, given attribution, but not on somebody else's. The
trip's pins *are* Places content, so "Protomaps underneath, Google Places on
top" is the one combination the terms name. Moving the basemap therefore means
moving place search off Google too — losing its ratings and its Japanese POI
coverage, which is the best thing about the rows in `PlaceSearch.dc.html`.
That is a product decision, not an infrastructure one, and it has not been
made.

What is *not* a problem, in case it comes up: **the coordinates line up.**
Places returns WGS84, OpenStreetMap is WGS84, and both Google's tiles and
Protomaps' are Web Mercator drawn from it. A pin lands where it belongs. The
old Tokyo-datum offset that Japanese mapping is famous for — some 400 m — is
not in either source.

### 7. Give the API token an expiry

Not checked from here — the token cannot read its own metadata. If it has no
expiry, set one. `D1: Edit` and `R2: Edit` both include deletion, because
Cloudflare does not split those into create-only.

---

## What is already wired

| Thing | Name | State |
| --- | --- | --- |
| Worker | `yvr-kocho-sh-api-dev` | deployed |
| URL | `https://yvr-kocho-sh-api-dev.yvr-kocho.workers.dev` | live |
| D1 | `yvr-kocho-sh-dev-db` (`8c0a0c37-…`) | migrations 0001 and 0002 applied |
| KV | `yvr-kocho-sh-dev-sessions` | created, unused until auth lands |
| KV | `yvr-kocho-sh-dev-places-cache` | in use, 1 hour TTL |
| R2 | `yvr-kocho-sh-dev-tiles` | created, empty |
| Google APIs | Places (New), Maps JavaScript | enabled; Static Maps and Map Tiles are not |
| Durable Object | `TripRoom` | deployed, still a stub |
| Zone | `kocho.sh` | on the account, wildcard DNS, not pointed at the Worker |

Checked live on 2026-09-13: `/health`, creating a trip, searching Places with a
bias, and writing the result as a stop all work against the deployed Worker.
109 tests and `tsc --noEmit` pass, and `npm run deploy` succeeds from a fresh
clone.

The account's workers.dev subdomain is `yvr-kocho`, which is why the hostname
reads `…-api-dev.yvr-kocho.workers.dev` and not something with your name in it.

### Drift that was corrected

The deployed database had a migration `0002_stub_user.sql` applied that was
**not in the repo** — a previous session created it and the file was lost with
the container. It has been reconstructed from the live schema and committed, so
a fresh database now matches the deployed one. Worth knowing that this class of
loss is possible: anything a session writes and does not commit is gone.

---

## Things that are not infrastructure problems, so do not chase them

- **`www.google.com` is blocked from a session** — it was on the allowlist and
  is not any more. It does not matter: the My Maps fetch runs in the deployed
  Worker, on Cloudflare's network, which has no such restriction.
- **Chromium cannot reach workers.dev from a session.** The TLS tunnel resets.
  Screenshots are taken through a loopback relay instead. Not a deploy problem.
- **`/user/tokens/verify` returns "Invalid API Token".** The token is
  account-scoped, so it cannot use a user-level endpoint. It is fine — check it
  against `/accounts/<id>` instead.
- **Fonts no longer fall back in session screenshots.** `fonts.googleapis.com`
  and `fonts.gstatic.com` are on the allowlist now, so Newsreader and Figtree
  load and a screenshot taken from here is typographically honest. This used to
  be the note that said they did not.
- **`yvr.kocho.sh` cannot be reached from a session** — the proxy answers 403
  to the CONNECT, because the host is not on the allowlist. That is an
  allowlist line, not infrastructure, and it will want adding the day item 3
  lands or there will be no way to look at the custom domain from here.
