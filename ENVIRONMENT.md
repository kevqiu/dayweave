# Local development and deployment

Use Node 24 and install the committed dependencies with npm ci. Keep the nine
variables listed below in a gitignored .env file in the repository root.
Alchemy loads this file for local development; run npm run dev.

For release, commit changes and run npm run deploy. The release script checks
the variables, requires a clean checkout, pins stage dev, and verifies the
deployed Git SHA at both public hostnames. It never prints secret values.
GitHub Actions runs the same release command on pushes to main; configure the
same nine values as repository secrets. Reuse the existing ALCHEMY_PASSWORD,
ALCHEMY_STATE_TOKEN and BETTER_AUTH_SECRET when moving between environments.

# Running this in a Claude Code cloud session

Two things have to be configured on the cloud environment before a deploy can
work. Both live in the same dialog: open [claude.ai/code](https://claude.ai/code),
select the cloud icon on the session composer, and edit the environment.

## 1. Network access

**This is the blocker people hit first.** The default **Trusted** level allows
package registries and GitHub, and nothing else. It does not allow the
Cloudflare API, so `alchemy deploy` fails before it authenticates, and it does
not allow Google, so the My Maps spike cannot run.

Set **Network access** to **Custom**, tick *Also include default list of common
package managers* so npm keeps working, and list:

```
api.cloudflare.com
places.googleapis.com
accounts.google.com       # Google sign-in, PLAN.md 5
oauth2.googleapis.com     # token exchange
maps.googleapis.com       # the Maps JavaScript bootstrap
fonts.googleapis.com      # so screenshots from a session use the real fonts
fonts.gstatic.com
```

That is what was on it as of 2026-09-13. Two more worth knowing about:

- `yvr.kocho.sh` is **not** on it, so the custom domain cannot be opened from a
  session at all. Add it the day INFRA.md item 3 lands.
- `www.google.com` came off it, which only affects running the My Maps spike
  from a session by hand.

Note what the list is *not* needed for: the deployed Worker reaches Google from
Cloudflare's network, not from this VM, so the allowlist only governs calling
an API from a session for diagnosis.

GitHub is reachable at every level through its own proxy, so it never needs
listing.

## 2. Environment variables

`.env` format, one `KEY=value` per line, in the **Environment variables** field:

```
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_PLACES_KEY=...
BETTER_AUTH_SECRET=...
ALCHEMY_PASSWORD=...
ALCHEMY_STATE_TOKEN=...
```

Plus `GOOGLE_MAPS_BROWSER_KEY`, which is a *different* key from
`GOOGLE_PLACES_KEY` and is the one that ends up in the page. INFRA.md item 5
on why they must never be the same key.

Generate `BETTER_AUTH_SECRET`, `ALCHEMY_PASSWORD` and `ALCHEMY_STATE_TOKEN`
with `openssl rand -base64 32`. `BETTER_AUTH_SECRET` signs the session cookie
and is now load-bearing: change it and everyone is signed out.
`ALCHEMY_PASSWORD` encrypts the secrets Alchemy writes into its state, and
`ALCHEMY_STATE_TOKEN` is the bearer token for the state store below.

**Sessions read these once, at startup.** Editing them does not reach a session
that is already running, so save the changes and then start a new session.

**Anyone who uses the environment can read these values**, Claude included. On
Pro and Max plans an **API credential** is the alternative: the key is attached
by Anthropic's proxy after a request leaves the VM, so it never reaches the
session at all. It has not been tried with Alchemy, which expects
`CLOUDFLARE_API_TOKEN` in the environment and sets its own header.

### GOOGLE_PLACES_KEY has to be a server key

It is one now. An earlier key was restricted by HTTP referrer, which is a
browser restriction, so a Worker — which sends no referrer — was refused
outright:

```
403 API_KEY_HTTP_REFERRER_BLOCKED — Requests from referer <empty> are blocked.
```

The proxy worked around that by sending `Referer: https://yvr.kocho.sh` about
itself, which protects nobody, since anyone holding the key can write the same
header. The key was replaced on 2026-09-13 and the workaround went with it:
there is no `PLACES_REFERRER` binding and no `Referer` header in
`src/lib/places.ts` any more. If you ever put a referrer-restricted key back
on the environment, place search will start answering 403 and this is why.

Restrict its replacement **by API, to Places**. A key that is genuinely
unrestricted is worse than either, because this one is a Worker binding that
every session on the environment can read.

## Cloudflare token scopes

Account-level, scoped to the one account:

| Permission | Why |
| --- | --- |
| Workers Scripts: Edit | The Worker, and the Durable Object namespace that rides along in its upload |
| D1: Edit | The database and its migrations |
| Workers KV Storage: Edit | Sessions |
| Workers R2 Storage: Edit | Tiles and uploads |
| Account Settings: Read | Alchemy resolves the account first |

At zone level, scoped to `kocho.sh` only — **Zone: Read**, **DNS: Edit**,
**Workers Routes: Edit**. All three are on the token as of 2026-09-13 and the
custom domain is wired.

In Cloudflare's current token UI these are not in the account permission list
at all, which is where you will look for them first. Add a **second policy**,
set its scope dropdown from *Entire Account* to **Specified Domains**, pick
`kocho.sh`, and the list underneath becomes the domain permission set that has
DNS and Workers Routes in it. Changing the existing policy's scope instead
would take the Workers, KV, R2 and D1 permissions off the token.

Give the token an expiry, and know when it is. The one on the environment
expires **2027-09-13** (extended from 2026-09-19 on 2026-09-13, keeping the
same secret, so nothing else changed). After it lapses every deploy answers
`1000 Invalid API Token`, which reads like a wrong secret rather than an
expired one — the running Worker is unaffected, since its bindings are baked
in at deploy and it never calls this API. Check any token with:

```
curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify
```

The *user*-level `/user/tokens/verify` answers `Invalid API Token` for an
account-scoped token; that is not the token being wrong, it is the wrong path.

D1: Edit and R2: Edit both include deletion, because Cloudflare does not split
those into create-only.

## Alchemy state, and why it survives a session now

Alchemy used to keep its state in `.alchemy/`, which is gitignored. A cloud
session clones the repo fresh, so it started with no state at all and a plain
deploy failed on the first resource that was already there:

```
CloudflareApiError: Failed to create D1 database "yvr-kocho-sh-dev-db"
- [7502] Database with name: 'yvr-kocho-sh-dev-db' already exists
```

`adopt: true` took over the existing resources rather than failing, which made
`npm run deploy` work from a fresh clone. It is still set, and still safe only
because nothing outside this repo creates those resources — but it is not what
carries a deploy any more.

**That is no longer what happens.** `alchemy.run.ts` uses
`CloudflareStateStore`, which keeps the state in a SQLite Durable Object behind
a Worker Alchemy provisions on the account — `alchemy-state-service` — so a
fresh clone reads back the state of resources it has never seen. Verified from
a clone with no `.alchemy/` at all: four resources skipped as unchanged.

`adopt: true` stays as the recovery path, not the mechanism. See INFRA.md
item 2.

Two environment variables carry this, and **both have to be the same value for
every deploy on the account, forever**:

- `ALCHEMY_STATE_TOKEN` is the bearer token the state service checks. A
  different value does not make a second store, it makes the existing one
  answer 401.
- `ALCHEMY_PASSWORD` decrypts the secrets inside that state. It used to matter
  only for the life of a container. Now the state outlives the container and
  the password does not, unless you keep it.

## Installing better-auth needs a flag, once

`npm install better-auth` fails with `ERESOLVE`. The library declares an
*optional* peer on `@sveltejs/kit`, npm tries to satisfy it, and SvelteKit's
own plugin wants a vite this project does not have:

```
Conflicting peer dependency: vite@8.3.0
peerOptional @sveltejs/kit@"^2.0.0" from better-auth@1.7.4
```

Nothing here is SvelteKit, so the peer is noise. It was installed with
`--legacy-peer-deps`, no `@sveltejs/*` is in the tree, and **`npm ci` from the
committed lockfile is clean and needs no flag** — the tree is already resolved
in it. Only reach for the flag if you are adding or upgrading the dependency
by hand.
