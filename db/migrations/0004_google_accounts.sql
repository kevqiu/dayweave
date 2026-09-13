-- Google sign-in (PLAN.md section 5).
--
-- `account` is the table section 9 describes, and it is what makes Drive
-- possible later without sending anyone back through a consent screen: the
-- refresh token lands here on the first sign-in, and `scope` is how we know
-- whether Drive was ever granted.
--
-- Better Auth owns this table when it lands and generates its own migration
-- for it. The columns below are deliberately the ones it uses, so that day is
-- a rename rather than a reshape.
CREATE TABLE account (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  provider_id         TEXT NOT NULL,          -- 'google', and only 'google'
  provider_account_id TEXT NOT NULL,          -- the `sub` claim. stable, never reused
  access_token        TEXT,
  refresh_token       TEXT,
  scope               TEXT,
  expires_at          INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  -- One Google account is one person here. Signing in again finds this row
  -- rather than making a second one.
  UNIQUE (provider_id, provider_account_id)
);

CREATE INDEX account_by_user ON account (user_id);
