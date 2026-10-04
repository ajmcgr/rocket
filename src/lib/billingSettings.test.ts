import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const billing = readFileSync("src/pages/Settings.tsx", "utf8").split("export const BillingSettings = () => {")[1];

describe("billing management entry point", () => {
  it("uses the existing secure Stripe portal without a partial plan summary or upsells", () => {
    expect(billing).toContain("https://billing.stripe.com/p/login/14A7sM4NF0GRd7l9UX7Zu00");
    expect(billing).toContain("Manage billing in Stripe");
    expect(billing).not.toContain('from("subscriptions")');
    expect(billing).not.toContain("Upgrade to Pro");
    expect(billing).not.toContain("Credit packs");
    expect(billing).not.toContain("planLabel");
  });

  it("distinguishes Developer billing and app purchases while retaining checkout completion feedback", () => {
    expect(billing).toContain('to="/settings/developer"');
    expect(billing).toContain('to="/library"');
    expect(billing).toContain("separate from Rocket plans");
    expect(billing).toContain('track("checkout_completed"');
    expect(billing).toContain('setSearchParams({}, { replace: true })');
  });
});
