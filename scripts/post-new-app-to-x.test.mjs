import assert from "node:assert/strict";
import test from "node:test";
import { composeAppPost, oauthHeader, postNewAppToX } from "./post-new-app-to-x.mjs";

const credentials = { apiKey: "consumer", apiSecret: "consumer-secret", accessToken: "user-token", accessTokenSecret: "user-secret" };
const dbKey = "test-service-role-key-longer-than-32-characters";
const app = { app_id: "11111111-1111-4111-8111-111111111111", slug: "new-app", name: "New App", tagline: "Build something useful." };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

test("OAuth header signs with the user token and does not expose secrets", () => {
  const header = oauthHeader("POST", "https://api.x.com/2/tweets", credentials, new Date("2026-10-30T00:00:00Z"), "fixed-nonce");
  assert.match(header, /^OAuth /);
  assert.match(header, /oauth_consumer_key="consumer"/);
  assert.match(header, /oauth_token="user-token"/);
  assert.match(header, /oauth_signature="[^"]+"/);
  assert.doesNotMatch(header, /consumer-secret|user-secret/);
});

test("post copy is concise, public and strips line breaks from app data", () => {
  const copy = composeAppPost({ ...app, name: "New\nApp", tagline: "Build\n something useful." });
  assert.equal(copy, "New on Rocket: New App\n\nBuild something useful.\n\nhttps://tryrocket.ai/apps/new-app");
  assert.ok(Array.from(copy).length < 220);
  assert.throws(() => composeAppPost({ ...app, slug: "https://elsewhere.test" }), /slug/);
});

test("missing X write credentials stop before any network request", async () => {
  await assert.rejects(postNewAppToX({ dbKey, credentials: { ...credentials, accessToken: "" }, request: () => { throw Error("unexpected request"); } }), /write credentials/);
});

test("wrong X account stops before touching the posting ledger", async () => {
  const paths = [];
  await assert.rejects(postNewAppToX({ dbKey, credentials, request: async (url) => {
    paths.push(url);
    return json({ data: { username: "someone_else" } });
  } }), /does not belong/);
  assert.deepEqual(paths, ["https://api.x.com/2/users/me"]);
});

test("dry run verifies the account and ledger without reserving or posting", async () => {
  const paths = [];
  const result = await postNewAppToX({ dbKey, credentials, request: async (url, options) => {
    paths.push([url, options.method]);
    return url.includes("users/me") ? json({ data: { username: "tryrocketai" } }) : json([{ start_at: "2026-10-30T00:00:00Z" }]);
  } });
  assert.deepEqual(paths.map((entry) => entry[1]), ["GET", "GET"]);
  assert.equal(result.posted, 0);
  assert.equal(result.dryRun, true);
});

test("successful run reserves once, posts once and finalizes the ledger", async () => {
  const paths = [];
  const result = await postNewAppToX({ dbKey, credentials, dryRun: false, request: async (url, options) => {
    paths.push([url, options]);
    if (url.endsWith("/users/me")) return json({ data: { username: "tryrocketai" } });
    if (url.includes("posting_control")) return json([{ start_at: "2026-10-30T00:00:00Z" }]);
    if (url.endsWith("rocket_x_reserve_next_app")) return json([app]);
    if (url.endsWith("/2/tweets")) return json({ data: { id: "1234567890" } });
    if (url.includes("rocket_x_app_posts")) return json([{ app_id: app.app_id, status: "posted" }]);
    throw Error("unexpected request");
  } });
  assert.deepEqual(paths.map((entry) => entry[1].method), ["GET", "GET", "POST", "POST", "PATCH"]);
  assert.equal(JSON.parse(paths[3][1].body).text, composeAppPost(app));
  assert.equal(JSON.parse(paths[4][1].body).x_post_id, "1234567890");
  assert.equal(result.xPostUrl, "https://x.com/tryrocketai/status/1234567890");
});

test("uncertain X failure leaves reservation untouched and is never retried", async () => {
  const paths = [];
  await assert.rejects(postNewAppToX({ dbKey, credentials, dryRun: false, request: async (url) => {
    paths.push(url);
    if (url.endsWith("/users/me")) return json({ data: { username: "tryrocketai" } });
    if (url.includes("posting_control")) return json([{ start_at: "2026-10-30T00:00:00Z" }]);
    if (url.endsWith("rocket_x_reserve_next_app")) return json([app]);
    if (url.endsWith("/2/tweets")) return json({ error: "unknown" }, 503);
    throw Error("unexpected request");
  } }), /stopped without retry/);
  assert.equal(paths.filter((path) => path.endsWith("/2/tweets")).length, 1);
  assert.equal(paths.filter((path) => path.includes("rocket_x_app_posts")).length, 0);
});

test("empty reservation posts nothing", async () => {
  const paths = [];
  const result = await postNewAppToX({ dbKey, credentials, dryRun: false, request: async (url) => {
    paths.push(url);
    if (url.endsWith("/users/me")) return json({ data: { username: "tryrocketai" } });
    if (url.includes("posting_control")) return json([{ start_at: "2026-10-30T00:00:00Z" }]);
    if (url.endsWith("rocket_x_reserve_next_app")) return json([]);
    throw Error("unexpected request");
  } });
  assert.equal(result.posted, 0);
  assert.equal(paths.length, 3);
});
