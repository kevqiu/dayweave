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
www.google.com
places.googleapis.com
```

Add these when the matching feature lands, not before:

```
accounts.google.com       # Google sign-in, PLAN.md 5
oauth2.googleapis.com     # token exchange
```

`places.googleapis.com` is listed above rather than below because place search
(PLAN.md 4b) has landed. Note what it is *not* needed for: the deployed Worker
reaches Google from Cloudflare's network, not from this VM, so the allowlist
only governs calling the API from a session for diagnosis. The same is true of
`www.google.com` and the My Maps fetch.

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
```

Generate the last one with `openssl rand -base64 32`.

**Sessions read these once, at startup.** Editing them does not reach a session
that is already running, so save the changes and then start a new session.

**Anyone who uses the environment can read these values**, Claude included. On
Pro and Max plans an **API credential** is the alternative: the key is attached
by Anthropic's proxy after a request leaves the VM, so it never reaches the
session at all. It has not been tried with Alchemy, which expects
`CLOUDFLARE_API_TOKEN` in the environment and sets its own header.

### GOOGLE_PLACES_KEY has to be a server key

**The key currently on the environment is restricted by HTTP referrer**, which
is a browser restriction. A Worker sends no referrer, so Google refuses it:

```
403 API_KEY_HTTP_REFERRER_BLOCKED — Requests from referer <empty> are blocked.
```

The proxy works around this by sending `Referer: https://yvr.kocho.sh`, which
is the `PLACES_REFERRER` binding in `alchemy.run.ts`. That is a workaround, not
a fix, and it should not be left in place: a referrer the server writes itself
is not a restriction, because anyone holding the key can write the same header.

**Replace it with a key restricted by IP or by API instead**, and restrict it
to the Places API. Then drop `PLACES_REFERRER` and the `Referer` header in
`src/lib/places.ts` with it.

A key that is genuinely unrestricted is worse than either, because this one is
a Worker binding that every session on the environment can read.

## Cloudflare token scopes

Account-level, scoped to the one account:

| Permission | Why |
| --- | --- |
| Workers Scripts: Edit | The Worker, and the Durable Object namespace that rides along in its upload |
| D1: Edit | The database and its migrations |
| Workers KV Storage: Edit | Sessions |
| Workers R2 Storage: Edit | Tiles and uploads |
| Account Settings: Read | Alchemy resolves the account first |

Add at zone level, scoped to `kocho.sh` only, when the custom domain is wired:
**Zone: Read**, **DNS: Edit**, **Workers Routes: Edit**.

Give the token an expiry. D1: Edit and R2: Edit both include deletion, because
Cloudflare does not split those into create-only.

## Alchemy state does not survive a session

Alchemy keeps its state in `.alchemy/`, which is gitignored. A cloud session
clones the repo fresh, so it starts with no state at all and a plain deploy
fails on the first resource that is already there:

```
CloudflareApiError: Failed to create D1 database "yvr-kocho-sh-dev-db"
- [7502] Database with name: 'yvr-kocho-sh-dev-db' already exists
```

`alchemy.run.ts` passes `adopt: true`, which takes over the existing resources
rather than failing, so `npm run deploy` works from a fresh clone. This is safe
only because nothing outside this repo creates those resources.

**The real fix is a state store that outlives the container**, which Alchemy
recommends and which its own CI check asks for. `CloudflareStateStore` keeps
state in a Durable Object and needs one more environment variable:

```
ALCHEMY_STATE_TOKEN=...
```

It has to be the same value for every deploy on the account, so it is a
decision about the account rather than about a session, and it has not been
made yet.
