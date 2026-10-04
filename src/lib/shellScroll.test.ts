import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("shell scroll surfaces", () => {
  it("keeps the authenticated header and logo pinned beyond the route's footer boundary", () => {
    const source = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(source).toContain('className="fixed inset-x-0 top-0 z-50 bg-white"');
    expect(source).toMatch(/className="app-shell[^"\n]*\bpt-14\b/);
    expect(source).toContain("<Logo to=\"/\" size=\"md\"");
    expect(source).toContain("bottom-0 left-0 top-14");
  });

  it("uses a light or dark document canvas behind a transparent body", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/html\s*\{\s*background-color: #fff;/);
    expect(css).toMatch(/html\.dark\s*\{[^}]*background-color: #0f0e0c;/);
    expect(css).toMatch(/body\s*\{\s*background-color: transparent;/);
    expect(css).toMatch(/html\.dark body\s*\{\s*background-color: transparent;/);
  });
});
