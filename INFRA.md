# Infrastructure: what is wired, and what is waiting for you

`ENVIRONMENT.md` explains how to configure a Claude Code cloud session so a
deploy can work at all. This file is the running state of the actual
infrastructure, and in particular **the things only you can do, at a computer,
signed in to Cloudflare and Google Cloud.**

Last checked against the live account: 2026-09-12.

---

## Needs you, at a computer

### 1. Replace the Places API key with a server key — blocking eventually, working for now

The key on the environment is restricted by **HTTP referrer**, which is a
browser restriction. The Worker is a server and sends no referrer, so Google
refuses it outright:

```
403 API_KEY_HTTP_REFERRER_BLOCKED — Requests from referer <empty> are blocked.
```

The Worker currently works around this by sending `Referer: https://yvr.kocho.sh`
itself, via the `PLACES_REFERRER` binding. **That is not a security control.**
A referrer the caller writes is one anyone holding the key can also write, so
the key is effectively unrestricted while it looks restricted.

In the Google Cloud console, on the project that owns the key
(`projects/1034596355389`):

- Create a key restricted by **API** to the Places API, and leave the
  application restriction as **None**, or restrict by IP if you can enumerate
  Cloudflare's egress (you probably cannot, so None plus an API restriction is
  the realistic answer).
- Put it on the environment as `GOOGLE_PLACES_KEY`, then start a new session.
- Delete `PLACES_REFERRER` from `alchemy.run.ts` and the `Referer` header from
  `src/lib/places.ts`.

Also worth doing while you are there: set a **quota** on the Places API so a
loop in a future session cannot spend real money. Autocomplete and Details are
billed per session, and the app is careful about that, but a quota is the only
thing that actually stops a mistake.

### 2. Alchemy state does not survive a session

Alchemy keeps state in `.alchemy/`, which is gitignored. A cloud session clones
the repo fresh, so it has no state and a plain deploy fails on resources that
already exist. `alchemy.run.ts` now passes `adopt: true`, which takes over the
existing resources instead, so `npm run deploy` works.

That is a workaround. The durable fix is a state store that outlives the
container:

- Generate a token, keep it somewhere you will not lose it, and add
  `ALCHEMY_STATE_TOKEN=...` to the environment.
- Switch `alchemy.run.ts` to `CloudflareStateStore`.

It must be the **same value for every deploy on the account**, forever, which
is why this is your decision and not a session's.

### 3. The custom domain is not wired

`yvr.kocho.sh` does not exist yet. The zone `kocho.sh` is on the account and the
API token can read zones, but **DNS reads and writes are denied**, so the token
is missing the zone-level scopes:

| Scope | Level |
| --- | --- |
| Zone: Read | already working |
| DNS: Edit | **missing** |
| Workers Routes: Edit | **missing** |

Add both, scoped to `kocho.sh` only. Then uncomment `domains: ["yvr.kocho.sh"]`
in `alchemy.run.ts` and drop `url: true`.

Until then the app lives at the workers.dev hostname below.

### 4. Google sign-in is not set up

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are on the environment and bound
into the Worker, but **nothing uses them** — Better Auth is not installed and
PLAN.md section 5 is unbuilt. When you get to it you will need, in the Google
Cloud console: an OAuth consent screen, and authorised redirect URIs for both
the workers.dev hostname and `yvr.kocho.sh`. The session also needs
`accounts.google.com` and `oauth2.googleapis.com` added to the network
allowlist, which ENVIRONMENT.md already lists as not-yet.

There are currently **two different stand-ins for a signed-in user**, and
section 5 has to collapse them into one:

- `app_user`, a table holding a single `local-user` row.
- A per-browser id in a `yvr_dev_uid` cookie, which is what actually owns trips
  and stops today.

### 5. The basemap bucket is empty

The R2 bucket `yvr-kocho-sh-dev-tiles` exists and has **zero objects**. PLAN.md
section 2 wants a Protomaps `.pmtiles` extract for Japan served from it, which
is a few hundred MB and has to be uploaded once. Until then the map in the UI is
the drawn placeholder from the artboards, not real tiles.

### 6. Give the API token an expiry

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
| Durable Object | `TripRoom` | deployed, still a stub |
| Zone | `kocho.sh` | on the account, not pointed at the Worker |

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

- **`www.google.com` is blocked from a session.** That is the egress policy and
  it does not matter: the My Maps fetch runs in the deployed Worker, on
  Cloudflare's network, which has no such restriction.
- **Chromium cannot reach workers.dev from a session.** The TLS tunnel resets.
  Screenshots are taken through a loopback relay instead. Not a deploy problem.
- **`/user/tokens/verify` returns "Invalid API Token".** The token is
  account-scoped, so it cannot use a user-level endpoint. It is fine — check it
  against `/accounts/<id>` instead.
- **Fonts fall back in session screenshots.** `fonts.googleapis.com` is not on
  the network allowlist, so Newsreader and Figtree do not load in a screenshot
  taken from here and the page renders in Georgia and the system sans. On a
  real device they load normally. Add the two font hosts to the allowlist only
  if you want screenshots from a session to be typographically accurate:

  ```
  fonts.googleapis.com
  fonts.gstatic.com
  ```
