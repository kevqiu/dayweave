import { defineConfig } from "vitest/config";

/**
 * The routes are tested by running them (see `src/worker/__tests__/invites.test.ts`),
 * and running them means importing `src/worker/index.ts`, which re-exports the
 * Durable Object — and that reaches for `cloudflare:workers`, a module only
 * workerd provides.
 *
 * The stub below is enough to import past it. Nothing in the tests touches the
 * Durable Object itself; PLAN.md section 6 is still a stub on the real runtime
 * too, and testing it needs workerd rather than a fake.
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^cloudflare:workers$/, replacement: "/src/worker/__tests__/workerd-stub.ts" }],
  },
});
