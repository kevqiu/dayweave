import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Day, Stop, Trip as TripModel } from "../../shared/types.ts";
import { api } from "../api.ts";
import { formatDayHeader, formatRange, toDayNumber } from "../../lib/dates.ts";
import { AvatarStack } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { StopRow } from "../components/StopRow.tsx";

function AddStop({ onAdd, placeholder }: { onAdd: (title: string) => void; placeholder: string }) {
  const [title, setTitle] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        setTitle("");
      }}
      style={{ display: "flex", gap: 7, padding: "9px 14px 12px" }}
    >
      <input
        value={title} placeholder={placeholder} maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        style={{ fontSize: 13.5, height: 34, padding: "0 11px" }}
      />
      <button className="btn btn--small" disabled={!title.trim()} style={{ height: 34 }}>Add</button>
    </form>
  );
}

function DaySection({
  day, index, open, dimmed, onToggle, children,
}: {
  day: Day; index: number; open: boolean; dimmed: boolean;
  onToggle: () => void; children: React.ReactNode;
}) {
  const visited = day.stops.filter((s) => s.status === "visited").length;
  return (
    <section style={{ opacity: dimmed ? 0.45 : 1, transition: "opacity 120ms" }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%", height: "var(--day-h)", display: "flex", alignItems: "center",
          gap: 9, padding: "0 14px", border: "none", borderTop: "1px solid var(--line)",
          background: open ? "var(--surface-2)" : "transparent", textAlign: "left",
        }}
      >
        {/* The day's own hue lives here, not on the pins (PLAN.md 7). */}
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: day.hue, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, flexGrow: 1 }}>
          {formatDayHeader(day.date)}
          {day.placeLabel && <span className="muted" style={{ fontWeight: 400 }}> · {day.placeLabel}</span>}
        </span>
        <span className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>
          {visited}/{day.stops.length}
        </span>
        <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms" }}>
          <Icon name="chevron" size={14} color="var(--ink-3)" />
        </span>
      </button>
      {open && <div>{children}</div>}
      <span className="tiny" style={{ display: "none" }}>{index}</span>
    </section>
  );
}

export function Trip() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setTrip(await api.getTrip(slug));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  // Open today by default, which is the day you are looking at while travelling.
  useEffect(() => {
    if (!trip || openDay !== null) return;
    const today = new Date().toISOString().slice(0, 10);
    const current = trip.days.find((d) => d.date === today) ?? trip.days[0];
    if (current) setOpenDay(current.id);
  }, [trip, openDay]);

  const totals = useMemo(() => {
    if (!trip) return { visited: 0, total: 0 };
    return { visited: trip.visitedCount, total: trip.stopCount };
  }, [trip]);

  if (error) return <div className="app"><p className="empty">{error}</p></div>;
  if (!trip) return <div className="app"><div className="spinner" /></div>;

  const mutate = async (run: () => Promise<unknown>) => {
    try {
      await run();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const stopActions = (stop: Stop) => ({
    onToggleVisited: () => mutate(() =>
      api.updateStop(slug, stop.id, { status: stop.status === "visited" ? "planned" : "visited" })),
    onSaveNote: (note: string) => mutate(() => api.updateStop(slug, stop.id, { note })),
    onDelete: () => mutate(() => api.deleteStop(slug, stop.id)),
  });

  const empty = trip.stopCount === 0;

  return (
    <div className="app">
      <div className="nav">
        {/* One menu, and it is the chevron beside the trip name (PLAN.md 4h). */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          style={{
            border: "none", background: "none", padding: 0, display: "flex",
            alignItems: "center", gap: 6, flexGrow: 1, minWidth: 0,
          }}
        >
          <span className="nav__title">{trip.name}</span>
          <Icon name="chevron" size={15} color="var(--ink-2)" />
        </button>
        <AvatarStack members={trip.members} size={26} />
      </div>

      {menuOpen && (
        <div
          className="card"
          style={{ padding: 6, marginTop: -4 }}
          onClick={() => setMenuOpen(false)}
        >
          <Link
            to={`/trip/${slug}/plan`}
            style={{ display: "block", padding: "9px 10px", textDecoration: "none", color: "var(--ink)", fontSize: 13.5 }}
          >
            Plan view
          </Link>
          <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
          <button
            onClick={() => navigate("/")}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 10px", border: "none", background: "none", fontSize: 13.5 }}
          >
            Back to trips
          </button>
        </div>
      )}

      <div style={{ padding: "0 16px 10px" }}>
        <div className="tiny muted">
          {formatRange(trip.startDate, trip.endDate)}
          {trip.cities.length > 0 && ` · ${trip.cities.join(", ")}`}
        </div>
        {totals.total > 0 && (
          <div className="bar" style={{ marginTop: 8 }}>
            <i style={{ width: `${Math.round((totals.visited / totals.total) * 100)}%` }} />
          </div>
        )}
      </div>

      {/* The first screen every single user sees, and it has to say what to do. */}
      {empty && (
        <p className="empty" style={{ margin: "10px 22px 18px" }}>
          Nothing planned yet.<br />
          Add a place to any day below, or bring in a Google My Map.
        </p>
      )}

      {trip.days.map((day, i) => (
        <DaySection
          key={day.id}
          day={day}
          index={i}
          open={openDay === day.id}
          // Opening a day dims every other day, which is what makes a day's
          // cluster readable — dimming, not hue (PLAN.md 7).
          dimmed={openDay !== null && openDay !== day.id}
          onToggle={() => setOpenDay(openDay === day.id ? null : day.id)}
        >
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {day.stops.map((stop) => (
              <StopRow key={stop.id} stop={stop} {...stopActions(stop)} />
            ))}
          </ul>
          <AddStop
            placeholder="Add a place to this day"
            onAdd={(title) => mutate(() => api.createStop(slug, { title, dayId: day.id }))}
          />
        </DaySection>
      ))}

      {/* Not a separate table: stops WHERE day_id IS NULL (PLAN.md 9). */}
      <section style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ paddingTop: 6 }}>
          TO BE PLANNED {trip.unplanned.length > 0 && `· ${trip.unplanned.length}`}
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {trip.unplanned.map((stop) => (
            <StopRow key={stop.id} stop={stop} {...stopActions(stop)} />
          ))}
        </ul>
        <AddStop
          placeholder="Somewhere to fit in later"
          onAdd={(title) => mutate(() => api.createStop(slug, { title, dayId: null }))}
        />
      </section>

      <div style={{ height: 20 }} />
    </div>
  );
}
