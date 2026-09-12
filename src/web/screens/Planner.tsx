import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Stop, Trip as TripModel } from "../../shared/types.ts";
import { api } from "../api.ts";
import { formatDayHeader } from "../../lib/dates.ts";

/**
 * Days across, stops down — the grid the spreadsheet was really for
 * (PLAN.md 4). Dragging writes the same op as everything else: a day_id
 * change and an order_key between the new neighbours.
 */
function StopCard({ stop, onDragStart }: { stop: Stop; onDragStart: () => void }) {
  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      style={{
        border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 10,
        padding: "7px 9px", marginBottom: 6, cursor: "grab",
        opacity: stop.status === "visited" ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
        {stop.startTime && (
          <span className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>{stop.startTime}</span>
        )}
        <span style={{ fontSize: 13, fontWeight: 600 }}>{stop.title}</span>
      </div>
      {stop.description && <div className="tiny muted" style={{ marginTop: 2 }}>{stop.description}</div>}
      {stop.note && (
        <div className="tiny" style={{ marginTop: 4, background: "var(--surface-2)", borderRadius: 6, padding: "4px 6px" }}>
          {stop.note}
        </div>
      )}
    </li>
  );
}

export function Planner() {
  const { slug = "" } = useParams();
  const [trip, setTrip] = useState<TripModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Stop | null>(null);
  // A column key, not a day id: the unplanned column's day id is null, which
  // would otherwise read as "hovered" the moment the page loads.
  const [over, setOver] = useState<string | null>(null);
  const UNPLANNED = "unplanned";

  const load = useCallback(async () => {
    try { setTrip(await api.getTrip(slug)); } catch (e) { setError((e as Error).message); }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="app"><p className="empty">{error}</p></div>;
  if (!trip) return <div className="app"><div className="spinner" /></div>;

  async function drop(dayId: string | null) {
    const stop = dragging;
    setDragging(null);
    setOver(null);
    if (!stop || stop.dayId === dayId) return;

    // Append to the end of the target: the last key becomes the left neighbour.
    const target = dayId === null
      ? trip!.unplanned
      : trip!.days.find((d) => d.id === dayId)?.stops ?? [];
    const last = target.filter((s) => s.id !== stop.id).at(-1)?.orderKey ?? null;

    try {
      await api.updateStop(slug, stop.id, { dayId, after: last, before: null });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const column = (dayId: string | null) => {
    const key = dayId ?? UNPLANNED;
    const active = dragging !== null && over === key;
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(key); },
      onDragLeave: () => setOver((v) => (v === key ? null : v)),
      onDrop: (e: React.DragEvent) => { e.preventDefault(); void drop(dayId); },
      style: {
        background: active ? "var(--today-bg)" : "var(--surface-2)",
        borderRadius: 12,
        padding: 8,
        minWidth: 190,
        flex: "0 0 190px",
        outline: active ? "2px dashed var(--today-fg)" : "none",
      } as React.CSSProperties,
    };
  };

  return (
    <div className="app app--wide">
      <div className="nav">
        <h1 className="nav__title">{trip.name}</h1>
        <Link to={`/trip/${slug}`} className="btn btn--small btn--quiet" style={{ textDecoration: "none" }}>
          Map view
        </Link>
      </div>

      <div style={{ display: "flex", gap: 10, padding: "4px 14px 20px", overflowX: "auto", alignItems: "flex-start" }}>
        {/* The sidebar the My Map fills, and where a drag can always go back to. */}
        <div {...column(null)}>
          <div className="eyebrow" style={{ padding: "2px 2px 8px" }}>TO BE PLANNED</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, minHeight: 40 }}>
            {trip.unplanned.map((stop) => (
              <StopCard key={stop.id} stop={stop} onDragStart={() => setDragging(stop)} />
            ))}
          </ul>
        </div>

        {trip.days.map((day) => (
          <div key={day.id} {...column(day.id)}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 2px 8px" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: day.hue }} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{formatDayHeader(day.date)}</span>
              <span className="tiny muted" style={{ marginLeft: "auto" }}>{day.stops.length}</span>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, minHeight: 40 }}>
              {day.stops.map((stop) => (
                <StopCard key={stop.id} stop={stop} onDragStart={() => setDragging(stop)} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
