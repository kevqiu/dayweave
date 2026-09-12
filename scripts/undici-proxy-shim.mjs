/**
 * Stands in for the `undici` module so that `Agent` is proxy-aware.
 *
 * The real module is passed by absolute URL in the `real` search param, so
 * resolving it here does not re-enter the hook in proxy-agent.mjs.
 */
const real = await import(new URL(import.meta.url).searchParams.get("real"));

const proxied = process.env.HTTPS_PROXY ?? process.env.https_proxy;

// EnvHttpProxyAgent reads HTTPS_PROXY/NO_PROXY itself and forwards the options
// it is given to the agents it builds, so Alchemy's `pipelining: 0` survives.
export const Agent = proxied ? real.EnvHttpProxyAgent : real.Agent;

export const {
  EnvHttpProxyAgent,
  ProxyAgent,
  Pool,
  Client,
  fetch,
  setGlobalDispatcher,
  getGlobalDispatcher,
  request,
  interceptors,
} = real;

export default real.default ?? real;
