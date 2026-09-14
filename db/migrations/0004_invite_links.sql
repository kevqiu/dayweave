-- An invite becomes a link you copy. PLAN.md section 5.
--
-- Section 5 wrote an invite as "a signed token emailed to an address". There
-- is no email service, and adding one so four friends can be told about a trip
-- is a whole dependency for one sentence, so the invite is a link the inviter
-- copies and sends however they already talk to that person. Two consequences
-- for the schema:
--
--   * `email` goes. The invite has no address to remember.
--   * `token_hash` becomes `token`. A link that cannot be copied twice is not
--     a link you can hand out, and re-copying needs the token itself. Hashing
--     bought little here anyway: the token only ever grants what reading the
--     same database already gives, and the invite is revocable rather than
--     long-lived.
--
-- Nothing ever wrote to the old table — it had no API — so it is replaced
-- rather than migrated.
--
-- `invited_by` references `user`, which is Better Auth's table from
-- 0003_better_auth.sql and is now the only table that holds a person. It is
-- deliberately not a foreign key: Better Auth owns that table and generates
-- its own migrations against it, and a constraint written here from outside is
-- drift the next `auth migrate` would want to reconcile.
DROP TABLE trip_invites;

CREATE TABLE trip_invites (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- No expiry (PLAN.md section 5). Revoking is explicit, and it is the off
  -- half of the one switch on the People screen.
  revoked_at INTEGER
);

-- One live invite per trip is what the People screen offers, and this is the
-- index the lookup for it uses.
CREATE INDEX trip_invites_live ON trip_invites (trip_id) WHERE revoked_at IS NULL;
