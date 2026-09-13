import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  expiresAt,
  identityFromIdToken,
  pkceChallenge,
  randomToken,
  SCOPES,
  tokenRequestBody,
} from "../oauth.ts";

/** An id token, made the way Google makes one, minus the signature we ignore. */
function idToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "RS256" })}.${encode(claims)}.signature`;
}

describe("randomToken", () => {
  it("is URL safe, so it survives a redirect without escaping", () => {
    for (let i = 0; i < 20; i++) expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is not the same token twice", () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe("pkceChallenge", () => {
  it("is the base64url SHA-256 of the verifier, as RFC 7636 writes it", async () => {
    // The worked example from RFC 7636 appendix B.
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("carries no padding, which a query string would have to escape", async () => {
    expect(await pkceChallenge(randomToken())).not.toContain("=");
  });
});

describe("authorizeUrl", () => {
  const url = new URL(
    authorizeUrl({
      clientId: "client.apps.googleusercontent.com",
      redirectUri: "https://yvr.kocho.sh/auth/google/callback",
      state: "state-123",
      challenge: "challenge-abc",
    }),
  );

  it("goes to Google's own authorize endpoint", () => {
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  });

  it("asks for a name and an email and nothing else", () => {
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(SCOPES).not.toContain("https://www.googleapis.com/auth/drive.file");
  });

  it("carries the code challenge, and says it is a SHA-256", () => {
    expect(url.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("asks for a refresh token, which only ever comes back on the first consent", () => {
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("carries the state the callback checks the browser against", () => {
    expect(url.searchParams.get("state")).toBe("state-123");
  });
});

describe("tokenRequestBody", () => {
  it("spends the code with the verifier that was promised", () => {
    const body = new URLSearchParams(
      tokenRequestBody({
        clientId: "id",
        clientSecret: "secret",
        redirectUri: "https://yvr.kocho.sh/auth/google/callback",
        code: "4/code",
        verifier: "verifier",
      }),
    );
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("4/code");
    expect(body.get("code_verifier")).toBe("verifier");
    expect(body.get("client_secret")).toBe("secret");
  });
});

describe("identityFromIdToken", () => {
  it("reads the person out of the claims", () => {
    const who = identityFromIdToken(
      idToken({ sub: "108", email: "mika@example.com", name: "Mika Tanaka", picture: "https://p" }),
    );
    expect(who).toEqual({
      sub: "108",
      email: "mika@example.com",
      name: "Mika Tanaka",
      picture: "https://p",
    });
  });

  it("keeps a name that is not ASCII", () => {
    expect(identityFromIdToken(idToken({ sub: "1", name: "Zoë Björk" }))?.name).toBe("Zoë Björk");
  });

  it("falls back to the local part of the address when there is no name", () => {
    expect(identityFromIdToken(idToken({ sub: "1", email: "jordan@example.com" }))?.name).toBe(
      "jordan",
    );
  });

  it("refuses a token with no subject, which is not a person", () => {
    expect(identityFromIdToken(idToken({ email: "nobody@example.com" }))).toBeNull();
  });

  it("refuses something that is not a token at all", () => {
    expect(identityFromIdToken("not a jwt")).toBeNull();
    expect(identityFromIdToken("")).toBeNull();
    expect(identityFromIdToken("a.!!!.c")).toBeNull();
  });
});

describe("expiresAt", () => {
  it("turns Google's seconds into a timestamp", () => {
    expect(expiresAt({ expires_in: 3599 }, 1_000_000)).toBe(1_000_000 + 3_599_000);
  });

  it("says nothing rather than inventing an expiry it was not told", () => {
    expect(expiresAt({}, 1_000_000)).toBeNull();
  });
});
