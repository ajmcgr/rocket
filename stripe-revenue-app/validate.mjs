import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

export function validateManifest(manifest) {
  const allowed = new Set(["id", "version", "name", "distribution_type", "sandbox_install_compatible",
    "stripe_api_access_type", "allowed_redirect_uris", "permissions"]);
  for (const field of Object.keys(manifest)) assert.ok(allowed.has(field), `Unreviewed manifest field: ${field}`);
  assert.equal(manifest.id, "com.worksapp.rocket-revenue-verification");
  assert.equal(manifest.name, "Rocket Revenue Verification");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.distribution_type, "public");
  assert.equal(manifest.stripe_api_access_type, "oauth");
  assert.equal(manifest.sandbox_install_compatible, true);
  assert.deepEqual(manifest.allowed_redirect_uris, [
    "https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-stripe-revenue",
  ]);
  assert.deepEqual(manifest.permissions.map(({ permission }) => permission).sort(),
    ["plan_read", "product_read", "subscription_read"]);
  for (const permission of manifest.permissions) {
    assert.deepEqual(Object.keys(permission).sort(), ["permission", "purpose"]);
    assert.ok(permission.purpose?.trim());
  }
  assert.ok(!manifest.connect_permissions, "Connect permissions must not be requested");
  assert.ok(!manifest.ui_extension, "This package is a backend-only data integration");
  assert.ok(!manifest.constants, "Backend secrets must not be packaged");
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateManifest(JSON.parse(readFileSync(new URL("stripe-app.json", import.meta.url), "utf8")));
  console.log("Local manifest checks passed: OAuth, exact callback, three read-only permissions. Stripe upload validation remains required.");
}
