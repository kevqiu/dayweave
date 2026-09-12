import { Hono } from "hono";
import type { CreateStopBody, CreateTripBody, UpdateStopBody } from "../../shared/types.ts";
import { isISODate, toDayNumber } from "../../lib/dates.ts";
import { currentUserId, ensureStubUser } from "../auth.ts";
import {
  createStop, createTrip, deleteStop, getTrip, listTrips, tripIdForSlug, updateStop,
} from "../db.ts";
import type { worker } from "../../../alchemy.run.ts";

type Env = typeof worker.Env;

/** The trip's own day, not the browser's. UTC until trips carry a timezone. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const trips = new Hono<{ Bindings: Env }>();

trips.get("/", async (c) => {
  await ensureStubUser(c.env.DB);
  return c.json(await listTrips(c.env.DB, currentUserId(c), today()));
});

trips.post("/", async (c) => {
  await ensureStubUser(c.env.DB);
  const body = await c.req.json<Partial<CreateTripBody>>().catch(() => null);

  // The name is required and typed by a person; the cities under it are
  // derived, so there is nothing else to validate here (PLAN.md 4d).
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "A trip needs a name." }, 400);
  if (!isISODate(body?.startDate) || !isISODate(body?.endDate)) {
    return c.json({ error: "Both dates are required, as YYYY-MM-DD." }, 400);
  }
  if (toDayNumber(body.endDate) < toDayNumber(body.startDate)) {
    return c.json({ error: "The trip ends before it starts." }, 400);
  }
  if (toDayNumber(body.endDate) - toDayNumber(body.startDate) > 364) {
    return c.json({ error: "A trip cannot be longer than a year." }, 400);
  }

  const trip = await createTrip(
    c.env.DB, currentUserId(c),
    { name, startDate: body.startDate, endDate: body.endDate },
    today(),
  );
  return c.json(trip, 201);
});

trips.get("/:slug", async (c) => {
  await ensureStubUser(c.env.DB);
  const trip = await getTrip(c.env.DB, c.req.param("slug"), currentUserId(c), today());
  if (!trip) return c.json({ error: "No such trip." }, 404);
  return c.json(trip);
});

trips.post("/:slug/stops", async (c) => {
  const tripId = await tripIdForSlug(c.env.DB, c.req.param("slug"), currentUserId(c));
  if (!tripId) return c.json({ error: "No such trip." }, 404);

  const body = await c.req.json<Partial<CreateStopBody>>().catch(() => null);
  const title = body?.title?.trim();
  if (!title) return c.json({ error: "A stop needs a title." }, 400);

  const id = await createStop(c.env.DB, tripId, currentUserId(c), { ...body, title });
  return c.json({ id }, 201);
});

trips.patch("/:slug/stops/:stopId", async (c) => {
  const tripId = await tripIdForSlug(c.env.DB, c.req.param("slug"), currentUserId(c));
  if (!tripId) return c.json({ error: "No such trip." }, 404);

  const body = await c.req.json<UpdateStopBody>().catch(() => null);
  if (!body) return c.json({ error: "Expected a JSON body." }, 400);

  const changed = await updateStop(c.env.DB, tripId, c.req.param("stopId"), body);
  if (!changed) return c.json({ error: "Nothing to change." }, 404);
  return c.json({ ok: true });
});

trips.delete("/:slug/stops/:stopId", async (c) => {
  const tripId = await tripIdForSlug(c.env.DB, c.req.param("slug"), currentUserId(c));
  if (!tripId) return c.json({ error: "No such trip." }, 404);

  const removed = await deleteStop(c.env.DB, tripId, c.req.param("stopId"));
  if (!removed) return c.json({ error: "No such stop." }, 404);
  return c.json({ ok: true });
});
