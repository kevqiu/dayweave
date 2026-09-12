# Running this in a Claude Code cloud session

Two things have to be configured on the cloud environment before a deploy can
work. Both live in the same dialog: open [claude.ai/code](https://claude.ai/code),
select the cloud icon on the session composer, and edit the environment.

## 1. Network access

**This is the blocker people hit first.** The default **Trusted** level allows
package registries and GitHub, and nothing else. It does not allow the
Cloudflare API, so `alchemy deploy` fails before it authenticates, and it does
not allow `workers.dev`, so the deployed spike cannot be called.

Set **Network access** to **Custom**, tick *Also include default list of common
package managers* so npm keeps working, and list:

```
api.cloudflare.com
workers.dev
www.google.com
```

Which side each host is needed on, because it is not obvious:

| Host | Who connects |
| --- | --- |
| `api.cloudflare.com` | the session, so `alchemy deploy` can authenticate and create resources |
| `workers.dev` | the session, to `curl` the spike endpoint on the deployed Worker |
| `www.google.com` | the session only, to compare the KML by hand |

The spike's own fetch of `www.google.com/maps/d/kml` runs **on the Worker**, at
Cloudflare's edge, so it is not subject to this policy at all. That is the whole
reason section 3's spike is an endpoint and not a script — see the comment on
`/api/_spike/my-map/:mid` in `src/worker/index.ts`. Allowing `www.google.com`
here is a convenience for checking the Worker's answer against the raw KML, not
a requirement.

A denied host fails as `curl: (56) CONNECT tunnel failed, response 403`, and
Alchemy reports it as `Failed to create D1 database ... (403): The API returned
an invalid response` — which reads like a token scope problem but is not. The
request never left the VM. `curl -sS "$HTTPS_PROXY/__agentproxy/status"` lists
the rejected hosts under `recentRelayFailures`, which tells the two apart.

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
