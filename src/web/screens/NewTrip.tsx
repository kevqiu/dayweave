import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.ts";
import { addDays, dayCount, isISODate, toDayNumber } from "../../lib/dates.ts";
import { Icon } from "../components/Icon.tsx";

/**
 * Two fields: a name and the dates. Nothing else (PLAN.md 4d). The screen asks
 * in words rather than labelling fields, and says "we" because a trip is a
 * thing people do together.
 */
export function NewTrip() {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 6));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const datesValid = isISODate(start) && isISODate(end) && toDayNumber(end) >= toDayNumber(start);
  const ready = name.trim().length > 0 && datesValid && !busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const trip = await api.createTrip({ name: name.trim(), startDate: start, endDate: end });
      navigate(`/trip/${trip.slug}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="app" onSubmit={submit}>
      <div className="nav">
        <button
          type="button" aria-label="Back" onClick={() => navigate(-1)}
          style={{ border: "none", background: "none", padding: 4, display: "flex" }}
        >
          <Icon name="back" size={20} color="var(--ink)" />
        </button>
        <h1 className="nav__title">New trip</h1>
      </div>

      <div style={{ padding: "10px 18px 0" }}>
        <label htmlFor="trip-name" style={{ fontFamily: "var(--serif)", fontSize: 20, display: "block" }}>
          Where are we going?
        </label>
        <input
          id="trip-name" autoFocus value={name} maxLength={80}
          placeholder="Japan, autumn"
          onChange={(e) => setName(e.target.value)}
          style={{ marginTop: 10 }}
        />

        <label htmlFor="trip-start" style={{ fontFamily: "var(--serif)", fontSize: 20, display: "block", marginTop: 26 }}>
          And when?
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <input
            id="trip-start" type="date" value={start}
            onChange={(e) => {
              setStart(e.target.value);
              // Keep the range sane rather than rejecting it after the fact.
              if (isISODate(e.target.value) && toDayNumber(end) < toDayNumber(e.target.value)) {
                setEnd(e.target.value);
              }
            }}
          />
          <input
            id="trip-end" type="date" value={end} min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>

        {datesValid && (
          <p className="tiny muted" style={{ marginTop: 10 }}>
            {dayCount(start, end)} {dayCount(start, end) === 1 ? "day" : "days"}.
          </p>
        )}
        {error && <p className="tiny" style={{ color: "#A8663C", marginTop: 10 }}>{error}</p>}
      </div>

      <div className="footer">
        <button type="submit" className="btn btn--block" disabled={!ready}>
          {busy ? "Creating…" : "Create trip"}
        </button>
      </div>
    </form>
  );
}
