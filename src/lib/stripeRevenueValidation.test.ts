import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Check both deployed request validation and pilot enrollment without starting
// Deno.serve or supplying any production credentials.
const source = readFileSync("supabase/functions/rocket-stripe-revenue/index.ts", "utf8");
const uuidChecks = [...source.matchAll(/\/(\^\[0-9a-f\].*?\$)\/i/g)]
  .map((match) => new RegExp(match[1], "i"));

describe("Stripe revenue app ID validation", () => {
  it("consumes complete hashed state once before rechecking ownership and exchanging tokens", () => {
    expect(source).toContain('p_state_hash: await sha256(state)');
    const callback = source.slice(source.indexOf("async function callback"), source.indexOf("async function handle"));
    expect(callback.indexOf('consume_app_revenue_oauth_state')).toBeLessThan(callback.indexOf('await ownedApp(row.app_id, row.user_id)'));
    expect(callback.indexOf('await ownedApp(row.app_id, row.user_id)')).toBeLessThan(callback.indexOf('await tokenExchange'));
    const sql = readFileSync("supabase/migrations/20260929075313_slice3_stripe_revenue_verification.sql", "utf8");
    expect(sql).toContain('s.consumed_at is null and s.expires_at > now()');
    expect(source).toContain('expires_at: new Date(Date.now() + 10 * 60_000).toISOString()');
  });
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
