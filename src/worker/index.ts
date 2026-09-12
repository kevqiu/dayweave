import { Hono } from "hono";
import { fetchMyMap } from "../lib/kml.ts";
import type { worker } from "../../alchemy.run.ts";

type Env = typeof worker.Env;

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true }));

/**
 * The My Maps spike, as an endpoint rather than a script.
 *
 * PLAN.md section 3 bets the whole import story on this fetch working from a
 * Worker. It cannot be proven from a dev machine behind a restrictive egress
 * policy, so it is deployed and called instead. Delete once the real import
 * Workflow exists.
 */
app.get("/api/_spike/my-map/:mid", async (c) => {
  const started = Date.now();
  const result = await fetchMyMap(c.req.param("mid"));
  const ms = Date.now() - started;

  if (!result.ok) return c.json({ ...result, ms }, 502);

  return c.json({
    ok: true,
    ms,
    name: result.map.name,
    counts: {
      places: result.map.places.length,
      skipped: result.map.skipped.length,
      layers: new Set(result.map.places.map((p) => p.layer)).size,
    },
    sample: result.map.places.slice(0, 3),
    skipped: result.map.skipped,
  });
});

export default app;
export { TripRoom } from "./trip-room.ts";
