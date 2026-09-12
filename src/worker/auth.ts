/**
 * A stand-in for Better Auth (PLAN.md section 5), which is not wired up yet.
 *
 * Everything downstream already asks "who is this?" and gets an id, so landing
 * real Google sign-in means replacing this file rather than threading a user
 * through the routes. Until then a single local account owns everything, and
 * the id is stable so trips made in one session are still yours in the next.
 */
import type { Context } from "hono";

export const STUB_USER = {
  id: "local-user",
  email: "you@example.com",
  name: "You",
} as const;

export async function ensureStubUser(db: D1Database): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO app_user (id, email, name, created_at) VALUES (?, ?, ?, ?)")
    .bind(STUB_USER.id, STUB_USER.email, STUB_USER.name, Date.now())
    .run();
}

export function currentUserId(_c: Context): string {
  return STUB_USER.id;
}
