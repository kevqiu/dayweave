/**
 * Makes `alchemy deploy` work from behind the session's egress proxy.
 *
 * Alchemy's safe-fetch passes its own `new Agent()` from undici as a
 * per-request dispatcher. A per-request dispatcher overrides the global one,
 * so the proxy-aware agent that NODE_USE_ENV_PROXY installs never gets used
 * and every Cloudflare API call goes out directly. The egress gateway answers
 * `Host not in allowlist` with a 403 and a non-JSON body, which Alchemy
 * reports as `The API returned an invalid response` — see ENVIRONMENT.md.
 *
 * So we resolve undici's `Agent` to `EnvHttpProxyAgent`, but *only* for
 * Alchemy's safe-fetch. Miniflare requires undici synchronously from CJS and
 * a shim with top-level await cannot be require()d, so a blanket hook breaks
 * the local dev server. Load with `node --import ./scripts/proxy-agent.mjs`.
 *
 * No-op when no proxy is configured, so it is safe to leave in the deploy
 * script on a normal machine.
 */
import { registerHooks } from "node:module";

const proxied = process.env.HTTPS_PROXY ?? process.env.https_proxy;

if (proxied) {
  const shim = new URL("./undici-proxy-shim.mjs", import.meta.url);
  shim.searchParams.set("real", import.meta.resolve("undici"));

  registerHooks({
    resolve(specifier, context, next) {
      const from = context.parentURL ?? "";
      if (specifier !== "undici" || !from.includes("/alchemy/lib/util/safe-fetch")) {
        return next(specifier, context);
      }
      return { url: shim.href, shortCircuit: true };
    },
  });
}
