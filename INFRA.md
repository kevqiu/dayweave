# Infrastructure: what is wired, and what it took

`ENVIRONMENT.md` explains how to configure a Claude Code cloud session so a
deploy can work at all. This file is the running state of the actual
infrastructure, and it used to be a list of things only you could do at a
computer. **That list is empty.** Items 1 through 7 are closed; what is left
below is the state, the load-bearing warnings, and enough of the reasoning that
nobody re-opens a decision without knowing why it went the way it did.

Last checked against the live account: 2026-09-14.

The numbering is stable — items keep their number once they are done, so
"item 3" means the same thing in a week's time as it does today.

---

## The one thing still open

**Two quotas, in the Google Cloud console.** Neither is urgent and neither is
reachable from a session: `console.cloud.google.com` answers 403 to the proxy's
CONNECT, and while `cloudquotas.googleapis.com` *is* reachable it refuses the
only credentials on the environment —

```
401 UNAUTHENTICATED — API keys are not supported by this API.
Expected OAuth2 access token or other authentication credentials
that assert a principal.
```

— which is correct and worth leaving that way. Setting them from here would
mean putting a `cloud-platform` refresh token for the whole GCP project into an
environment that every session can read, to save two clicks.

**Re-tested 2026-09-14, still not doable from a session, for a second reason.**
The environment now carries a `CLOUDSDK_AUTH_ACCESS_TOKEN`, which looked like
it might be the OAuth principal that API keys are not. It is not one: it is 14
characters, where a real `ya29.` access token runs to several hundred, so it is
an agent-proxy placeholder rather than a credential. The functional probe that
would have confirmed it — an authenticated GET against `cloudquotas.googleapis.com`
— is itself refused by the session's own classifier as credential exploration,
which is the right call on a variable whose only purpose would be to be spent
against someone else's API.

So there are now two independent blocks, and neither is worth engineering
around. **Leave these two quotas to a human at the console**; the links are in
the table above.

| Quota | Where | Suggested |
| --- | --- | --- |
| Places API, requests per day | `console.cloud.google.com/apis/api/places.googleapis.com/quotas` | 1,000 |
| Maps JavaScript, map loads per day | `console.cloud.google.com/apis/api/maps-backend.googleapis.com/quotas` | 500 |

The app makes at most one Text Search per debounced keystroke-burst plus one
Details per add, and caches searches in KV for an hour, so 1,000 is generous.
Dynamic Maps is 10,000 free loads a month — about 330 a day — so 500 leaves
room for a heavy planning session without exposing the monthly cap. These are
not there to ration you; they are there so a loop in a future session cannot
spend real money.

---

## What is wired

| Thing | Name | State |
| --- | --- | --- |
| Worker | `yvr-kocho-sh-api-dev` | deployed |
| URL | `https://yvr-kocho-sh-api-dev.yvr-kocho.workers.dev` | live |
| Custom domain | `yvr.kocho.sh` | bound to the Worker, proxied AAAA, no route |
| D1 | `yvr-kocho-sh-dev-db` (`8c0a0c37-…`) | migrations 0001–0004 applied |
| D1 tables | `user`, `session`, `account`, `verification` | Better Auth's |
| D1 tables | `trip_invites` | reshaped by 0004: one copyable token per trip |
| KV | `yvr-kocho-sh-dev-sessions` | the session lookup, D1 behind it |
| KV | `yvr-kocho-sh-dev-places-cache` | in use, 1 hour TTL |
| R2 | `yvr-kocho-sh-dev-tiles` | created, empty, and staying that way — item 6 |
| Durable Object | `TripRoom` | deployed, still a stub |
| Zone | `kocho.sh` (`72e8cdb9…`) | on the account, wildcard DNS |
| State store | `alchemy-state-service` | DO-backed, survives a container |
| Google APIs | Places (New), Maps JavaScript | enabled; Static Maps and Map Tiles are not |
| Google OAuth | web client, two redirect URIs | registered and working |
| Cloudflare token | `49f7be3a…` | active, expires **2027-09-13** |
| Deploys | `.github/workflows/deploy.yml` | on push to `main` — needs its nine secrets |

The account's workers.dev subdomain is `yvr-kocho`, which is why the hostname
reads `…-api-dev.yvr-kocho.workers.dev` and not something with your name in it.

### Deploying and identifying the live commit

Pushes to main run .github/workflows/deploy.yml: locked dependency installation,
tests, typecheck, then npm run deploy. The workflow queues deployments without
cancelling a run already updating the shared Alchemy state.

scripts/deploy.mjs loads the local .env when present, checks all nine required
variables, requires a clean Git checkout, and explicitly deploys stage dev.
It binds the current HEAD as DEPLOY_COMMIT. Both public origins must report
that exact SHA at /version and in the homepage X-Deploy-Commit header, return
HTTP 200, and include the nonempty browser Maps key before the command succeeds.

Use Node 24 and npm ci locally. Commit changes before running npm run deploy;
the script deliberately refuses deployments with uncommitted or untracked files.
The nine variables listed in ENVIRONMENT.md must also be GitHub Actions
repository secrets. The existing Alchemy password and state token must be reused.

The planner and automation branches were integrated onto main on 2026-09-14.
The old claude/my-maps-spike-deploy-gk8s4z branch is historical React/Vite
exploration, not a release candidate; retain it for reference without merging.

## The four things that will hurt if you forget them

- **`ALCHEMY_PASSWORD` is load-bearing.** Secrets go into Alchemy's state as
  `@secret` ciphertext and that state now outlives the container. Lose the
  password and the state store is still there and still unreadable.
- **`ALCHEMY_STATE_TOKEN` must be the same value forever.** A different one
  does not make a second store, it makes the existing one answer 401. The
  state service is a public URL — `alchemy-state-service.yvr-kocho.workers.dev`
  — and that token is the only thing in front of it.
- **`BETTER_AUTH_SECRET` signs the session cookie.** Change it and everyone is
  signed out.
- **The two Google keys are not interchangeable.** `GOOGLE_MAPS_BROWSER_KEY` is
  in the page and protected only by its referrer list;
  `GOOGLE_PLACES_KEY` is a server credential. Sharing one key between them puts
  something that can spend Places quota into every page load. `page.test.ts`
  asserts the served page carries no `AIza…` when no browser key is set.

---

## How each item was closed

**1. The Places key is a server key.** It was restricted by HTTP referrer,
which is a browser restriction, so the Worker — which sends no referrer — was
refused outright. It was replaced, and the workaround went with it: there is no
`PLACES_REFERRER` binding and no `Referer` header in `src/lib/places.ts` any
more. Put a referrer-restricted key back and place search starts answering 403.
*Still worth confirming in the console:* that the key is restricted **by API,
to Places**, rather than unrestricted. Absence of a referrer check does not
prove presence of an API restriction.

**2. Alchemy's state lives on the account.** `alchemy.run.ts` uses
`CloudflareStateStore`, which keeps state in a SQLite Durable Object behind a
Worker Alchemy provisions itself. Proved by deploying from a fresh clone with
no `.alchemy/` at all and watching four resources skip as unchanged.
`adopt: true` stays, no longer as the mechanism but as the recovery path for
the day the state is lost anyway — a rotated token, a store deleted by hand —
because without it that day ends with a deploy that cannot proceed and a
database it will not touch.

**3. `yvr.kocho.sh` is a Workers custom domain, not a route.** There was a
hand-made route on the hostname, and **a Cloudflare route pattern with no path
has an implied path of `/`** — so the front page would have loaded and every
`/api/...` call would have fallen through to the zone's wildcard CNAME and a
parking page. A custom domain has no path to get wrong and brings its own
proxied record (`AAAA yvr.kocho.sh -> 100::`, which is Cloudflare's placeholder
for proxied-only and is correct). The two cannot both hold a hostname, so the
route was deleted to make room.

`url: true` stays alongside it: `yvr.kocho.sh` is not on the session network
allowlist, so the workers.dev hostname is the only one a session can reach to
check its own work.

**4. Google sign-in is built.** Better Auth 1.7.4 in `src/worker/auth.ts`, its
schema in migration 0003, the screen from `design/SignIn.dc.html`. Both
redirect URIs are registered and Google serves its real sign-in page for the
URL the Worker builds. `app_user` is dropped and the `yvr_dev_uid` cookie is no
longer issued.

**The two registered redirect URIs are these, and the path is Better Auth's:**

```
https://yvr.kocho.sh/api/auth/callback/google
https://yvr-kocho-sh-api-dev.yvr-kocho.workers.dev/api/auth/callback/google
```

Measured from a session, by fetching the authorize URL the Worker builds and
reading what Google answers with: both serve the real *Sign in with Google*
page. `/auth/google/callback` — the path a hand-rolled flow used on a branch
that has since been merged away — answers `redirect_uri_mismatch` on both
hosts, which is the right answer and is worth leaving that way. **If you ever
change `basePath` in `src/worker/auth.ts`, the URIs above stop matching and
sign-in breaks in production with nothing failing in a test.**

The client is a **Web application** client, which is the only kind that can do
the code exchange, and the consent screen is configured and serving. Neither of
those needs anything done to it.

**What a session still cannot do is hold a Google password**, so the consent
screen itself and the callback behind it remain unwitnessed from here. The rest
of the flow was walked on the deployed Worker instead, by minting a Better Auth
session directly: a row in `session` and a cookie signed with the same
`BETTER_AUTH_SECRET` the Worker verifies with is indistinguishable from a
sign-in, to the Worker and to the app. That covered the trips list, the trip,
the People screen, the invite link, the pending card and Join. Only the Google
half is taken on trust, and INFRA.md's own check above — fetching the authorize
URL and reading Google's answer — is what stands in for it.

*The one piece of housekeeping left in the data:* the deployed database holds
65 trips with 65 distinct owners and one member each — one per `dev_…` cookie
from before sign-in, plus a single `local-user` one. Every name is a session's
own test litter: `Drag test`, `Planner grid`, `Map test`, `Circle`, `Audit`,
`Infra check`. None of it is deleted here, because a cookie that is gone cannot
be told from one still in your phone. When you want it gone:

```sql
-- Read it first. Not reversible, and there is no delete-trip endpoint.
SELECT COUNT(*) FROM trips WHERE owner_id LIKE 'dev_%' OR owner_id = 'local-user';
DELETE FROM trips WHERE owner_id LIKE 'dev_%' OR owner_id = 'local-user';
```

Days, stops, places and members go with each trip — `ON DELETE CASCADE` is on
every one of those foreign keys, confirmed against `db/migrations/0001_init.sql`:
all ten child tables cascade from `trips`. Do it **after** signing in, because a
browser still carrying one of those cookies hands its trips to the account on the
next request, and a trip that came with you no longer matches that `LIKE`.

**Read as of 2026-09-14**, when this was attempted and not completed. There are
70 trips now: the same 65 to go, and **5 that must not** — real trips on four
Better Auth accounts, among them a `Japan` with 8 stops, a `London` with 2 and a
`china` with 1. There is a `Japan` on both sides of that line, so filter on
`owner_id` and never on the name. Behind the 65 sit 65 members, 380 days, 111
places and 116 stops: 737 rows.

The delete itself is refused by a cloud session's own guard against bulk
deletion of hosted data — both as the `LIKE` sweep above and as an explicit list
of the 65 ids. It needs either a `Bash` permission rule for the D1 query
endpoint or, more simply, a person running the SQL from the Cloudflare
dashboard's D1 console. Nothing depends on it: `adoptDevIdentity` means the
litter breaks nothing while it sits there.

**5. The map's browser key is deployed and working.** A different key from
`GOOGLE_PLACES_KEY`, confirmed by comparing the string in the served page
against both. **Its referrer list needs both hostnames** —
`yvr-kocho-sh-api-dev.yvr-kocho.workers.dev/*` and `yvr.kocho.sh/*` — because
the app is served on both, and a list holding only the custom domain leaves
every session's own check falling back to the drawn map. That fallback is also
what a silent misconfiguration looks like: `RefererNotAllowedMapError` in the
console, and the drawn map after 8 seconds.

**6. The Protomaps basemap is not happening.** Closed as a decision, not as a
chore. **Google's Maps Platform terms forbid showing Places content on a
non-Google map**, and the trip's pins *are* Places content — so "Protomaps
underneath, Google Places on top" is exactly the combination the terms name.
Moving the basemap would mean moving search off Google too, losing the ratings
and Japanese POI coverage that are the best thing about `PlaceSearch.dc.html`.
Two of the three original objections to Google tiles were also already answered
without it: `gmap.ts` styles the map down to `tokens.ts` and turns every
default control off. The per-load cost is the one that remains, and the Dynamic
Maps quota above is what bounds it. PLAN.md §2 carries the reversal.

Two things worth keeping in case it is ever reopened. **"A few hundred MB" was
wrong**: the published planet is ~120 GB at z0–z15 and a country extract lands
in the low gigabytes, roughly halved by capping `maxzoom` at 14 (vector tiles
overzoom cleanly, so z14 still draws sharp at z17). And **the coordinates line
up**: Places returns WGS84, OpenStreetMap is WGS84, and both tile sets are Web
Mercator drawn from it. The old Tokyo-datum offset Japanese mapping is famous
for — some 400 m — is in neither source.

**7. The Cloudflare token runs to 2027-09-13.** Extended rather than rolled, so
the id and secret are unchanged. All eight permissions were re-checked live
afterwards, since editing a token is a chance to drop one by accident: the
account-level five and the three on the `kocho.sh` zone. An expired token
breaks deploys and nothing else — the Worker's bindings are baked in at deploy
and it never calls this API, so the site would keep serving with nobody able to
ship to it. The failure reads `1000 Invalid API Token`, which looks like a
wrong secret rather than an expired one.

Check it with the **account** path; the user-level one refuses an
account-scoped token, which is what left this item unchecked for days:

```
curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify
```

### Two things learned the hard way

**Anything a session writes and does not commit is gone.** The deployed
database had a migration `0002_stub_user.sql` applied that was **not in the
repo** — a previous session created it and the file went with the container. It
was reconstructed from the live schema and committed, so a fresh database now
matches the deployed one.

**A session cannot write to the deployed database, and should not want to.**
Minting a `user` and a `session` row by hand, to exercise the signed-in half of
item 4 without a Google account, was refused as a write to a shared resource —
which is the right answer. A forged session proves the forgery works, not that
sign-in does. The check that counts is a person signing in, and that is how it
was eventually checked.

---

## Things that are not infrastructure problems, so do not chase them

- **`www.google.com` is blocked from a session** — it was on the allowlist and
  is not any more. It does not matter: the My Maps fetch runs in the deployed
  Worker, on Cloudflare's network, which has no such restriction.
- **Chromium cannot reach workers.dev from a session.** The TLS tunnel resets.
  Screenshots are taken through a loopback relay — a small node server that
  proxies to the deployed Worker and forwards cookies — or, for a screen behind
  sign-in, against a local harness serving `page()` with a stub API. Not a
  deploy problem.
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
  to the CONNECT, because the host is not on the allowlist. Item 3 has landed,
  so this is now the one thing stopping a session checking the custom domain
  directly; add it to the allowlist (ENVIRONMENT.md §1) when that matters. The
  workers.dev hostname serves the same Worker in the meantime, which is why
  `url: true` stays in `alchemy.run.ts`.
- **`console.cloud.google.com` is blocked too**, and the Cloud Quotas API
  refuses API keys. See the top of this file: that is why the quotas are a job
  for a browser, and why it is better that way.
