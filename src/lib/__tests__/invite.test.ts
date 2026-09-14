import { describe, expect, it } from "vitest";
import {
  agoLabel,
  contributionLine,
  firstName,
  inviteSentence,
  inviteToken,
  inviteUrl,
  monthLabel,
} from "../invite.ts";

describe("inviteToken", () => {
  it("is 32 hex characters, and not the same one twice", () => {
    const token = inviteToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(token).not.toBe(inviteToken());
  });
});

describe("inviteUrl", () => {
  it("hangs the token off /i/ on whatever origin served the request", () => {
    expect(inviteUrl("https://yvr.kocho.sh", "abc")).toBe("https://yvr.kocho.sh/i/abc");
  });

  it("does not double the slash when the origin carries one", () => {
    expect(inviteUrl("https://yvr.kocho.sh/", "abc")).toBe("https://yvr.kocho.sh/i/abc");
  });
});

describe("inviteSentence", () => {
  it("writes design/Trips.dc.html's line", () => {
    expect(inviteSentence("Mika Tanaka", "Korea")).toBe("Mika invited you to Korea");
  });

  it("stays a sentence when the inviter has no name", () => {
    expect(inviteSentence("", "Korea")).toBe("You have been invited to Korea");
  });
});

describe("firstName", () => {
  it("is how a person says it out loud", () => {
    expect(firstName("Mika Tanaka")).toBe("Mika");
    expect(firstName("Mika")).toBe("Mika");
  });
});

describe("monthLabel", () => {
  it("writes Mar 2026 for a trip inside one month", () => {
    expect(monthLabel("2026-03-04", "2026-03-14")).toBe("Mar 2026");
  });

  it("says both months when the trip straddles two", () => {
    expect(monthLabel("2025-09-30", "2025-10-10")).toBe("Sep – Oct 2025");
  });

  it("says both years when the trip straddles those", () => {
    expect(monthLabel("2025-12-28", "2026-01-06")).toBe("Dec 2025 – Jan 2026");
  });

  it("says nothing rather than inventing a date it cannot read", () => {
    expect(monthLabel("not a date", "also not")).toBe("");
  });
});

describe("contributionLine", () => {
  it("counts places the way design/Members.dc.html writes them", () => {
    expect(contributionLine(9)).toBe("added 9 places");
    expect(contributionLine(1)).toBe("added 1 place");
  });

  it("does not write a zero on a person's row", () => {
    expect(contributionLine(0)).toBe("nothing added yet");
  });
});

describe("agoLabel", () => {
  const now = Date.parse("2026-09-13T12:00:00Z");
  const ago = (ms: number) => agoLabel(now - ms, now);

  it("writes the artboard's own invited 2 days ago", () => {
    expect(ago(2 * 86_400_000)).toBe("2 days ago");
  });

  it("rounds the near past into words rather than seconds", () => {
    expect(ago(5_000)).toBe("just now");
    expect(ago(10 * 60_000)).toBe("10 minutes ago");
    expect(ago(3 * 3_600_000)).toBe("3 hours ago");
    expect(ago(60 * 86_400_000)).toBe("2 months ago");
  });

  it("does not run backwards when a clock disagrees", () => {
    expect(agoLabel(now + 10_000, now)).toBe("just now");
  });
});
