/// <reference types="@cloudflare/workers-types" />
import alchemy from "alchemy";
import {
  Assets,
  D1Database,
  DurableObjectNamespace,
  KVNamespace,
  R2Bucket,
  Worker,
} from "alchemy/cloudflare";

// Pinned to the 0.x line on purpose. `npm install alchemy` resolves to a
// 2.0.0-beta, which is a different, Effect-based API the project has not
// adopted. See PLAN.md section 2.
const app = await alchemy("yvr-kocho-sh");

const db = await D1Database("db", {
  name: `${app.name}-${app.stage}-db`,
  migrationsDir: "db/migrations",
});

const sessions = await KVNamespace("sessions", {
  title: `${app.name}-${app.stage}-sessions`,
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

// The SPA, built by Vite into dist/web and served from Workers Assets. One
// Worker serves both the API and the app, so there is no second origin and no
// CORS. PLAN.md section 2 draws these as two Workers; they collapsed into one
// because nothing needed them apart.
const web = await Assets({ path: "dist/web" });

export const worker = await Worker("api", {
  entrypoint: "src/worker/index.ts",
  compatibilityDate: "2025-09-01",
  compatibilityFlags: ["nodejs_compat"],
  bindings: {
    ASSETS: web,
    DB: db,
    SESSIONS: sessions,
    TILES: tiles,
    TRIP_ROOM: tripRoom,
    GOOGLE_CLIENT_ID: alchemy.secret(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: alchemy.secret(process.env.GOOGLE_CLIENT_SECRET),
    GOOGLE_PLACES_KEY: alchemy.secret(process.env.GOOGLE_PLACES_KEY),
    BETTER_AUTH_SECRET: alchemy.secret(process.env.BETTER_AUTH_SECRET),
  },
  // Unknown paths fall through to the Worker, which hands them to ASSETS, so
  // a deep link into the SPA router does not 404.
  assets: { not_found_handling: "single-page-application" },
  // Set once the zone is on Cloudflare. Until then `url: true` gives a
  // workers.dev hostname to test against.
  url: true,
  // domains: ["yvr.kocho.sh"],
});

console.log(`worker  ${worker.url}`);

await app.finalize();
