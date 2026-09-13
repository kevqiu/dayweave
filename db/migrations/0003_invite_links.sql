-- Invites become a link you copy, and a person gets a name.
--
-- PLAN.md section 5 wrote an invite as "a signed token emailed to an address".
-- There is no email service and adding one to send a trip invite to four
-- friends is a whole dependency for one sentence, so the invite is a link the
-- inviter copies and sends however they already talk to that person. Two
-- consequences for the schema:
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

CREATE INDEX trip_invites_live ON trip_invites (trip_id) WHERE revoked_at IS NULL;

-- `app_user` stops being a stand-in with one row in it and starts holding the
-- name people see on each other's avatars. Better Auth still owns `user` when
-- it lands (PLAN.md section 5); this is what carries a name until then.
--
-- The only change is that `email` becomes optional: sign-in asks for a name
-- and nothing else, so there is no address to put in it, and NOT NULL would
-- force an invented one.
CREATE TABLE app_user_next (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE,
  name       TEXT NOT NULL,
  image      TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO app_user_next (id, email, name, image, created_at)
  SELECT id, email, name, image, created_at FROM app_user;

DROP TABLE app_user;
ALTER TABLE app_user_next RENAME TO app_user;
