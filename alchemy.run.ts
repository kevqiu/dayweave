/// <reference types="@cloudflare/workers-types" />
import alchemy from "alchemy";
import {
  D1Database,
  DurableObjectNamespace,
  KVNamespace,
  R2Bucket,
  Worker,
} from "alchemy/cloudflare";

// Pinned to the 0.x line on purpose. `npm install alchemy` resolves to a
// 2.0.0-beta, which is a different, Effect-based API the project has not
// adopted. See PLAN.md section 2.
const app = await alchemy("yvr-kocho-sh", {
  // Alchemy keeps its state in `.alchemy/`, which is gitignored, so a cloud
  // session that clones the repo fresh starts with no state and tries to
  // create a database that is already there. Adopting takes over the existing
  // resources instead of failing. Safe here because this repo is the only
  // thing that creates them; the real fix is a persistent state store, which
  // needs an ALCHEMY_STATE_TOKEN on the environment — see ENVIRONMENT.md.
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
    GOOGLE_PLACES_KEY: alchemy.secret(process.env.GOOGLE_PLACES_KEY),
    // The Places key is restricted by HTTP referrer, so the proxy has to send
    // one or Google refuses it outright. Not a secret, and not a security
    // control either — see the note in src/lib/places.ts.
    PLACES_REFERRER: process.env.PLACES_REFERRER ?? "https://yvr.kocho.sh",
    BETTER_AUTH_SECRET: alchemy.secret(process.env.BETTER_AUTH_SECRET),
  },
  // Set once the zone is on Cloudflare. Until then `url: true` gives a
  // workers.dev hostname to test against.
  url: true,
  // domains: ["yvr.kocho.sh"],
});

console.log(`worker  ${worker.url}`);

await app.finalize();
