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

### 3. The custom domain — DONE on the Cloudflare side, 2026-09-13

`yvr.kocho.sh` is a **Workers custom domain** bound to `yvr-kocho-sh-api-dev`,
created by `alchemy deploy` from `domains: ["yvr.kocho.sh"]`, and held in the
state store with everything else.

How it got here, because the intermediate state is worth remembering. The token
scopes landed first — `dns_records` and `workers/routes` both read now, where
both answered `10000 Authentication error` the same morning. That unblocked the
check, and the check found a hand-made route already there:

```
pattern: yvr.kocho.sh    script: yvr-kocho-sh-api-dev
```

**That pattern matched the front page and nothing else.** A Cloudflare route
with no path has an implied path of `/`, so every `/api/...` call would have
fallen through to the origin — which on this zone is the wildcard `*.kocho.sh`
CNAME to `pixie.porkbun.com`. The app would have loaded and then failed at its
first fetch, against a parking page.

A custom domain has no path to get wrong. The route was deleted to make room,
because the two cannot both hold a hostname, and the deploy then created the
domain and its own DNS record:

```
AAAA  yvr.kocho.sh -> 100::   proxied
```

That `100::` is Cloudflare's placeholder for a proxied-only record and is
correct — the hostname no longer borrows the wildcard.

**`url: true` stays**, against what this file used to say. `yvr.kocho.sh` is not
on the session network allowlist, so the workers.dev hostname is the only one a
session can reach to check its own work, and it is half of the redirect URI
pair item 4 wants. Drop it when sign-in works on the custom domain.

**Not verified from here**: that the domain actually serves. The proxy answers
403 to the CONNECT, so no session can open it. Everything Cloudflare reports is
right; the last check is a human with a browser.

### 4. Google sign-in — the console half was DONE, and now the code half is too

Both redirect URIs are registered as of 2026-09-13. They were answering
`redirect_uri_mismatch` in the morning and Google accepts both now:

```
https://yvr-kocho-sh-api-dev.yvr-kocho.workers.dev/api/auth/callback/google
https://yvr.kocho.sh/api/auth/callback/google
```

`accounts.google.com` and `oauth2.googleapis.com` are on the network allowlist,
and the client resolves. **There is nothing left to do at a computer** except
sign in once and see it work — read on.

**Better Auth is built and deployed**, 2026-09-13. It is a library, so there
was nothing to sign up for: `better-auth` 1.7.4 is a dependency,
`src/worker/auth.ts` is the whole configuration, `db/migrations/0003` is its
schema, and `design/SignIn.dc.html` is on screen.

What that changed, and what is worth knowing about the live system now:

- **`app_user` is dropped.** It held one row — `local-user`, "You",
  you@example.com — and nothing ever read it. `user`, `session`, `account` and
  `verification` are in the deployed database in its place, and migration
  0003 is recorded as applied.
- **The `yvr_dev_uid` cookie is not issued any more**, and does not grant
  anything: `/api/trips` sent with an old one answers `401 sign in first`,
  which was checked against the deployed Worker.
- **A browser still carrying one keeps its trips.** The first request that
  arrives with both a session and a `dev_…` cookie moves that id's trips,
  stops, memberships, invites and ops to the account, then clears the cookie.
  No route, no button, no second chance.
- **Membership is enforced now.** PLAN.md section 5 made membership the
  permission and nothing checked it, because every request used to carry a
  different owner. A trip you are not a member of answers 404, not 403.
- **KV is finally in use.** `yvr-kocho-sh-dev-sessions` caches the session
  lookup in front of D1, which stays the durable store — see `auth.ts` for
  why it is not the only store.

**What a session verified, live, after deploying:**

1. `/api/trips` with no session → `401 {"error":"sign in first"}`.
2. `POST /api/auth/sign-in/social` → 200, carrying a Google URL whose
   `client_id` matches the environment, whose `redirect_uri` is the
   workers.dev one above, whose scope is `email profile openid` — no Drive —
   and which carries a PKCE challenge and a state.
3. **Following that URL, Google serves its real "Sign in with Google" page.**
   That is the strongest check available from here: a wrong client id or an
   unregistered redirect URI answers with an Error 400 page instead. So
   everything up to the point where a human types a password is proven.
4. The sign-in screen itself was loaded from the deployed Worker in a browser
   and looked at.

**What is left, and it needs you.** Sign in once, with a real Google account,
in a browser. Only that exercises the callback, the first `user` row, the
session cookie, and the trips screen behind it — a session cannot, because it
has no Google account and because writing a session into the live database by
hand is not a check, it is a forgery of one.

Two things to look at while you are there:

- **Does your old trip come with you?** If you have used the app in that
  browser before, its trips should appear under your name the moment you land
  back on the trip list. If they do not, the cookie was already gone, which is
  not a bug but is worth knowing.
- **The account menu**, behind the terracotta avatar in the trips header. It
  names the account and signs out. No artboard draws it; `design/Trips.dc.html`
  draws that avatar as a button and this is the smallest honest reading of it.

**The trips a dev cookie owns, and what is being left alone.** The deployed
database holds 65 trips with 65 distinct owners and one member each — one per
`dev_…` cookie, plus the single `local-user` one. Every name in the list is a
session's own test litter: `Drag test`, `Planner grid`, `Map test`, `Circle`,
`Audit`, `Rail probe`, `Infra check`. The largest has five stops and there are
no `ops` rows at all. None of it is deleted here: a cookie that is gone cannot
be told from one still in your phone, so throwing it away is your call and not
a code change. When you want it gone:

```sql
-- Read it first. This is not reversible and there is no delete-trip endpoint.
SELECT COUNT(*) FROM trips WHERE owner_id LIKE 'dev_%' OR owner_id = 'local-user';
DELETE FROM trips WHERE owner_id LIKE 'dev_%' OR owner_id = 'local-user';
```

Days, stops, places and members go with each trip — `ON DELETE CASCADE` is on
every one of those foreign keys. Do it **after** you have signed in and
checked whether anything you care about followed you, because adoption
rewrites `owner_id` and a trip that came with you no longer matches that
`LIKE`.

### 5. The map's browser key — DEPLOYED, and one browser check from done

`GOOGLE_MAPS_BROWSER_KEY` is on the environment as of 2026-09-13, it is a
different key from `GOOGLE_PLACES_KEY`, and `maps/api/js` serves 315 KB of
Maps JavaScript for it rather than an error. Maps JavaScript API is enabled;
Static Maps and Map Tiles are not, and are not needed.

**The deploy has happened.** `npm run deploy` ran from a session holding the
variable on 2026-09-13 and the page now serves a real key: the front page of
the deployed Worker carries `window.__MAPS_KEY__ = "AIzaSy…"`, and that string
compares equal to `GOOGLE_MAPS_BROWSER_KEY` and **not** equal to
`GOOGLE_PLACES_KEY`. So the binding is right and the right key is in the page.

The two other `__MAPS_KEY__` hits in the served page are not a second key.
One reads it, and one is the 8-second fallback clearing it for the rest of the
session so the drawn map comes back.

That is as far as a session can take this. **The last check is a human with a
browser**, because a Maps JavaScript key is enforced in the browser at runtime:
open the deployed app on a trip with stops and see whether the real map draws
or the drawn one comes back after 8 seconds. Two things only you can see:

- **The referrer list.** The list is not enforced on the bootstrap fetch — a
  bare `maps/api/js?key=…` from this session still returned 200 and 315 KB
  after the deploy, which proves the key is live and proves nothing about its
  referrers. If the list is wrong you will see `RefererNotAllowedMapError` in
  the console and the app will fall back to the drawn map after 8 seconds —
  which is the designed behaviour, and also exactly what a silent
  misconfiguration looks like. **The list needs both hostnames**, because the
  app is served on both: `yvr-kocho-sh-api-dev.yvr-kocho.workers.dev/*` and
  `yvr.kocho.sh/*`. A list with only the custom domain on it leaves every
  session's own check falling back to the drawn map.
- **The quota.** Dynamic Maps is 10,000 free loads a month and about $7 per
  thousand after. This trip will not reach that, but a loop in a future session
  could. Set one.

**It must not be the Places key.** A Maps JavaScript key is public by design —
it is in the page, and its referrer list is all that protects it. The Places
key is a server credential. Sharing one key between them would put a key that
can spend Places quota into every page load.

On cost, and on why the basemap decision is still open, see item 6.

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

### 7. The API token's expiry — DONE, extended to 2027-09-13

It has one, it is a year out, and it was six days out when this was checked
the first time. Verified live on 2026-09-13, after you extended it:

```
GET /accounts/<id>/tokens/verify
{"id":"49f7be3a…","status":"active","expires_on":"2027-09-13T23:59:59Z"}
```

**Extended, not rolled**: same id, same secret, so `CLOUDFLARE_API_TOKEN` on
the environment did not change and nothing needed redeploying.

All eight permissions were re-checked against the live API afterwards, because
an edit to a token is a chance to lose one by accident. Both policies are
intact — account-level `Account Settings: Read`, `D1: Edit`, `Workers KV: Edit`,
`Workers R2: Edit`, `Workers Scripts: Edit`, and zone-level on `kocho.sh`
(`72e8cdb9…`) `Zone: Read`, `DNS: Edit`, `Workers Routes: Edit`.

**What an expired token does and does not break.** It breaks deploys and any
Cloudflare API call from a session. It does **not** break the running app: the
Worker's bindings are baked in at deploy time and it never calls the Cloudflare
API, so `yvr.kocho.sh` would keep serving with nobody able to ship to it. The
failure reads `1000 Invalid API Token`, which looks like a wrong secret rather
than an expired one — worth recognising in a year.

Keep giving it an expiry when you renew. `D1: Edit` and `R2: Edit` both include
deletion, because Cloudflare does not split those into create-only.

**How to check it, since the last note here got this wrong.** The *user*-level
`/user/tokens/verify` answers `1000 Invalid API Token`, because the token is
account-scoped and cannot use a user endpoint — which is what made an earlier
session conclude the token could not read its own metadata. The account-scoped
`/accounts/<id>/tokens/verify` is the same check on the right path, and it
returns the id, the status and the expiry.

## What is already wired

| Thing | Name | State |
| --- | --- | --- |
| Worker | `yvr-kocho-sh-api-dev` | deployed |
| URL | `https://yvr-kocho-sh-api-dev.yvr-kocho.workers.dev` | live |
| D1 | `yvr-kocho-sh-dev-db` (`8c0a0c37-…`) | migrations 0001, 0002 and 0003 applied |
| D1 tables | `user`, `session`, `account`, `verification` | Better Auth's, live and empty until someone signs in |
| KV | `yvr-kocho-sh-dev-sessions` | in use: the session lookup, D1 behind it |
| KV | `yvr-kocho-sh-dev-places-cache` | in use, 1 hour TTL |
| R2 | `yvr-kocho-sh-dev-tiles` | created, empty |
| Google APIs | Places (New), Maps JavaScript | enabled; Static Maps and Map Tiles are not |
| Google OAuth | web client, two redirect URIs | registered; Google serves its sign-in page for it |
| Durable Object | `TripRoom` | deployed, still a stub |
| Zone | `kocho.sh` | on the account, wildcard DNS |
| Custom domain | `yvr.kocho.sh` | bound to the Worker, proxied AAAA, no route |
| State store | `alchemy-state-service` | DO-backed, survives a container |

Checked live on 2026-09-13: `/health` answers, the front page serves a real
`__MAPS_KEY__`, `/api/trips` answers 401 without a session, and
`/api/auth/sign-in/social` hands back a Google URL that Google itself accepts.
125 tests and `tsc --noEmit` pass, and `npm run deploy` succeeds from a fresh
clone with the state coming back off the account.

Earlier the same day, before sign-in was required: creating a trip, searching
Places with a bias, and writing the result as a stop all worked against the
deployed Worker. Those paths now need a session, so re-checking them from a
session is not possible — see item 4.

The account's workers.dev subdomain is `yvr-kocho`, which is why the hostname
reads `…-api-dev.yvr-kocho.workers.dev` and not something with your name in it.

### Drift that was corrected

**A session cannot write to the deployed database, and should not want to.**
Minting a `user` and a `session` row by hand to exercise the signed-in half of
item 4 was refused as a write to a shared resource, which is the right answer:
a forged session proves the forgery works, not that sign-in does. The check
that counts is a person signing in.


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
  account-scoped, so it cannot use a user-level endpoint. It is fine, and the
  same check does work on the account path:
  `/accounts/<id>/tokens/verify` returns the token's id, status and
  `expires_on`. This used to say the token could not read its own metadata at
  all, which is what left item 7 unchecked for so long.
- **Fonts no longer fall back in session screenshots.** `fonts.googleapis.com`
  and `fonts.gstatic.com` are on the allowlist now, so Newsreader and Figtree
  load and a screenshot taken from here is typographically honest. This used to
  be the note that said they did not.
- **`yvr.kocho.sh` cannot be reached from a session** — the proxy answers 403
  to the CONNECT, because the host is not on the allowlist. That is an
  allowlist line, not infrastructure, and it will want adding the day item 3
  lands or there will be no way to look at the custom domain from here.
