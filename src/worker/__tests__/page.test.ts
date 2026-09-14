import { describe, expect, it } from "vitest";
import { CLIENT } from "../ui/client.ts";
import { page } from "../ui/page.ts";
import { styles } from "../ui/styles.ts";

describe("the embedded client script", () => {
  it("parses as JavaScript after branch integration", () => {
    expect(() => new Function(CLIENT)).not.toThrow();
  });
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

/**
 * The same trap, one file over.
 *
 * `styles()` is also one template literal, and a backtick in a comment inside
 * it ends the template early. `tsc --noEmit` does not mind — the wreckage
 * parses as valid TypeScript — so typecheck passes and the deploy is what
 * fails, with esbuild pointing at the line. That has now happened once, which
 * is once more than it should.
 */
describe("the stylesheet", () => {
  it("carries no backtick of its own", () => {
    expect(styles()).not.toContain("`");
  });

  it("is still a stylesheet all the way to the end", () => {
    // A template that ended early takes the rules after it with it.
    expect(styles()).toContain(":root { color-scheme: light; }");
    expect(styles().trimEnd().endsWith("}")).toBe(true);
  });
});

describe("the Plan view's browser script", () => {
  it("is served before the client that reads it", () => {
    const html = page();
    // The script hands the arithmetic over as w.__PLAN__; the client reads it
    // as window.__PLAN__, and has to find it already there.
    expect(html).toContain("w.__PLAN__ =");
    expect(html.indexOf("w.__PLAN__ =")).toBeLessThan(html.indexOf("const PLAN = window.__PLAN__"));
  });
});

describe("page", () => {
  it("serves the client, the icons and the drawn map", () => {
    const html = page();
    expect(html).toContain("window.__ICONS__");
    expect(html).toContain("window.__MAP__");
    expect(html).toContain("function render()");
  });

  it("carries the plane as an inline favicon", () => {
    const html = page();
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,');
    // Encoded, because the colour is a "#" and an unencoded one ends the URI.
    expect(html).not.toMatch(/href="data:image\/svg\+xml,[^"]*#/);
  });

  it("does not leak anything that looks like a key", () => {
    expect(page()).not.toMatch(/AIza[0-9A-Za-z_-]{10}/);
  });

  it("puts the browser key in the page when it has one, and nothing when it does not", () => {
    expect(page()).toContain('window.__MAPS_KEY__ = ""');
    expect(page("AIzaTestKey")).toContain('window.__MAPS_KEY__ = "AIzaTestKey"');
  });
});

/** design/SignIn.dc.html. PLAN.md section 5. */
describe("the sign-in screen", () => {
  const html = page();

  it("offers Google, in the words Google's branding terms allow", () => {
    // "Connect with Google" is not one of the permitted strings.
    expect(html).toContain("Continue with Google");
    expect(html).not.toContain("Connect with Google");
  });

  it("is the only provider, and asks for no password", () => {
    expect(html).not.toContain("Continue with Apple");
    expect(html).not.toContain("type=\"password\"");
  });

  it("omits the disclaimer below sign in", () => {
    expect(html.includes("We ask for your name and email, nothing else")).toBe(false);
  });

  it("draws its own quiet map rather than borrowing the trip card's", () => {
    expect(html).toContain("window.__SIGNIN_MAP__");
    expect(html).toContain("#E53935");
    expect(html).toContain("#963DB8");
  });

  it("leaves out the share-link line, which has nothing to open yet", () => {
    expect(html).not.toContain("Open it without an account");
  });
});
