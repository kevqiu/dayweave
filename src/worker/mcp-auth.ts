import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import { createDpopReplayStore, createInsufficientScopeError, enforceDpopBinding, isDpopBindingError, parseAccessTokenAuthorization, verifyJwsAccessToken } from "better-auth/oauth2";
import { errors, type JWTPayload } from "jose";
import type { Auth } from "./auth.ts";

export function requireTripMcpAuth(auth: Auth, handler: (request: Request, claims: JWTPayload) => Promise<Response>, resource: string) {
  return async (request: Request): Promise<Response> => {
    try {
      const authorization = parseAccessTokenAuthorization(request.headers.get("authorization"));
      if (!authorization?.token) throw new APIError("UNAUTHORIZED", { message: "missing authorization header" });
      if (authorization.scheme === "Unknown") throw new APIError("UNAUTHORIZED", { error: "invalid_token", message: "authorization scheme must be Bearer or DPoP" });
      const { baseURL, internalAdapter } = await auth.$context;
      const claims = await verifyJwsAccessToken(authorization.token, {
        jwksFetch: () => auth.api.getJwks(),
        jwksCacheKey: auth,
        verifyOptions: { issuer: baseURL, audience: resource },
      }).catch((error) => {
        if (error instanceof errors.JWTExpired) throw new APIError("UNAUTHORIZED", { error: "invalid_token", message: "token expired" });
        if (error instanceof TypeError || error instanceof errors.JOSEError && ![errors.JWKSTimeout.code, errors.JWKSInvalid.code, errors.JWKSMultipleMatchingKeys.code].includes(error.code)) {
          throw new APIError("UNAUTHORIZED", { error: "invalid_token", message: "invalid access token" });
        }
        throw error;
      });
      const scopes = typeof claims.scope === "string" ? claims.scope.split(" ") : [];
      if (!scopes.includes("trips:read")) throw createInsufficientScopeError(["trips:read"]);
      await enforceDpopBinding({
        payload: claims,
        authorization,
        proofJwt: request.headers.get("dpop"),
        method: request.method,
        url: request.url,
        replayStore: createDpopReplayStore(internalAdapter),
      }).catch((error) => {
        if (isDpopBindingError(error)) throw new APIError("UNAUTHORIZED", { error: error.code, message: error.message });
        throw error;
      });
      return await handler(request, claims);
    } catch (error) {
      const challenge = createResourceServerChallenge(error, resource, { challengeScopes: ["trips:read", "trips:write", "offline_access"] });
      if (!challenge) throw error;
      return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: challenge.message }, id: null }, {
        status: challenge.statusCode,
        headers: challenge.headers,
      });
    }
  };
}
