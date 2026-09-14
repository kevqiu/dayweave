/** Stands in for `cloudflare:workers` so the Worker can be imported by a test. */
export class DurableObject {
  constructor(
    readonly ctx: unknown,
    readonly env: unknown,
  ) {}
}
