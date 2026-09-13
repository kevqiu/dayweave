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

Generate the last three with `openssl rand -base64 32`. `ALCHEMY_PASSWORD`
encrypts the secrets Alchemy writes into its state; `ALCHEMY_STATE_TOKEN` is
for the state store below and is not used by anything yet.

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

Give the token an expiry. D1: Edit and R2: Edit both include deletion, because
Cloudflare does not split those into create-only.

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
