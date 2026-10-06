import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
// Node-only validator; the app package has no browser/runtime dependencies.
// @ts-expect-error Plain JavaScript validation module.
import { validateManifest } from "../../stripe-revenue-app/validate.mjs";
const manifest = JSON.parse(readFileSync("stripe-revenue-app/stripe-app.json", "utf8"));
const require = createRequire(import.meta.url);

describe("read-only Stripe App package", () => {
  it("validates the JSON package and matches the v2 YAML permissions", () => {
    expect(validateManifest(manifest)).toBe(true);
    const yaml = require("js-yaml").load(readFileSync("stripe-revenue-app/stripe-app.yaml", "utf8"));
    expect(yaml.id).toBe(manifest.id);
    expect(yaml.declarations.allowed_redirect_uris).toEqual(manifest.allowed_redirect_uris);
    expect(yaml.declarations.stripe_api_access.permissions).toEqual(manifest.permissions);
    expect(yaml.extensions).toEqual([]);
  });
  it("rejects broader grants and altered callback origins", () => {
    expect(() => validateManifest({ ...manifest, permissions: [...manifest.permissions,
      { permission: "charge_write", purpose: "Unexpected" }] })).toThrow();
    expect(() => validateManifest({ ...manifest, allowed_redirect_uris: ["https://evil.invalid"] })).toThrow();
  });
  it("keeps the public projection guarded by live, fresh, supported evidence", () => {
    const sql = readFileSync("supabase/migrations/20260929075313_slice3_stripe_revenue_verification.sql", "utf8");
    expect(sql).toContain("c.livemode and c.last_successful_sync > now() - interval '72 hours'");
    expect(sql).toContain("p.verification_status = 'verified' and p.source_livemode");
    expect(sql).toContain("b.visibility <> 'private'");
  });
});
