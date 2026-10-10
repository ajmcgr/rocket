import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Rocket Developer product naming", () => {
  it("does not expose the legacy product name in active UI or backend messages", () => {
    for (const path of [
      "src/pages/Developer.tsx",
      "src/pages/MyAppSettings.tsx",
      "supabase/functions/_shared/stripeConnectV2.ts",
      "examples/rocket-connect-test-client/server.mjs",
      "docs/rocket-connect.md",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/Rocket\s+Connect/);
      expect(source, path).toContain("Rocket Developer");
    }
  });

  it("preserves existing integration endpoint identifiers", () => {
    const source = readFileSync("src/pages/Developer.tsx", "utf8");
    expect(source).toContain('"rocket-connect-developer"');
    expect(source).toContain("/rocket-connect-token");
    expect(source).toContain("/rocket-connect-jwks");
  });
});
