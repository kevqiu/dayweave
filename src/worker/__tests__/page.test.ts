import { describe, expect, it } from "vitest";
import { CLIENT } from "../ui/client.ts";
import { page } from "../ui/page.ts";

describe("the embedded client script", () => {
  /**
   * CLIENT is one String.raw template. A backtick anywhere inside it — in a
   * comment as readily as in code — closes the template early, and the error
   * TypeScript reports points at a line nowhere near the one at fault. This
   * has cost two builds, so it is a test rather than a note.
   */
  it("contains no backticks", () => {
    const line = CLIENT.split("\n").findIndex((l) => l.includes("`"));
    expect(line, `backtick on line ${line + 1} of the client script`).toBe(-1);
  });

  it("has no template literal substitutions either", () => {
    expect(CLIENT).not.toContain("${");
  });
});

describe("page", () => {
  it("serves the client, the icons and the drawn map", () => {
    const html = page();
    expect(html).toContain("window.__ICONS__");
    expect(html).toContain("window.__MAP__");
    expect(html).toContain("function render()");
  });

  it("does not leak anything that looks like a key", () => {
    expect(page()).not.toMatch(/AIza[0-9A-Za-z_-]{10}/);
  });
});
