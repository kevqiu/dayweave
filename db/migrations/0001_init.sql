-- PLAN.md section 9. Better Auth owns user/session/account/verification and
-- generates its own migrations; those are deliberately absent here.

CREATE TABLE trips (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  owner_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Membership IS the permission. No role column in v1 (PLAN.md section 5).
CREATE TABLE trip_members (
  trip_id   TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);

-- No expiry. Revoking is explicit.
CREATE TABLE trip_invites (
  id          TEXT PRIMARY KEY,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  invited_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  accepted_at INTEGER,
  revoked_at  INTEGER
);

-- Read-only and unauthenticated. Not a role, a separate door.
CREATE TABLE trip_share_links (
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE days (
  id          TEXT PRIMARY KEY,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  label       TEXT,
  place_label TEXT,           -- "Fukuoka", or "Fukuoka -> Kagoshima"
  hue         TEXT NOT NULL,  -- the sequential ramp, PLAN.md section 7
  UNIQUE (trip_id, date)
);

-- The geographic thing, deduped per trip. city drives the subtitle on a trip
-- card; refreshed_at drives the Places content refresh. KML pins never need it.
CREATE TABLE places (
  id              TEXT PRIMARY KEY,
  trip_id         TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  google_place_id TEXT,
  name            TEXT NOT NULL,
  name_local      TEXT,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  address         TEXT,
  city            TEXT,
  country_code    TEXT,
  category        TEXT,
  maps_url        TEXT,
  source          TEXT NOT NULL CHECK (source IN ('my_map', 'search', 'link')),
  refreshed_at    INTEGER,
  UNIQUE (trip_id, google_place_id)
);

CREATE TABLE stops (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_id     TEXT REFERENCES days(id) ON DELETE SET NULL,  -- NULL = To be planned
  place_id   TEXT REFERENCES places(id) ON DELETE SET NULL, -- NULL = a note, no pin
  title      TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',   -- typed by a person, never generated
  start_time TEXT,
  end_time   TEXT,
  order_key  TEXT NOT NULL,              -- fractional index, PLAN.md section 6
  status     TEXT NOT NULL DEFAULT 'planned'
             CHECK (status IN ('planned', 'visited', 'skipped')),
  visited_at INTEGER,
  visited_by TEXT,
  created_by TEXT NOT NULL,              -- the avatar on the card
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER                     -- soft, so an offline edit is undoable
);

CREATE INDEX stops_by_day ON stops (trip_id, day_id, order_key) WHERE deleted_at IS NULL;

CREATE TABLE travel_legs (
  id            TEXT PRIMARY KEY,
  trip_id       TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_id        TEXT REFERENCES days(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL CHECK (mode IN ('plane', 'train', 'ferry', 'bus', 'car')),
  carrier       TEXT,
  code          TEXT,
  depart_at     TEXT,
  arrive_at     TEXT,
  from_place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  to_place_id   TEXT REFERENCES places(id) ON DELETE SET NULL,
  note          TEXT NOT NULL DEFAULT ''
);

-- Spans nights, so a date range rather than one day.
CREATE TABLE lodging (
  id        TEXT PRIMARY KEY,
  trip_id   TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  place_id  TEXT REFERENCES places(id) ON DELETE SET NULL,
  name      TEXT NOT NULL,
  check_in  TEXT NOT NULL,
  check_out TEXT NOT NULL,
  note      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE sources (
  id             TEXT PRIMARY KEY,
  trip_id        TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('google_my_map', 'manual')),
  config         TEXT NOT NULL DEFAULT '{}',
  last_synced_at INTEGER,
  cursor         TEXT,
  status         TEXT NOT NULL DEFAULT 'ok'
);

-- Append-only. Replay for offline clients, and an undo history for free.
CREATE TABLE ops (
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  actor_id    TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  patch       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (trip_id, seq)
);
