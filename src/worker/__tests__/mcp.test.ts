import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../index.ts";

class Statement {
  constructor(private db: DatabaseSync, private sql: string, private args: unknown[] = []) {}
  bind(...args: unknown[]) { return new Statement(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args as never[]) ?? null; }
  async all() {
    const statement = this.db.prepare(this.sql);
    const results = statement.all(...this.args as never[]);
    return { results, success: true, meta: { changes: 0, last_row_id: 0 } };
  }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.args as never[]);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

let sqlite: DatabaseSync;
let env: Record<string, unknown>;
let origin: string;
let port = 9100;
const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString("base64url");
const redirectUri = "http://127.0.0.1:8765/callback";
const verifier = "dayweave-test-pkce-verifier-with-more-than-forty-three-characters";
const challenge = createHash("sha256").update(verifier).digest("base64url");

beforeEach(() => {
  origin = `http://localhost:${port++}`;
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const dir = new URL("../../../db/migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL(file, dir), "utf8"));
  const cache = new Map<string, string>();
  const kv = {
    get: async (key: string, type?: string) => {
      const value = cache.get(key);
      return value === undefined ? null : type === "json" ? JSON.parse(value) : value;
    },
    put: async (key: string, value: string) => { cache.set(key, value); },
    delete: async (key: string) => { cache.delete(key); },
    list: async ({ prefix }: { prefix: string }) => ({ keys: [...cache.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })) }),
  };
  env = {
    DB: {
      prepare: (sql: string) => new Statement(sqlite, sql),
      exec: async (sql: string) => sqlite.exec(sql),
      batch: async (statements: Statement[]) => {
        sqlite.exec("BEGIN");
        try { const result = await Promise.all(statements.map((s) => s.all())); sqlite.exec("COMMIT"); return result; }
        catch (error) { sqlite.exec("ROLLBACK"); throw error; }
      },
    },
    SESSIONS: kv, PLACES_CACHE: kv,
    GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "test-only",
    GOOGLE_PLACES_KEY: "test-only", BETTER_AUTH_SECRET: "a-long-random-test-secret-for-mcp-authorization",
  };
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === `${origin}/api/auth/jwks`) return app.request(url, {}, env as never);
    if (url === "https://places.googleapis.com/v1/places:searchText") return Response.json({ places: [{
      id: "tokyo-cafe", displayName: { text: "Tokyo Cafe" }, location: { latitude: 35.67, longitude: 139.7 },
      formattedAddress: "Tokyo, Japan", primaryType: "cafe", addressComponents: [],
    }] });
    if (url === "https://oauth2.googleapis.com/token") {
      const code = new URLSearchParams(String(init?.body)).get("code")!;
      return Response.json({ access_token: "google-test-token", expires_in: 3600, token_type: "Bearer", id_token: `${encode({ alg: "RS256" })}.${encode({
        sub: code, name: code, email: `${code}@example.com`, email_verified: true,
        iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID,
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
      })}.signature` });
    }
    throw new Error(`Unexpected network request: ${url}`);
  });
});

afterEach(() => { vi.unstubAllGlobals(); sqlite.close(); });

function browser() {
  const jar = new Map<string, string>();
  const request = async (path: string, body?: unknown) => {
    const response = await app.request(new URL(path, origin).href, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "), origin, accept: body === undefined ? "text/html" : "application/json", "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, env as never);
    for (const cookie of (response.headers as unknown as { getSetCookie(): string[] }).getSetCookie()) {
      const pair = cookie.split(";")[0]!;
      const at = pair.indexOf("=");
      if (/Max-Age=0/i.test(cookie)) jar.delete(pair.slice(0, at)); else jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return response;
  };
  return { request };
}

async function register() {
  const response = await app.request(`${origin}/api/auth/oauth2/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Test assistant", application_type: "native", redirect_uris: [redirectUri], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) }, env as never);
  const data = await response.json() as { client_id: string };
  expect(response.status, JSON.stringify(data)).toBe(201);
  return data.client_id;
}

async function authorize(scopes = "trips:read trips:write offline_access", who = "alice") {
  const clientId = await register();
  const user = browser();
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: scopes, resource: `${origin}/mcp`, state: "client-csrf-state", code_challenge: challenge, code_challenge_method: "S256", prompt: "consent" });
  const start = await user.request(`/api/auth/oauth2/authorize?${query}`);
  expect(start.status, await start.clone().text()).toBe(302);
  const login = new URL(start.headers.get("location")!, origin);
  expect(login.pathname).toBe("/mcp/login");
  const signIn = await user.request("/api/auth/sign-in/social", { provider: "google", callbackURL: "/mcp/connections", oauth_query: login.search.slice(1) });
  const signInData = await signIn.json() as { url: string };
  expect(signIn.status, JSON.stringify(signInData)).toBe(200);
  const google = new URL(signInData.url);
  expect(google.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/google`);
  expect(google.searchParams.get("scope")).not.toMatch(/gmail|drive|calendar/);
  const callback = await user.request(`/api/auth/callback/google?code=${who}&state=${encodeURIComponent(google.searchParams.get("state")!)}`);
  const consentUrl = new URL(callback.headers.get("location")!, origin);
  expect(consentUrl.pathname, await callback.clone().text()).toBe("/mcp/consent");
  const consent = await user.request("/api/auth/oauth2/consent", { accept: true, oauth_query: consentUrl.search.slice(1) });
  const data = await consent.json() as { redirect_uri?: string; url?: string };
  expect(consent.status, JSON.stringify(data)).toBe(200);
  const result = new URL(data.redirect_uri ?? data.url!);
  expect(result.searchParams.get("state")).toBe("client-csrf-state");
  return { clientId, user, code: result.searchParams.get("code")! };
}

async function token(body: Record<string, string>) {
  return app.request(`${origin}/api/auth/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) }, env as never);
}

async function connect(scopes?: string, who?: string) {
  const grant = await authorize(scopes, who);
  const response = await token({ grant_type: "authorization_code", client_id: grant.clientId, code: grant.code, redirect_uri: redirectUri, code_verifier: verifier, resource: `${origin}/mcp` });
  const tokens = await response.json() as { access_token: string; refresh_token: string };
  expect(response.status, JSON.stringify(tokens)).toBe(200);
  expect(tokens.access_token).toBeTruthy();
  return { ...grant, ...tokens };
}

async function rpc(accessToken?: string, name?: string, args: unknown = {}) {
  const response = await app.request(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: name ? "tools/call" : "tools/list", params: name ? { name, arguments: args } : {} }) }, env as never);
  const raw = await response.text();
  const data = JSON.parse(raw.startsWith("event:") ? raw.split("\n").find((line) => line.startsWith("data: "))!.slice(6) : raw);
  return { response, data, result: data.result?.structuredContent };
}

describe("Dayweave MCP", () => {
  it("advertises discovery and rejects anonymous callers", async () => {
    const { response } = await rpc();
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    const metadata = await (await app.request(`${origin}/.well-known/oauth-protected-resource/mcp`, {}, env as never)).json() as Record<string, unknown>;
    expect(metadata.resource).toBe(`${origin}/mcp`);
    const issuer = await (await app.request(`${origin}/.well-known/oauth-authorization-server/api/auth`, {}, env as never)).json() as Record<string, unknown>;
    expect(issuer.registration_endpoint).toBe(`${origin}/api/auth/oauth2/register`);
    expect(issuer.code_challenge_methods_supported).toContain("S256");
  });

  it("connects through Google, builds a trip, edits stops, and returns its URL", async () => {
    const auth = await connect();
    const list = await rpc(auth.access_token);
    expect(list.response.status, JSON.stringify(list.data)).toBe(200);
    expect(list.data.result.tools.some((tool: { name: string }) => tool.name === "create_trip")).toBe(true);
    const created = await rpc(auth.access_token, "create_trip", { name: "Tokyo", startDate: "2026-11-01", endDate: "2026-11-05" });
    expect(created.data.result?.isError, JSON.stringify(created.data)).not.toBe(true);
    const tripId = created.result.trip.id;
    const dayId = created.result.days[0].id;
    expect(created.result.url).toBe(`${origin}/trips/${tripId}`);
    const search = await rpc(auth.access_token, "search_places", { tripId, query: "Tokyo Cafe" });
    expect(search.result.results[0].placeId).toBe("tokyo-cafe");
    const place = await rpc(auth.access_token, "add_stops", { tripId, stops: [{ placeId: "tokyo-cafe", dayId: created.result.days[1].id }] });
    expect(place.result.results[0].ok, JSON.stringify(place.data)).toBe(true);
    const stay = await rpc(auth.access_token, "add_lodging", { tripId, name: "My hotel", checkIn: "2026-11-01", checkOut: "2026-11-05" });
    expect(stay.result.lodging.name).toBe("My hotel");
    const added = await rpc(auth.access_token, "add_stops", { tripId, stops: [{ title: "Coffee", dayId, startTime: "10:30" }, { title: "Explore" }] });
    expect(added.result.results.every((item: { ok: boolean }) => item.ok), JSON.stringify(added.data)).toBe(true);
    const trip = await rpc(auth.access_token, "get_trip", { tripId });
    const stop = trip.result.days[0].stops[0];
    expect(stop.title).toBe("Coffee");
    await rpc(auth.access_token, "move_stop", { stopId: stop.id, dayId: null, startTime: null });
    const updated = await rpc(auth.access_token, "get_trip", { tripId });
    expect(updated.result.unplanned).toHaveLength(2);
    expect((await auth.user.request(`/api/trips/${tripId}`)).status).toBe(200);
  });

  it("enforces read-only scopes and rejects modified tokens", async () => {
    const auth = await connect("trips:read");
    expect((await rpc(auth.access_token, "list_trips")).result.trips).toEqual([]);
    const result = await rpc(auth.access_token, "create_trip", { name: "No", startDate: "2026-11-01", endDate: "2026-11-02" });
    expect(result.data.result.isError).toBe(true);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM trips").get()?.n).toBe(0);
    const parts = auth.access_token.split(".");
    parts[1] = encode({ sub: "someone-else", aud: `${origin}/mcp`, scope: "trips:read trips:write" });
    expect((await rpc(parts.join("."))).response.status).toBe(401);
  });

  it("checks trip membership and rejects another trip's day and invalid dates", async () => {
    const alice = await connect();
    const make = async () => (await rpc(alice.access_token, "create_trip", { name: "Trip", startDate: "2026-11-01", endDate: "2026-11-02" })).result;
    const first = await make();
    const second = await make();
    const added = await rpc(alice.access_token, "add_stops", { tripId: first.trip.id, stops: [{ title: "Wrong day", dayId: second.days[0].id }] });
    expect(added.result.results[0].ok).toBe(false);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM stops").get()?.n).toBe(0);
    const invalid = await rpc(alice.access_token, "create_trip", { name: "No", startDate: "2026-02-30", endDate: "2026-03-03" });
    expect(invalid.data.result?.isError || invalid.data.error).toBeTruthy();
    const bob = await connect(undefined, "bob");
    expect((await rpc(bob.access_token, "get_trip", { tripId: first.trip.id })).data.result.isError).toBe(true);
    expect((await rpc(bob.access_token, "plan_trip", { tripId: first.trip.id })).data.result.isError).toBe(true);
  });

  it("rotates refresh tokens and immediately stops a disconnected app", async () => {
    const auth = await connect();
    const refreshed = await token({ grant_type: "refresh_token", client_id: auth.clientId, refresh_token: auth.refresh_token, resource: `${origin}/mcp` });
    const next = await refreshed.json() as { access_token: string; refresh_token: string };
    expect(refreshed.status, JSON.stringify(next)).toBe(200);
    expect(next.refresh_token).not.toBe(auth.refresh_token);
    const consents = await (await auth.user.request("/api/auth/oauth2/get-consents")).json() as Array<{ id: string }>;
    expect((await auth.user.request("/api/auth/oauth2/delete-consent", { id: consents[0]!.id })).status).toBe(200);
    expect((await rpc(next.access_token)).response.status).toBe(401);
    expect((await token({ grant_type: "refresh_token", client_id: auth.clientId, refresh_token: next.refresh_token, resource: `${origin}/mcp` })).status).toBeGreaterThanOrEqual(400);
    const query = new URLSearchParams({ client_id: auth.clientId, redirect_uri: redirectUri, response_type: "code", scope: "trips:read trips:write offline_access", resource: `${origin}/mcp`, state: "reconnect", code_challenge: challenge, code_challenge_method: "S256", prompt: "consent" });
    const start = await auth.user.request(`/api/auth/oauth2/authorize?${query}`);
    const consent = new URL(start.headers.get("location")!, origin);
    const acceptedResponse = await auth.user.request("/api/auth/oauth2/consent", { accept: true, oauth_query: consent.search.slice(1) });
    const accepted = await acceptedResponse.json() as { redirect_uri?: string; url?: string };
    expect(acceptedResponse.status, JSON.stringify(accepted)).toBe(200);
    const newTokens = await (await token({ grant_type: "authorization_code", client_id: auth.clientId, code: new URL(accepted.redirect_uri ?? accepted.url!).searchParams.get("code")!, redirect_uri: redirectUri, code_verifier: verifier, resource: `${origin}/mcp` })).json() as { access_token: string };
    expect((await rpc(newTokens.access_token)).response.status).toBe(200);
    expect((await rpc(next.access_token)).response.status).toBe(401);
  });

  it("requires the PKCE verifier and makes authorization codes single-use", async () => {
    const grant = await authorize();
    const body = { grant_type: "authorization_code", client_id: grant.clientId, code: grant.code, redirect_uri: redirectUri, code_verifier: "wrong-verifier", resource: `${origin}/mcp` };
    expect([400, 401]).toContain((await token(body)).status);
    const auth = await connect();
    expect([400, 401]).toContain((await token({ ...body, client_id: auth.clientId, code: auth.code, code_verifier: verifier })).status);
  });

  it("does not grant OAuth administration to signed-in users", async () => {
    const auth = await connect();
    const changed = await auth.user.request("/api/auth/admin/oauth2/create-resource", { identifier: "https://attacker.example/mcp", name: "Other resource" });
    expect(changed.status).toBeGreaterThanOrEqual(400);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM "oauthResource" WHERE identifier = ?').get("https://attacker.example/mcp")?.n).toBe(0);
  });

  it("accepts the modern protocol and rejects hostile origins", async () => {
    const auth = await connect();
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } });
    const headers = { authorization: `Bearer ${auth.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" };
    const response = await app.request(`${origin}/mcp`, { method: "POST", headers, body }, env as never);
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await app.request(`${origin}/mcp`, { method: "POST", headers: { ...headers, origin: "https://attacker.example" }, body }, env as never)).status).toBe(403);
  });

  it("consumes an authorization code atomically", async () => {
    const grant = await authorize();
    const body = { grant_type: "authorization_code", client_id: grant.clientId, code: grant.code, redirect_uri: redirectUri, code_verifier: verifier, resource: `${origin}/mcp` };
    const responses = await Promise.all([token(body), token(body)]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status >= 400)).toHaveLength(1);
  });
});

