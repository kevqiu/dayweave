-- Reconstructed from the deployed database, which had this migration applied
-- while the file itself was never committed. The schema below is what
-- `sqlite_master` reports, so a fresh database now matches the deployed one.
--
-- This is a stand-in for the `user` table Better Auth will own (PLAN.md
-- section 5), not a table to build on. Nothing references it yet.

CREATE TABLE app_user (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  image      TEXT,
  created_at INTEGER NOT NULL
);
