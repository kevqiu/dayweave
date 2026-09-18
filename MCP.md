# Dayweave MCP

The Worker serves a remote MCP endpoint at `https://yvr.kocho.sh/mcp`.
It supports Streamable HTTP with the 2026-07-28 protocol and stateless
2025 protocol compatibility. The endpoint becomes available after deployment
with migration `0005_mcp_oauth.sql` applied by Alchemy.

Add that URL to an MCP client's remote-server configuration and choose OAuth.
The client discovers the authorization and registration endpoints, opens
Dayweave's Google sign-in, and asks the user to approve the requested access.
No manually copied Google token or shared API key is required.

## Google configuration

This reuses `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`BETTER_AUTH_SECRET`. No new secrets, Google API scopes, or Google callback
URLs are required for either existing production hostname. The registered
Google callbacks remain:

- `https://yvr.kocho.sh/api/auth/callback/google`
- `https://yvr-kocho-sh-api-dev.yvr-kocho.workers.dev/api/auth/callback/google`

Google authenticates the person to Dayweave. Dayweave is the OAuth authorization
server for the MCP client and issues its own audience-bound tokens. Google
credentials are never passed through to the assistant. Google continues to
receive only the existing `openid email profile` identity scopes.

Local development can use the consent flow's **Continue locally** button.
Real Google sign-in on a local origin would require registering that exact
local `/api/auth/callback/google` URL with Google.

## Authorization

The supported scopes are `trips:read`, `trips:write`, and `offline_access`.
Reading is required for MCP access; editing tools additionally require writing.
Every operation retains the app's trip membership checks. Tokens cannot grant
access to another account's private trips or change OAuth administration.

Clients register through RFC 7591 Dynamic Client Registration. Desktop clients
using an HTTP loopback callback must declare `application_type: "native"` and
`token_endpoint_auth_method: "none"`. Web clients use HTTPS callbacks. S256 PKCE
is required. Client ID Metadata Documents are not advertised or fetched.

The resource parameter is the exact MCP URL, including `/mcp`. Each production
hostname has its own issuer and resource; tokens cannot be moved between them.

Discovery on the primary domain:

- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server/api/auth`

Better Auth serves authorization, token, registration, and revocation endpoints
under `/api/auth/oauth2/`. Signing keys are stored in D1 and published through
`/api/auth/jwks`. OAuth verification records use D1 for atomic consumption;
Workers KV remains the browser-session cache.

Access tokens last five minutes. Refresh tokens last 30 days and rotate without
a reuse window. Users can disconnect apps through **Settings → Manage connected
apps**, or `/mcp/connections`. Deleting consent removes its refresh/access token
records; the MCP route checks the current consent ID on every request, so an old
JWT stops working immediately and cannot regain access after reconnection.

## Tools

`list_trips`, `get_trip`, `create_trip`, `update_trip`, `search_places`,
`add_stops`, `move_stop`, `set_stop_time`, `set_stop_note`, `rename_stop`,
`update_day`, `add_lodging`, and `plan_trip`.

Tool calls use an in-process dispatcher into the existing Hono API. The verified
viewer is associated with the internal Request object, never a caller-controlled
header. Browser API authentication is unchanged.

`add_stops` accepts up to 30 items, returns per-item outcomes, and can partially
succeed. It is not idempotent: retry only failed items after checking the trip.
Other create operations are also non-idempotent. Places search uses the existing
Google Places cache and billing credentials. Include the city in search queries.
`plan_trip` uses estimated durations and straight-line distances; it does not
check opening hours or live travel times. Lodging tools save plans, not bookings.

## Verification and release

Run `npm test` and `npm run typecheck` on Node 24. The MCP integration tests
exercise discovery, real OAuth/PKCE processing with a mocked Google token
exchange, refresh, revocation, both protocol generations, scope enforcement,
and trip isolation against SQLite with the actual migrations.

Commit the changes, then use the existing `npm run deploy` workflow. Alchemy
applies the new D1 migration. After deployment, an unauthenticated POST to `/mcp`
must return 401 with a `WWW-Authenticate` discovery challenge. Complete a real
Google connection in the chosen MCP client to validate its callback behavior.

The implementation uses [Better Auth MCP](https://better-auth.com/docs/plugins/mcp)
and the [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
