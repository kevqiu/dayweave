import { describe, expect, it } from "vitest";
import { adoptDevIdentity, initialsFor, initialsForName } from "../store.ts";
import { AVATAR_COLORS, guestAvatarColor } from "../ui/tokens.ts";

describe("initialsForName", () => {
  it("writes the two letters the artboards draw", () => {
    // design/Trips.dc.html: KQ in the header, MT and JL on a card.
    expect(initialsForName("Kevin Qiu")).toBe("KQ");
    expect(initialsForName("Mika Tanaka")).toBe("MT");
  });

  it("takes the first and the last of three names, not the first two", () => {
    expect(initialsForName("Ada Byron Lovelace")).toBe("AL");
  });

  it("gives a single name two letters, because one reads as unfinished", () => {
    expect(initialsForName("Prince")).toBe("PR");
  });

  it("is untroubled by the spacing around a name Google sent", () => {
    expect(initialsForName("  kevin   qiu  ")).toBe("KQ");
  });

  it("says nothing rather than something, for a name that is not one", () => {
    expect(initialsForName("")).toBe("");
    expect(initialsForName("   ")).toBe("");
  });
});

describe("initialsFor", () => {
  it("still answers for an id with no account behind it", () => {
    // A member row outliving its user. Two letters, stable, never digits.
    expect(initialsFor("dev_abc2e218")).toMatch(/^[A-Z]{2}$/);
    expect(initialsFor("dev_abc2e218")).toBe(initialsFor("dev_abc2e218"));
  });
});

/** Records what was prepared and bound, which is all this needs to check. */
function fakeDb() {
  const statements: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const entry = { sql: sql.replace(/\s+/g, " ").trim(), args: [] as unknown[] };
      return {
        bind(...args: unknown[]) {
          entry.args = args;
          statements.push(entry);
          return entry;
        },
      };
    },
    async batch(list: unknown[]) {
      return list;
    },
  };
  return { db: db as unknown as D1Database, statements };
}

describe("adoptDevIdentity", () => {
  it("moves everything the cookie's id touches, in one batch", async () => {
    const { db, statements } = fakeDb();
    await adoptDevIdentity(db, "dev_1", "user_2");

    const sql = statements.map((s) => s.sql);
    // A trip whose owner moved but whose stops did not would put a stranger's
    // initials on the cards of a trip with one member.
    expect(sql.some((s) => s.startsWith("UPDATE trips SET owner_id"))).toBe(true);
    expect(sql.some((s) => s.startsWith("UPDATE stops SET created_by"))).toBe(true);
    expect(sql.some((s) => s.startsWith("UPDATE stops SET visited_by"))).toBe(true);
    expect(sql.some((s) => s.startsWith("UPDATE trip_invites SET invited_by"))).toBe(true);
    expect(sql.some((s) => s.startsWith("UPDATE ops SET actor_id"))).toBe(true);

    for (const statement of statements) {
      expect(statement.args).toContain("dev_1");
    }
  });

  it("ignores a membership collision, then clears what is left of the old id", async () => {
    const { db, statements } = fakeDb();
    await adoptDevIdentity(db, "dev_1", "user_2");

    const sql = statements.map((s) => s.sql);
    const update = sql.findIndex((s) => s.startsWith("UPDATE OR IGNORE trip_members"));
    const remove = sql.findIndex((s) => s.startsWith("DELETE FROM trip_members"));

    // (trip_id, user_id) is the primary key, so a browser holding both ids on
    // one trip would collide. The row already there is the one to keep, and
    // the delete has to come after the update or it takes both.
    expect(update).toBeGreaterThanOrEqual(0);
    expect(remove).toBeGreaterThan(update);
  });
});

describe("guestAvatarColor", () => {
  it("never deals the terracotta that is always you", () => {
    // design/Trips.dc.html hard-codes the account avatar in the bar to the
    // accent, so the accent is not available to anybody else on that screen.
    for (let i = 0; i < 12; i++) expect(guestAvatarColor(i)).not.toBe(AVATAR_COLORS[0]);
  });

  it("gives the inviter the blue the artboard draws", () => {
    // Mika is first on her own trip, which is terracotta there. On the pending
    // card she is #6E8CA8, because terracotta is taken by whoever is reading.
    expect(guestAvatarColor(0)).toBe("#6E8CA8");
  });

  it("still tells two inviters apart, and wraps rather than falling off", () => {
    expect(guestAvatarColor(1)).not.toBe(guestAvatarColor(0));
    expect(guestAvatarColor(3)).toBe(guestAvatarColor(0));
    expect(AVATAR_COLORS).toContain(guestAvatarColor(-1));
  });
});
