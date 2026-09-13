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

### 2. Alchemy state does not survive a session — half done

`ALCHEMY_STATE_TOKEN` and `ALCHEMY_PASSWORD` are both on the environment now.
**`alchemy.run.ts` does not use them.** It is still on the default store,
which is `.alchemy/`, which is gitignored and dies with the container: a
deploy from this session announced `[creating]` against every resource that
has existed for days, and only `adopt: true` stopped it failing.

So the environment half is done and the code half is not. What is left is one
change in `alchemy.run.ts`:

- Switch it to `CloudflareStateStore`, which keeps the state in a Durable
  Object on the account instead.
- Keep `adopt: true` through the first deploy that uses it. The new store
  starts empty, so that deploy is another adopt — and it is the last one.

Left as your call rather than a session's, because the token has to be the
**same value for every deploy on the account, forever**, and because a deploy
that half-switches stores is the one way this repo could lose track of a live
D1 database.

### 3. The custom domain is not wired — NOT done

`yvr.kocho.sh` answers DNS, but that is the zone's **wildcard**, not a record
for this app: `definitely-not-a-record-9x7.kocho.sh` resolves to the same pair
of Cloudflare addresses. Nothing is behind it. The account has **no Workers
custom domain at all** (`/workers/domains` returns an empty list), and
`domains:` is still commented out in `alchemy.run.ts`.

The token is still missing the two zone scopes, and this is now measured
rather than inferred — both endpoints answer `10000 Authentication error`,
which is Cloudflare for "your token may not":

| Scope | Level |
| --- | --- |
| Zone: Read | working — the zone lists, `72e8cdb9…`, active |
| DNS: Edit | **missing** — `/zones/…/dns_records` denied |
| Workers Routes: Edit | **missing** — `/zones/…/workers/routes` denied |

Add both, scoped to `kocho.sh` only. Then uncomment `domains: ["yvr.kocho.sh"]`
in `alchemy.run.ts` and drop `url: true`.

If you see `971 Please wait and consider throttling your request speed` while
checking this, that is not the token. It is Cloudflare rate-limiting the shared
egress address a cloud session goes out through, and it comes and goes on
endpoints that work perfectly a minute later. `10000` is the answer that means
something.

Until then the app lives at the workers.dev hostname below.

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
on the Maps JavaScript API at the same time.

### 6. The basemap bucket is empty

The R2 bucket `yvr-kocho-sh-dev-tiles` exists and has **zero objects**. PLAN.md
section 2 wants a Protomaps `.pmtiles` extract for Japan served from it, which
is a few hundred MB and has to be uploaded once. Until then the map in the UI is
the drawn placeholder from the artboards, not real tiles.

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
