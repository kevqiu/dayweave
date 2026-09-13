-- Better Auth's own tables, and the end of the two stand-ins for a person.
-- PLAN.md section 5, INFRA.md item 4.
--
-- The four tables below are **generated, not written**. They are the output of
-- `getMigrations(...).compileMigrations()` from better-auth 1.7.4, run against
-- the same config the Worker builds in `src/worker/auth.ts`, and copied here
-- verbatim down to the quoting and the `date` column type. Keep it that way:
-- Better Auth introspects these columns on every `auth migrate`, and a column
-- spelled differently by hand reads to it as drift it wants to fix.
--
-- Regenerate rather than edit, if a plugin or an extra field is ever added.

CREATE TABLE "user" (
  "id"            text not null primary key,
  "name"          text not null,
  "email"         text not null unique,
  "emailVerified" integer not null,
  "image"         text,
  "createdAt"     date not null,
  "updatedAt"     date not null
);

CREATE TABLE "session" (
  "id"        text not null primary key,
  "expiresAt" date not null,
  "token"     text not null unique,
  "createdAt" date not null,
  "updatedAt" date not null,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text not null references "user" ("id") on delete cascade
);

-- `accessToken` and `refreshToken` are why this is Better Auth and not 200
-- lines of hand-rolled OAuth: the refresh is handled for us, which is what
-- makes the Drive consent in PLAN.md section 5 possible later without sending
-- anyone back through a consent screen.
CREATE TABLE "account" (
  "id"                    text not null primary key,
  "accountId"             text not null,
  "providerId"            text not null,
  "userId"                text not null references "user" ("id") on delete cascade,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  date,
  "refreshTokenExpiresAt" date,
  "scope"                 text,
  "password"              text,
  "createdAt"             date not null,
  "updatedAt"             date not null
);

CREATE TABLE "verification" (
  "id"         text not null primary key,
  "identifier" text not null,
  "value"      text not null,
  "expiresAt"  date not null,
  "createdAt"  date not null,
  "updatedAt"  date not null
);

CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

-- The first stand-in, gone. `app_user` held exactly one row — `local-user`,
-- "You", you@example.com — and nothing ever read it: the app's owner ids came
-- from the `yvr_dev_uid` cookie instead, so the table was a placeholder for
-- the table above rather than a thing in use. Dropping it is the point of this
-- migration as much as creating the four are. See 0002_stub_user.sql, which
-- said as much when it reconstructed it.
--
-- The one trip it owns in the deployed database goes with it, in the sense
-- that nothing can reach it any more. Nothing could reach it before either;
-- see INFRA.md item 4 for the count and for what is left behind.
DROP TABLE app_user;
