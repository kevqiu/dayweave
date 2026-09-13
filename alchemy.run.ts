/// <reference types="@cloudflare/workers-types" />
import alchemy from "alchemy";
import {
  D1Database,
  DurableObjectNamespace,
  KVNamespace,
  R2Bucket,
  Worker,
} from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

// Pinned to the 0.x line on purpose. `npm install alchemy` resolves to a
// 2.0.0-beta, which is a different, Effect-based API the project has not
// adopted. See PLAN.md section 2.
const app = await alchemy("yvr-kocho-sh", {
  /**
   * State lives on the account, not in the container.
   *
   * The default store is `.alchemy/`, which is gitignored, so every cloud
   * session started with no state at all and announced `[creating]` against a
   * database that had existed for days. `CloudflareStateStore` keeps the state
   * in a SQLite Durable Object instead, behind a small Worker that Alchemy
   * provisions on first use — `alchemy-state-service`, on the account's
   * workers.dev subdomain, with `ALCHEMY_STATE_TOKEN` as its bearer token.
   *
   * That token has to be the **same value for every deploy on this account,
   * forever**. A different one does not make a second store, it makes the
   * existing one answer 401. See INFRA.md item 2.
   */
  stateStore: (scope) => new CloudflareStateStore(scope),

  /**
   * Kept, but no longer load-bearing.
   *
   * This used to be the only reason a deploy from a fresh clone worked: with
   * no state, every resource looked new, and adopting took over the existing
   * one rather than failing on the name. The state store above is what
   * actually fixes that. Adopting stays as the recovery path for the day the
   * state is lost anyway — a rotated token, a store deleted by hand — because
   * without it that day ends with a deploy that cannot proceed and a database
   * it will not touch. Safe here because this repo is the only thing that
   * creates these resources.
   */
  adopt: true,
});

const db = await D1Database("db", {
  name: `${app.name}-${app.stage}-db`,
  migrationsDir: "db/migrations",
});

const sessions = await KVNamespace("sessions", {
  title: `${app.name}-${app.stage}-sessions`,
});

// Autocomplete responses, keyed by query plus rounded bias centre, for an
// hour. PLAN.md section 4b: the cheapest Places call is the one not made.
const placesCache = await KVNamespace("places-cache", {
  title: `${app.name}-${app.stage}-places-cache`,
});

// Protomaps basemap and anything people attach later.
const tiles = await R2Bucket("tiles", {
  name: `${app.name}-${app.stage}-tiles`,
});

// One instance per trip. Sequences every edit so two phones dragging the
// same stop get a deterministic answer. See PLAN.md section 6.
const tripRoom = DurableObjectNamespace("trip-room", {
  className: "TripRoom",
  sqlite: true,
});

export const worker = await Worker("api", {
  entrypoint: "src/worker/index.ts",
  compatibilityDate: "2025-09-01",
  compatibilityFlags: ["nodejs_compat"],
  bindings: {
    DB: db,
    SESSIONS: sessions,
    PLACES_CACHE: placesCache,
    TILES: tiles,
    TRIP_ROOM: tripRoom,
    GOOGLE_CLIENT_ID: alchemy.secret(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: alchemy.secret(process.env.GOOGLE_CLIENT_SECRET),
    // A server key, restricted by API to Places. It replaced a referrer-
    // restricted one that forced the proxy to send a `Referer` about itself;
    // that binding is gone with it. See INFRA.md.
    GOOGLE_PLACES_KEY: alchemy.secret(process.env.GOOGLE_PLACES_KEY),
    // A *separate* key for the map in the browser, and deliberately not
    // GOOGLE_PLACES_KEY. A Maps JavaScript key is public by design and is
    // protected only by its HTTP referrer list; the Places key is a server
    // credential and must never be in a page. Empty until one is provisioned,
    // and the map falls back to the drawn one. See INFRA.md.
    GOOGLE_MAPS_BROWSER_KEY: process.env.GOOGLE_MAPS_BROWSER_KEY ?? "",
    BETTER_AUTH_SECRET: alchemy.secret(process.env.BETTER_AUTH_SECRET),
  },
  /**
   * A Workers custom domain, not a route.
   *
   * There was a hand-made route on this hostname and it matched the front page
   * and nothing else: a Cloudflare route pattern with no path has an implied
   * path of `/`, so every `/api/...` call fell through to the zone's wildcard
   * CNAME and a parking page. A custom domain has no path to get wrong, brings
   * its own proxied DNS record rather than borrowing that wildcard, and is
   * held in Alchemy's state with everything else. The route was deleted to
   * make room for it — the two cannot both hold a hostname.
   */
  domains: ["yvr.kocho.sh"],

  /**
   * Kept alongside the custom domain, deliberately.
   *
   * INFRA.md used to say to drop this once the domain landed. Two reasons not
   * to yet: `yvr.kocho.sh` is not on the session network allowlist, so the
   * workers.dev hostname is the only one a session can reach to check its own
   * work; and it is half of the redirect URI pair sign-in needs registered
   * (INFRA.md item 4). Drop it when sign-in works on the custom domain.
   */
  url: true,
});

console.log(`worker  ${worker.url}`);

await app.finalize();
