/**
 * Google sign-in: the Authorization Code flow with PKCE, by hand.
 *
 * PLAN.md section 5 picks Better Auth, and its own table calls a hand-rolled
 * flow "about 200 lines and genuinely viable, but you own session rotation,
 * CSRF, token refresh and invite tokens forever". Three of those four are
 * already ours — invites are built (section 5), and the state parameter and
 * the session cookie below are the CSRF and rotation story. What is left is
 * refresh, which nothing needs until Drive (section 5), and the refresh token
 * is stored from the first sign-in so that it is there when it does.
 *
 * The part of the trade that decided it: Better Auth cannot be exercised from
 * a session with no Cloudflare token and no OAuth client, so installing it
 * would mean shipping a sign-in nobody had run. This is small enough to test,
 * and everything above it — the screens, invites, membership — is indifferent
 * to which of the two is underneath.
 *
 * Nothing here talks to the network. `src/worker/index.ts` does the two calls.
 */

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Sign-in asks for `openid email profile` and nothing else.
 *
 * That is the promise `design/SignIn.dc.html` prints under the button — "we
 * ask for your name and email, nothing else" — and PLAN.md section 5 makes it
 * the reason Drive is a separate, later consent: a sign-in screen that asks
 * for your Drive is how you lose people at the first screen.
 */
export const SCOPES = ["openid", "email", "profile"] as const;

const base64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** A random URL-safe string, for the verifier and for the state. */
export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64url(buffer);
}

/**
 * The PKCE challenge: the SHA-256 of the verifier, base64url, unpadded.
 *
 * PKCE is not strictly required for a confidential client that keeps a secret,
 * and it is here anyway: it costs two lines and it closes the window where an
 * authorization code lifted out of a redirect can be spent by somebody else.
 */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(digest);
}

export interface AuthorizeInput {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}

/** Where the button sends the browser. */
export function authorizeUrl(input: AuthorizeInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    // A refresh token comes back once, on the first consent, and only when
    // both of these are set. Drive is a later consent (PLAN.md section 5) and
    // it will need one, so it is asked for now rather than after a second
    // trip through Google's consent screen.
    access_type: "offline",
    include_granted_scopes: "true",
  });
  return `${AUTHORIZE}?${params}`;
}

/** The form Google's token endpoint wants, for both the code and a refresh. */
export function tokenRequestBody(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  verifier: string;
}): string {
  return new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.verifier,
  }).toString();
}

export interface GoogleTokens {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
}

export interface GoogleIdentity {
  /** Google's own id for the person. Stable, and never reused. */
  sub: string;
  email: string | null;
  name: string;
  picture: string | null;
}

/**
 * The person, read out of the id token.
 *
 * The signature is **not** verified, and that is correct rather than lazy:
 * this token did not arrive from a browser, it came back from Google's token
 * endpoint over TLS in a request we made, with our own client secret on it.
 * Google's own documentation names that as the case where verification can be
 * skipped. An id token arriving any other way would have to be verified.
 */
export function identityFromIdToken(idToken: string): GoogleIdentity | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;

  let claims: Record<string, unknown>;
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    // The claims are UTF-8, and a name with an accent in it survives only if
    // the bytes are decoded as UTF-8 rather than read as Latin-1.
    const bytes = Uint8Array.from(json, (ch) => ch.charCodeAt(0));
    claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) return null;

  const email = typeof claims.email === "string" ? claims.email : null;
  const given = typeof claims.name === "string" ? claims.name.trim() : "";

  return {
    sub,
    email,
    // Google sends a name for a normal account. An account with none falls
    // back to the local part of the address, because the whole point of
    // signing in is to have something to put on an avatar and in a sentence.
    name: given || (email ? (email.split("@")[0] as string) : "Traveller"),
    picture: typeof claims.picture === "string" ? claims.picture : null,
  };
}

/** When the access token dies, as a timestamp. Absent means we were not told. */
export function expiresAt(tokens: GoogleTokens, now: number): number | null {
  return typeof tokens.expires_in === "number" ? now + tokens.expires_in * 1000 : null;
}
