import type {
  CreateStopBody, CreateTripBody, Trip, TripSummary, UpdateStopBody,
} from "../shared/types.ts";

/** Throws with the server's own message, so a screen can show it verbatim. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Something went wrong (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  listTrips: () => call<TripSummary[]>("/trips"),
  getTrip: (slug: string) => call<Trip>(`/trips/${slug}`),

  createTrip: (body: CreateTripBody) =>
    call<TripSummary>("/trips", { method: "POST", body: JSON.stringify(body) }),

  createStop: (slug: string, body: CreateStopBody) =>
    call<{ id: string }>(`/trips/${slug}/stops`, { method: "POST", body: JSON.stringify(body) }),

  updateStop: (slug: string, stopId: string, body: UpdateStopBody) =>
    call<{ ok: true }>(`/trips/${slug}/stops/${stopId}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteStop: (slug: string, stopId: string) =>
    call<{ ok: true }>(`/trips/${slug}/stops/${stopId}`, { method: "DELETE" }),
};
