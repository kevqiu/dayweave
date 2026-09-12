-- A stand-in for Better Auth's `user` table so the UI has names and avatars to
-- render before sign-in exists (PLAN.md section 5). Better Auth generates its
-- own `user` table; when it lands, point the joins at that and drop this one.
-- Deliberately named app_user so it cannot collide with what Better Auth makes.

CREATE TABLE app_user (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  image      TEXT,
  created_at INTEGER NOT NULL
);
