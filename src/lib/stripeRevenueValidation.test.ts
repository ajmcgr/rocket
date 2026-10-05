import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Check both deployed request validation and pilot enrollment without starting
// Deno.serve or supplying any production credentials.
const source = readFileSync("supabase/functions/rocket-stripe-revenue/index.ts", "utf8");
const uuidChecks = [...source.matchAll(/\/(\^\[0-9a-f\].*?\$)\/i/g)]
  .map((match) => new RegExp(match[1], "i"));

describe("Stripe revenue app ID validation", () => {
  it("accepts real app UUIDs in both the request and pilot checks", () => {
    expect(uuidChecks).toHaveLength(2);
    for (const check of uuidChecks) {
      expect(check.test("b202d75a-02ae-46e6-8419-5b3410cbaac8")).toBe(true);
      expect(check.test("B202D75A-02AE-46E6-8419-5B3410CBAAC8")).toBe(true);
    }
  });
  it("rejects truncated UUIDs and extra content", () => {
    for (const check of uuidChecks) {
      expect(check.test("b202d75a-02ae-46e6-5b3410cbaac8")).toBe(false);
      expect(check.test("b202d75a-02ae-46e6-8419-5b3410cbaac8extra")).toBe(false);
      expect(check.test("not-an-app")).toBe(false);
    }
  });
});
