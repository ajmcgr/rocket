import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("shell scroll surfaces", () => {
  it("uses the shared sticky header and desktop sidebar", () => {
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    const header = readFileSync("src/components/SiteHeader.tsx", "utf8");
    expect(shell).toContain("<SiteHeader");
    expect(shell).toContain('className="app-shell');
    expect(header).toContain('className="sticky top-0 z-40');
    expect(header).toContain(
      "marketplace-sidebar app-shell-sidebar fixed inset-y-0",
    );
  });

  it("uses a light or dark document canvas behind a transparent body", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/html\s*\{\s*background-color: #fff;/);
    expect(css).toMatch(/html\.dark\s*\{[^}]*background-color: #0f0e0c;/);
    expect(css).toMatch(/body\s*\{\s*background-color: transparent;/);
    expect(css).toMatch(
      /html\.dark body\s*\{\s*background-color: transparent;/,
    );
  });
});
