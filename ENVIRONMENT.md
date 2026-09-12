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
```

Add these when the matching feature lands, not before:

```
places.googleapis.com     # place search, PLAN.md 4b
accounts.google.com       # Google sign-in, PLAN.md 5
oauth2.googleapis.com     # token exchange
```

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
