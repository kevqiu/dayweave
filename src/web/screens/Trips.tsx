import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TripSummary } from "../../shared/types.ts";
import { api } from "../api.ts";
import { formatRange, monthShort, parseISODate, toDayNumber } from "../../lib/dates.ts";
import { AvatarStack } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";

/** Happening now, then coming up, then past — the order you care about them. */
function bucket(trip: TripSummary, today: number): "now" | "soon" | "past" {
  if (trip.currentDay !== null) return "now";
  return toDayNumber(trip.startDate) > today ? "soon" : "past";
}

function DateChip({ date, dim }: { date: string; dim?: boolean }) {
  return (
    <div
      style={{
        width: dim ? 38 : 42, height: dim ? 38 : 42, borderRadius: 11,
        background: dim ? "#F0E9DC" : "var(--ahead-bg)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.06em", color: dim ? "var(--ink-3)" : "#96752F" }}>
        {monthShort(date).toUpperCase()}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: dim ? "var(--ink-2)" : "#6B5426", lineHeight: 1 }}>
        {String(parseISODate(date).d).padStart(2, "0")}
      </span>
    </div>
  );
}

function CurrentTripCard({ trip }: { trip: TripSummary }) {
  const done = trip.stopCount > 0 ? Math.round((trip.visitedCount / trip.stopCount) * 100) : 0;
  return (
    <Link
      to={`/trip/${trip.slug}`}
      className="card"
      style={{
        borderColor: "var(--today-line)", borderWidth: 1.5, borderRadius: 16,
        padding: 0, overflow: "hidden", textDecoration: "none",
      }}
    >
      <div
        style={{
          height: 62, background: "var(--today-bg)", position: "relative",
          display: "flex", alignItems: "flex-end", padding: 10,
        }}
      >
        <span
          style={{
            position: "absolute", right: 12, top: 11, fontSize: 9.5, fontWeight: 700,
            letterSpacing: "0.07em", color: "#4E7A4B",
            background: "rgba(255,252,246,0.92)", borderRadius: 5, padding: "3px 7px",
          }}
        >
          DAY {trip.currentDay} OF {trip.dayCount}
        </span>
      </div>
      <div style={{ padding: "11px 13px 13px" }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 17 }}>{trip.name}</div>
        <div className="tiny muted" style={{ marginTop: 3 }}>
          {formatRange(trip.startDate, trip.endDate)}
          {/* Absent until there are stops, rather than guessing (PLAN.md 4d). */}
          {trip.cities.length > 0 && ` · ${trip.cities.join(", ")}`}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <AvatarStack members={trip.members} />
          <span style={{ flexGrow: 1 }} />
          <span className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>
            {trip.visitedCount} of {trip.stopCount} visited
          </span>
        </div>
        <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${done}%` }} /></div>
      </div>
    </Link>
  );
}

function TripCard({ trip, past }: { trip: TripSummary; past?: boolean }) {
  return (
    <Link
      to={`/trip/${trip.slug}`}
      className="card"
      style={{
        display: "flex", alignItems: "center", gap: 11, textDecoration: "none",
        opacity: past ? 0.7 : 1,
        borderColor: past ? "var(--line-soft)" : "var(--line)",
        background: past ? "transparent" : "var(--surface)",
      }}
    >
      <DateChip date={trip.startDate} dim={past} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>{trip.name}</span>
        <span className="tiny muted">
          {formatRange(trip.startDate, trip.endDate)}
          {trip.cities.length > 0 && ` · ${trip.cities.join(", ")}`}
        </span>
      </div>
      <AvatarStack members={trip.members} size={22} />
    </Link>
  );
}

export function Trips() {
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.listTrips().then(setTrips).catch((e: Error) => setError(e.message));
  }, []);

  const today = toDayNumber(new Date().toISOString().slice(0, 10));
  const now = trips?.filter((t) => bucket(t, today) === "now") ?? [];
  const soon = trips?.filter((t) => bucket(t, today) === "soon") ?? [];
  const past = trips?.filter((t) => bucket(t, today) === "past") ?? [];

  return (
    <div className="app">
      <div className="nav"><h1 className="nav__title">Trips</h1></div>

      {error && <p className="empty">{error}</p>}
      {!trips && !error && <div className="spinner" />}

      {trips?.length === 0 && (
        <p className="empty">
          No trips yet.<br />The first one takes a name and two dates.
        </p>
      )}

      {now.length > 0 && <div className="eyebrow">HAPPENING NOW</div>}
      {now.map((t) => <CurrentTripCard key={t.id} trip={t} />)}

      {soon.length > 0 && <div className="eyebrow">COMING UP</div>}
      {soon.map((t) => <TripCard key={t.id} trip={t} />)}

      {past.length > 0 && <div className="eyebrow" style={{ paddingTop: 10 }}>PAST</div>}
      {past.map((t) => <TripCard key={t.id} trip={t} past />)}

      <div className="footer">
        <button className="btn btn--block" onClick={() => navigate("/new")}>
          <Icon name="plus" size={16} color="var(--paper)" width={2.3} />
          Start a new trip
        </button>
      </div>
    </div>
  );
}
