import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { z } from "zod";
import { authFor, originFor } from "./auth.ts";
import type { worker } from "../../alchemy.run.ts";

type Env = typeof worker.Env;
export interface McpViewer {
  id: string;
  name: string;
  email: string;
  image: string | null;
}
type Dispatch = (viewer: McpViewer, path: string, body?: unknown) => Promise<Response>;
type Api = (path: string, body?: unknown) => Promise<Record<string, unknown>>;

const id = z.string().min(1).max(200);
const date = z.iso.date();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();
const tripId = { tripId: id };
const stopId = { stopId: id };
const dayId = id.nullable().optional();
const text = z.string().trim().min(1).max(200);
const scopeList = (value: string) => value.split(" ").filter(Boolean);
const errorResult = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

class ApiError extends Error {}

export function tripServer(api: Api, origin: string, scopes: ReadonlySet<string>) {
  const server = new McpServer({ name: "dayweave", version: "1.0.0" }, {
    jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
    instructions: "Build and edit the user's Dayweave trips. Read the trip before changing an existing itinerary. Use Google place IDs from search_places; never invent them. Dates and times are local itinerary values. plan_trip uses estimated durations and straight-line distances, not opening hours or live routing. Saving lodging does not book it. Return the trip URL after making changes. Batch additions can partially succeed; retry only failed items.",
  });

  function tool<T extends z.ZodRawShape>(name: string, description: string, shape: T, readOnly: boolean,
    run: (args: z.infer<z.ZodObject<T>>) => Promise<Record<string, unknown>>) {
    server.registerTool(name, {
      description,
      inputSchema: z.object(shape).strict(),
      annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: name === "search_places" || name === "add_stops" || name === "add_lodging" },
    }, async (args) => {
      if (!scopes.has(readOnly ? "trips:read" : "trips:write")) {
        return errorResult(`Reconnect Dayweave with ${readOnly ? "trips:read" : "trips:write"} permission to use ${name}.`);
      }
      try {
        const result = await run(args as z.infer<z.ZodObject<T>>);
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        return errorResult(error instanceof ApiError ? error.message : "Dayweave could not complete this operation. Read the trip before retrying a write.");
      }
    });
  }

  const pathFor = (value: string) => `/api/trips/${encodeURIComponent(value)}`;
  const urlFor = (value: string) => `${origin}/trips/${encodeURIComponent(value)}`;
  tool("list_trips", "List trips the connected account belongs to.", {}, true, async () => {
    const result = await api("/api/trips");
    const trips = result.trips as Array<Record<string, unknown>>;
    return { trips: trips.map((trip) => ({ id: trip.id, name: trip.name, startDate: trip.start_date, endDate: trip.end_date, cities: trip.cities, stopCount: trip.stopCount, url: urlFor(String(trip.id)) })) };
  });
  tool("get_trip", "Read trip days, ordered stops, unscheduled stops, and lodging. Use returned IDs for edits.", tripId, true,
    async ({ tripId }) => ({ ...await api(pathFor(tripId)), url: urlFor(tripId) }));
  tool("create_trip", "Create a trip and its days. Dates are YYYY-MM-DD, inclusive, at most 366 days. This creates a new trip each time.", {
    name: text, startDate: date, endDate: date,
  }, false, async (args) => {
    const result = await api("/api/trips", args);
    return { ...result, url: urlFor((result.trip as { id: string }).id) };
  });
  tool("update_trip", "Rename a trip or change its dates. Stops on removed days become unscheduled.", {
    ...tripId, name: text.optional(), startDate: date.optional(), endDate: date.optional(),
  }, false, async ({ tripId, ...patch }) => ({ ...await api(pathFor(tripId), patch), url: urlFor(tripId) }));
  tool("search_places", "Search Google Places for an existing trip. Include the destination city in the query, especially for a new trip. Returns placeId values for add_stops/add_lodging.", {
    ...tripId, query: z.string().trim().min(3).max(300), dayId: id.optional(),
  }, true, async ({ tripId, query, dayId }) => {
    const params = new URLSearchParams({ q: query });
    if (dayId) params.set("dayId", dayId);
    const result = await api(`${pathFor(tripId)}/place-search?${params}`);
    return { results: result.results, bias: result.bias };
  });
  tool("add_stops", "Add up to 30 places or manual itinerary items. Supply exactly one of placeId or title per item. dayId null/omitted saves to unplanned. Results identify successes and failures by input index; retry only failures to avoid duplicates.", {
    ...tripId,
    stops: z.array(z.object({ placeId: id.optional(), title: text.optional(), dayId, startTime: time.optional() }).strict()
      .refine((stop) => Boolean(stop.placeId) !== Boolean(stop.title), "Supply exactly one of placeId or title")).min(1).max(30),
  }, false, async ({ tripId, stops }) => {
    await api(pathFor(tripId));
    const results: Record<string, unknown>[] = [];
    for (const [index, stop] of stops.entries()) {
      try {
        const result = await api(`${pathFor(tripId)}/stops${stop.placeId ? "" : "/note"}`, stop);
        results.push({ index, ok: true, ...result });
      } catch (error) {
        results.push({ index, ok: false, error: error instanceof ApiError ? error.message : "Operation failed; check the trip before retrying." });
      }
    }
    return { results, url: urlFor(tripId) };
  });
  tool("move_stop", "Move a stop to a day, or to unplanned with dayId null. Omit afterStopId to append; null places first. Omit startTime to preserve it; null clears it.", {
    ...stopId, dayId: id.nullable(), afterStopId: id.nullable().optional(), startTime: time.optional(),
  }, false, async ({ stopId, ...body }) => api(`/api/stops/${encodeURIComponent(stopId)}/move`, body));
  tool("set_stop_time", "Set a stop's local start time (HH:MM), or clear it with null.", { ...stopId, time }, false,
    async ({ stopId, time }) => api(`/api/stops/${encodeURIComponent(stopId)}/time`, { time }));
  tool("set_stop_note", "Save the user's instructions or requested planning notes on a stop.", { ...stopId, note: z.string().max(5000) }, false,
    async ({ stopId, note }) => api(`/api/stops/${encodeURIComponent(stopId)}/note`, { note }));
  tool("rename_stop", "Rename a manual itinerary item. Google place names cannot be renamed.", { ...stopId, title: text }, false,
    async ({ stopId, title }) => api(`/api/stops/${encodeURIComponent(stopId)}/title`, { title }));
  tool("update_day", "Set a day's name or color.", { dayId: id, name: z.string().max(60).nullable().optional(), hue: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }, false,
    async ({ dayId, ...body }) => api(`/api/days/${encodeURIComponent(dayId)}`, body));
  tool("add_lodging", "Save accommodation dates and an optional Google place. This records a stay; it does not make a booking.", {
    ...tripId, name: text, placeId: id.optional(), checkIn: date, checkOut: date, note: z.string().max(5000).optional(),
  }, false, async ({ tripId, ...body }) => ({ ...await api(`${pathFor(tripId)}/lodging`, body), url: urlFor(tripId) }));
  tool("plan_trip", "Immediately arrange unscheduled stops using estimated durations and straight-line distances. Does not verify opening hours, reservations, or actual travel times.", {
    ...tripId, dayId,
  }, false, async ({ tripId, dayId }) => ({ ...await api(`${pathFor(tripId)}/smart-plan`, { dayId }), url: urlFor(tripId) }));
  return server;
}

export async function handleMcp(request: Request, env: Env, dispatch: Dispatch): Promise<Response> {
  const url = new URL(request.url);
  const origin = originFor(url);
  if (url.origin !== origin) return new Response("Unknown host", { status: 403 });
  const requestOrigin = request.headers.get("origin");
  const allowedOrigins = new Set([origin, "https://chatgpt.com", "https://claude.ai"]);
  if (requestOrigin && !allowedOrigins.has(requestOrigin)) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": requestOrigin ?? origin,
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Mcp-Method, Mcp-Name",
    "Vary": "Origin",
  } });
  const resource = `${origin}/mcp`;
  const handler = requireMcpAuth(authFor(env, url), async (request, claims) => {
    if (typeof claims.sub !== "string" || typeof claims.client_id !== "string") return new Response("Invalid account token", { status: 401 });
    const viewer = await env.DB.prepare('SELECT id, name, email, image FROM "user" WHERE id = ?').bind(claims.sub).first<McpViewer>();
    const consent = await env.DB.prepare('SELECT c.id, c.scopes FROM "oauthConsent" c JOIN "oauthClient" a ON a.clientId = c.clientId WHERE c.userId = ? AND c.clientId = ? AND COALESCE(a.disabled, 0) = 0')
      .bind(claims.sub, claims.client_id).first<{ id: string; scopes: string }>();
    if (!viewer || !consent || consent.id !== claims.dayweave_consent) return Response.json({ error: "Connection revoked; reconnect Dayweave" }, { status: 401, headers: {
      "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
    } });
    const granted = new Set(JSON.parse(consent.scopes) as string[]);
    const scopes = new Set(scopeList(typeof claims.scope === "string" ? claims.scope : "").filter((scope) => granted.has(scope)));
    const api: Api = async (path, body) => {
      const response = await dispatch(viewer, path, body);
      if (response.status >= 500) throw new ApiError("Dayweave or Google Places is temporarily unavailable. Check the trip before retrying a write.");
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new ApiError(typeof data.error === "string" ? data.error : "Operation failed");
      return data;
    };
    return createMcpHandler(() => tripServer(api, origin, scopes), { legacy: "stateless" }).fetch(request);
  }, { resource, requiredScopes: ["trips:read"], challengeScopes: ["trips:read", "trips:write", "offline_access"] });
  const response = await handler(request);
  const out = new Response(response.body, response);
  out.headers.set("Cache-Control", "no-store");
  if (requestOrigin) {
    out.headers.set("Access-Control-Allow-Origin", requestOrigin);
    out.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Protocol-Version");
    out.headers.set("Vary", "Origin");
  }
  return out;
}
