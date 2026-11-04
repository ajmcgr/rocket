import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./send-week-one-email.mjs";

test("requires a service role key", async () => {
  await assert.rejects(() => run({ key: "" }), /required/);
});

test("defaults to a dry run and authenticates the queue RPC", async () => {
  let call;
  const count = await run({ key: "test-key", fetchImpl: async (...args) => {
    call = args;
    return { ok: true, json: async () => 2 };
  } });
  assert.equal(count, 2);
  assert.match(call[0], /rpc\/queue_week_one_emails$/);
  assert.deepEqual(JSON.parse(call[1].body), { p_dry_run: true });
  assert.equal(call[1].headers.Authorization, "Bearer test-key");
});

test("scheduled mode requests delivery and rejects failures", async () => {
  await assert.rejects(() => run({ key: "test-key", dryRun: false, fetchImpl: async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { p_dry_run: false });
    return { ok: false, status: 503 };
  } }), /503/);
});
