import { useState } from "react";
import type { Stop } from "../../shared/types.ts";
import { Icon } from "./Icon.tsx";

/**
 * One stop on the phone. Two lines of text and only one of them is ours: the
 * description is derived, the note is typed by a person (PLAN.md 4c).
 *
 * The action row is Navigate, Visited and the note, because that is the whole
 * job while travelling. Everything rarer is behind the kebab (PLAN.md 4e).
 */
export function StopRow({
  stop, onToggleVisited, onSaveNote, onDelete,
}: {
  stop: Stop;
  onToggleVisited: () => void;
  onSaveNote: (note: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stop.note);
  const [menuOpen, setMenuOpen] = useState(false);

  const visited = stop.status === "visited";
  const mapsUrl = stop.place
    ? `https://www.google.com/maps/search/?api=1&query=${stop.place.lat},${stop.place.lng}`
    : null;

  return (
    <li
      style={{
        borderTop: "1px solid var(--line-soft)",
        padding: "9px 14px 11px",
        opacity: visited ? 0.62 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
        <span
          className="tiny"
          style={{ width: 38, flexShrink: 0, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}
        >
          {stop.startTime ?? ""}
        </span>
        <span
          style={{
            flexGrow: 1,
            fontSize: 14.5,
            fontWeight: 600,
            textDecoration: visited ? "line-through" : "none",
            textDecorationColor: "var(--done-fg)",
          }}
        >
          {stop.title}
        </span>
        <button
          aria-label="More"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          style={{ border: "none", background: "none", color: "var(--ink-3)", padding: "0 2px", fontSize: 16 }}
        >
          ⋯
        </button>
      </div>

      {stop.description && (
        <div className="tiny muted" style={{ marginLeft: 47, marginTop: 2 }}>{stop.description}</div>
      )}

      {stop.note && !editing && (
        <div
          style={{
            marginLeft: 47, marginTop: 5, fontSize: 12, lineHeight: 1.45,
            background: "var(--surface-2)", borderRadius: 8, padding: "6px 9px",
          }}
        >
          {stop.note}
        </div>
      )}

      {editing && (
        <div style={{ marginLeft: 47, marginTop: 6 }}>
          <textarea
            autoFocus rows={2} value={draft}
            placeholder="Booked 13:15, they release the table if you are late"
            onChange={(e) => setDraft(e.target.value)}
            style={{ fontSize: 13 }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              className="btn btn--small"
              onClick={() => { onSaveNote(draft.trim()); setEditing(false); }}
            >
              Save
            </button>
            <button
              className="btn btn--small btn--quiet"
              onClick={() => { setDraft(stop.note); setEditing(false); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!editing && (
        <div style={{ display: "flex", gap: 7, marginLeft: 47, marginTop: 7 }}>
          {mapsUrl && (
            <a
              className="btn btn--small btn--quiet"
              href={mapsUrl} target="_blank" rel="noreferrer"
              style={{ textDecoration: "none", color: "var(--ink)" }}
            >
              Navigate
            </a>
          )}
          <button
            className="btn btn--small"
            onClick={onToggleVisited}
            style={
              visited
                ? { background: "var(--done-bg)", color: "var(--ink-2)" }
                : { background: "var(--today-bg)", color: "#41613E" }
            }
          >
            {visited && <Icon name="check" size={12} width={2.6} />}
            {visited ? "Visited" : "Mark visited"}
          </button>
          <button className="btn btn--small btn--quiet" onClick={() => setEditing(true)}>
            {/* Tells you at a glance whether anyone has written anything. */}
            {stop.note ? "Edit note" : "Add note"}
          </button>
        </div>
      )}

      {menuOpen && (
        <div style={{ marginLeft: 47, marginTop: 7 }}>
          <button
            className="btn btn--small btn--quiet"
            onClick={() => { setMenuOpen(false); onDelete(); }}
            style={{ color: "#A8663C" }}
          >
            Remove from list
          </button>
        </div>
      )}
    </li>
  );
}
