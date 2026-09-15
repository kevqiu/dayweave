import { betterAuth } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { worker } from "../../alchemy.run.ts";

type Env = typeof worker.Env;

/**
 * Sign-in, per PLAN.md section 5.
 *
 * Better Auth is a library, not a service: this file is the whole of the
 * integration. It runs inside the Worker, keeps users and sessions in the same
 * D1 as the trips, and holds Google's refresh token so a Drive consent later
 * does not send anyone back through a consent screen.
 *
 * Google is the only provider and the scopes are the defaults — `openid`,
 * `email`, `profile`. `design/SignIn.dc.html` promises in one line that we ask
 * for a name and an email and nothing else, and that line is a promise this
 * file keeps by not adding a scope to it.
 */

/**
 * The two hostnames the app is actually served on, and the reason `baseURL` is
 * not simply taken from the request.
 *
 * Better Auth builds the OAuth `redirect_uri` out of `baseURL`. Reading that
 * from the `Host` header would let anyone who can reach the Worker with a
 * header of their choosing name the address Google is asked to send the code
 * back to. Both of these are registered with Google (INFRA.md item 4), and
 * anything else falls back to the first rather than being trusted.
 */
const ORIGINS = [
  "https://yvr.kocho.sh",
  "https://yvr-kocho-sh-api-dev.yvr-kocho.workers.dev",
] as const;

/** `alchemy dev` serves on localhost, which is not a hostname to hard-code. */
const isLocal = (url: URL) => url.hostname === "localhost" || url.hostname === "127.0.0.1";

export const localDevEnabled = (env: Env, url: URL) => env.LOCAL_DEV_AUTH === "true" && isLocal(url);

function localSignIn(origin: string) {
  return {
    id: "local-development",
    endpoints: {
      signInLocal: createAuthEndpoint("/sign-in/local", { method: "POST", requireHeaders: true }, async (ctx) => {
        if (ctx.request?.headers.get("origin") !== origin) throw new APIError("FORBIDDEN");
        const adapter = ctx.context.internalAdapter;
        const existing = await adapter.findUserByEmail("local@daytrail.test");
        const user = existing?.user ?? await adapter.createUser({
          name: "Local Explorer",
          email: "local@daytrail.test",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }, { method: "local-development" });
        const session = await adapter.createSession(user.id);
        if (!session) throw new APIError("INTERNAL_SERVER_ERROR");
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ ok: true });
      }),
    },
  };
}

export function originFor(url: URL): string {
  if (isLocal(url)) return url.origin;
  return ORIGINS.find((o) => o === url.origin) ?? ORIGINS[0];
}

/**
 * One instance per origin, rebuilt if the bindings change.
 *
 * `betterAuth()` assembles a router and a schema on every call, which is work
 * worth doing once per isolate rather than once per request. Cloudflare's
 * binding objects are stable for the life of an isolate, so holding on to them
 * is safe — but the identity check means a swapped `env` cannot leave a stale
 * database behind either.
 */
let cache: { env: Env; instances: Map<string, Auth> } | null = null;

export function authFor(env: Env, url: URL): Auth {
  if (!cache || cache.env !== env) cache = { env, instances: new Map() };

  const origin = originFor(url);
  const existing = cache.instances.get(origin);
  if (existing) return existing;

  const made = build(env, origin);
  cache.instances.set(origin, made);
  return made;
}

/**
 * The configuration, in its own function so `Auth` can be inferred from it.
 *
 * `ReturnType<typeof betterAuth>` is the type of an instance with no options
 * at all, and an instance built from real ones is not assignable to it — the
 * options are a type parameter that reaches all the way down to the adapter.
 * Inferring from this function keeps the concrete type instead of widening it.
 */
function build(env: Env, origin: string) {
  return betterAuth({
    /**
     * The raw D1 binding, and no adapter package.
     *
     * PLAN.md section 5 said D1 "through Drizzle", which was true of the
     * Better Auth of the time. It is not now: the Kysely adapter duck-types a
     * binding with `batch`, `exec` and `prepare` as D1 and reaches for its own
     * D1 dialect, so Drizzle would be a dependency, a schema and a second
     * source of truth for tables this app never reads directly.
     */
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    basePath: "/api/auth",
    trustedOrigins: [...ORIGINS],
    plugins: localDevEnabled(env, new URL(origin)) ? [localSignIn(origin)] : [],

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },

    /**
     * KV in front, D1 behind. PLAN.md section 5 asks for the session lookup in
     * KV, and `yvr-kocho-sh-dev-sessions` was created for it and has been
     * unused since.
     *
     * On its own, secondary storage is the *only* store, and KV is eventually
     * consistent: the read immediately after a sign-in can miss the write, and
     * a miss with nothing behind it is a person bounced back to the sign-in
     * screen for a minute. `storeSessionInDatabase` puts the row in D1 as
     * well, and Better Auth then treats a KV miss as a cache miss and reads
     * D1 — so KV saves the read it can, and never costs a session.
     */
    secondaryStorage: {
      get: (key) => env.SESSIONS.get(key),
      set: (key, value, ttl) =>
        env.SESSIONS.put(key, value, ttl ? { expirationTtl: Math.max(60, ttl) } : undefined),
      delete: (key) => env.SESSIONS.delete(key),
      getAndDelete: async (key) => {
        const value = await env.SESSIONS.get(key);
        if (value !== null) await env.SESSIONS.delete(key);
        return value;
      },
      /**
       * Not atomic, and not reached.
       *
       * KV has no compare-and-set, so this is a read and a write with a race
       * in the middle. Better Auth only calls it to count rate-limit hits, and
       * rate limiting is left on its own in-memory store, so nothing calls
       * this today. It is here because the interface requires it, and it
       * undercounts rather than overcounts if it is ever used, which is the
       * safe direction for a counter that gates sign-in.
       */
      increment: async (key, ttl) => {
        const current = Number((await env.SESSIONS.get(key)) ?? 0);
        const next = current + 1;
        await env.SESSIONS.put(key, String(next), { expirationTtl: Math.max(60, ttl) });
        return next;
      },
    },
    session: { storeSessionInDatabase: true },
  });
}

export type Auth = ReturnType<typeof build>;
