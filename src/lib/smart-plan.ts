import { haversineMetres } from "./geo.ts";
import { isAccommodation } from "./derive.ts";
import { minutesOf, formatClock } from "./plan.ts";

export interface SmartStop {
  id: string;
  day_id: string | null;
  start_time: string | null;
  category: string | null;
  status: string;
  lat: number | null;
  lng: number | null;
}

export function visitMinutes(category: string | null): number {
  const kind = (category || "").replaceAll("_", " ").toLowerCase();
  if (/theme park|amusement|zoo|aquarium/.test(kind)) return 180;
  if (/museum|gallery|hiking/.test(kind)) return 120;
  if (/restaurant|ramen|izakaya|food|lunch|dinner/.test(kind)) return 75;
  if (/cafe|coffee|bakery/.test(kind)) return 45;
  if (/park|garden|shopping|market/.test(kind)) return 90;
  if (/landmark|monument|church|temple|viewpoint/.test(kind)) return 45;
  return 60;
}

function distance(a: SmartStop, b: SmartStop): number | null {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  return haversineMetres({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
}

export function travelMinutes(a: SmartStop | undefined, b: SmartStop): number {
  if (!a) return 0;
  const metres = distance(a, b);
  if (metres === null) return 30;
  return Math.ceil((metres < 1800 ? metres * 1.3 / 75 + 5 : metres * 1.4 / 350 + 20) / 15) * 15;
}

export function smartPlan(days: readonly { id: string }[], stops: readonly SmartStop[], dayId: string | null) {
  const candidates = stops.filter((s) => s.day_id === dayId && minutesOf(s.start_time) === null && s.status !== "visited" && !isAccommodation(s.category));
  const available = days.filter((d) => dayId === null || d.id === dayId);
  const schedules = new Map(available.map((d) => [d.id, stops.filter((s) => s.day_id === d.id && !isAccommodation(s.category) && minutesOf(s.start_time) !== null).map((s) => ({ stop: s, start: minutesOf(s.start_time)!, end: minutesOf(s.start_time)! + visitMinutes(s.category) })).sort((a, b) => a.start - b.start)]));
  const pending = [...candidates];
  const placements: { id: string; dayId: string; time: string; duration: number }[] = [];
  while (pending.length) {
    let best: { stop: SmartStop; dayId: string; start: number; score: number } | null = null;
    for (const stop of pending) {
      const duration = visitMinutes(stop.category);
      for (const day of available) {
        const schedule = schedules.get(day.id)!;
        for (let slot = 0; slot <= schedule.length; slot++) {
          const previous = schedule[slot - 1];
          const next = schedule[slot];
          const start = Math.ceil(Math.max(9 * 60, previous ? previous.end + travelMinutes(previous.stop, stop) : 9 * 60) / 15) * 15;
          if (start + duration > 20 * 60 || (next && start + duration + travelMinutes(stop, next.stop) > next.start)) continue;
          const neighbours = schedule.map((s) => distance(s.stop, stop)).filter((d): d is number => d !== null);
          const proximity = neighbours.length ? Math.min(...neighbours) / 1000 : 5;
          const score = proximity * 45 + schedule.length * 12 + (start - 540) / 15;
          if (!best || score < best.score) best = { stop, dayId: day.id, start, score };
          break;
        }
      }
    }
    if (!best) break;
    const duration = visitMinutes(best.stop.category);
    placements.push({ id: best.stop.id, dayId: best.dayId, time: formatClock(best.start), duration });
    schedules.get(best.dayId)!.push({ stop: best.stop, start: best.start, end: best.start + duration });
    schedules.get(best.dayId)!.sort((a, b) => a.start - b.start);
    pending.splice(pending.indexOf(best.stop), 1);
  }
  return { placements, remaining: pending.length };
}
