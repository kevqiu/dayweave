-- A place's regular opening hours, so a stop put at a time the place is shut
-- can say so. src/lib/hours.ts reads and writes the shape.
--
-- `opening_hours` is JSON: seven lists of [start, end] minutes, Sunday first,
-- each piece inside its own day. NULL with `hours_at` set means Google was
-- asked and had no hours (a park, a street); NULL with `hours_at` NULL means
-- nobody has asked yet, which is every place added before this migration.
-- `hours_at` is also what keeps the hours inside Google's caching limits: the
-- trip read refreshes anything older than thirty days.
ALTER TABLE places ADD COLUMN opening_hours TEXT;
ALTER TABLE places ADD COLUMN hours_at INTEGER;
