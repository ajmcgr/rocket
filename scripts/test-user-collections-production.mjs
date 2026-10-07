// Controlled real-auth REST acceptance, not an admin/JWT-claim impersonation test.
// Supply short-lived USER_A_ACCESS_TOKEN and USER_B_ACCESS_TOKEN through a secure
// process environment. Never print or commit them. This script does not sign in
// accounts, create accounts/profiles, save apps, or touch purchases/financial state.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
if (process.env.COLLECTIONS_PRODUCTION_E2E !== "approved")
  throw new Error(
    "Controlled production E2E requires explicit COLLECTIONS_PRODUCTION_E2E=approved.",
  );
const tokens = [
  process.env.USER_A_ACCESS_TOKEN,
  process.env.USER_B_ACCESS_TOKEN,
];
if (tokens.some((token) => !token))
  throw new Error(
    "Two authorized controlled user sessions are required; no production writes made.",
  );
const source = await readFile(
  new URL("../src/integrations/supabase/client.ts", import.meta.url),
  "utf8",
);
const origin = source.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
const key = source.match(/const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/)?.[1];
assert.equal(origin, "https://lcujmvdgczkjxdstzhnr.supabase.co");
assert.ok(key, "Public API configuration missing");
const headers = (token) => ({
  apikey: key,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  "Content-Type": "application/json",
  Prefer: "return=representation",
});
async function request(path, token, method = "GET", body) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: headers(token),
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}
async function ok(path, token, method = "GET", body) {
  const result = await request(path, token, method, body);
  assert.ok(
    result.status >= 200 && result.status < 300,
    `Controlled request failed: ${method} ${path.split("?")[0]} HTTP ${result.status}`,
  );
  return result.data;
}
let passes = 0;
const check = (name, value) => {
  assert.ok(value, name);
  passes++;
  console.log(`PASS ${name}`);
};
const [A, B] = await Promise.all(
  tokens.map((token) => ok("/auth/v1/user", token)),
);
assert.ok(
  A.id && B.id && A.id !== B.id,
  "Two distinct actual authenticated users required",
);
const [profile] = await ok(
  `/rest/v1/member_public_profiles?select=username&user_id=eq.${A.id}`,
  tokens[0],
);
assert.ok(
  profile?.username,
  "Controlled User A needs an existing public profile; no profile was created or changed.",
);
const baseline = await ok(
  "/rest/v1/saved_apps?select=app_id,saved_at&order=app_id.asc",
  tokens[0],
);
const apps = await ok(
  "/rest/v1/public_apps?select=id&order=id.asc&limit=3",
  null,
);
assert.ok(apps.length === 3, "Three public test app listings required");
let collection;
try {
  [collection] = await ok("/rest/v1/user_collections", tokens[0], "POST", {
    name: "Rocket Test Collection",
  });
  check("Collection defaults private", collection.visibility === "private");
  await ok(
    "/rest/v1/collection_apps",
    tokens[0],
    "POST",
    apps
      .slice(0, 2)
      .map((app) => ({ collection_id: collection.id, app_id: app.id })),
  );
  const direct = `/rest/v1/user_collections?id=eq.${collection.id}&select=id,name,visibility`;
  const memberships = `/rest/v1/collection_apps?collection_id=eq.${collection.id}&select=app_id`;
  const projected = `/rest/v1/public_user_collections?slug=eq.${collection.slug}&select=*`;
  for (const [label, token] of [
    ["User B", tokens[1]],
    ["Anonymous", null],
  ]) {
    check(
      `${label} cannot read private collection`,
      (await ok(direct, token)).length === 0,
    );
    check(
      `${label} cannot read private memberships`,
      (await ok(memberships, token)).length === 0,
    );
    check(
      `${label} public projection excludes private`,
      (await ok(projected, token)).length === 0,
    );
  }
  check(
    "Private projection excluded even for owner",
    (await ok(projected, tokens[0])).length === 0,
  );
  const denied = await request("/rest/v1/collection_apps", tokens[1], "POST", {
    collection_id: collection.id,
    app_id: apps[2].id,
  });
  check(
    "User B membership insert denied",
    denied.status === 403 || denied.status === 401,
  );
  check(
    "User B rename/privacy cannot affect owner collection",
    (
      await ok(direct, tokens[1], "PATCH", {
        name: "Unauthorized",
        visibility: "public",
      })
    ).length === 0,
  );
  check(
    "User B removal cannot affect owner membership",
    (await ok(memberships, tokens[1], "DELETE")).length === 0,
  );
  check(
    "User B delete cannot affect owner collection",
    (await ok(direct, tokens[1], "DELETE")).length === 0,
  );
  const duplicate = await request(
    "/rest/v1/collection_apps",
    tokens[0],
    "POST",
    { collection_id: collection.id, app_id: apps[0].id },
  );
  check(
    "Duplicate membership rejected without extra app",
    duplicate.status === 409 && (await ok(memberships, tokens[0])).length === 2,
  );
  await ok(direct, tokens[0], "PATCH", { visibility: "public" });
  check(
    "User B can read public collection with two apps",
    Number((await ok(projected, tokens[1]))[0]?.app_count) === 2,
  );
  check(
    "Anonymous can read intentionally public collection",
    (await ok(projected, null)).length === 1,
  );
  check(
    "Public profile projection eligible",
    (
      await ok(
        `${projected}&username=eq.${encodeURIComponent(profile.username)}&app_count=gt.0`,
        tokens[1],
      )
    ).length === 1,
  );
  check(
    "Public discovery eligible",
    (await ok(`${projected}&app_count=gt.0`, null)).length === 1,
  );
  await ok(direct, tokens[0], "PATCH", {
    name: "Rocket Test Collection Renamed",
  });
  check(
    "Rename preserves public slug",
    (await ok(projected, tokens[1]))[0]?.name ===
      "Rocket Test Collection Renamed",
  );
  await ok(`${memberships}&app_id=eq.${apps[1].id}`, tokens[0], "DELETE");
  check(
    "Removal updates visible count",
    Number((await ok(projected, tokens[1]))[0]?.app_count) === 1,
  );
  await ok(direct, tokens[0], "PATCH", { visibility: "private" });
  check(
    "Privacy change immediately blocks detail/profile/discovery",
    (await ok(projected, tokens[1])).length === 0 &&
      (await ok(projected, null)).length === 0 &&
      (await ok(memberships, tokens[1])).length === 0,
  );
  check(
    "Existing controlled saves unchanged",
    JSON.stringify(
      await ok(
        "/rest/v1/saved_apps?select=app_id,saved_at&order=app_id.asc",
        tokens[0],
      ),
    ) === JSON.stringify(baseline),
  );
} finally {
  if (collection?.id) {
    await ok(
      `/rest/v1/user_collections?id=eq.${collection.id}`,
      tokens[0],
      "DELETE",
    );
    check(
      "Controlled collection and memberships cleaned up",
      (
        await ok(
          `/rest/v1/my_user_collections?id=eq.${collection.id}`,
          tokens[0],
        )
      ).length === 0 &&
        (
          await ok(
            `/rest/v1/collection_apps?collection_id=eq.${collection.id}`,
            tokens[0],
          )
        ).length === 0,
    );
  }
}
console.log(
  `${passes} real-auth REST assertions passed. Browser/mobile E2E remains a separate gate.`,
);
