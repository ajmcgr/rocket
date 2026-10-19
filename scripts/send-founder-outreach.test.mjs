import { test } from "node:test";
import assert from "node:assert/strict";
import { sendFounderOutreach } from "./send-founder-outreach.mjs";

const key = "test-server-key-".repeat(4);
const now = new Date("2026-10-18T10:00:00Z");
const control = { paused: false, send_mode: "production", production_authorized: true, daily_limit: 25, hourly_limit: 10 };
const candidates = Array.from({ length: 15 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
function fixture({ campaign = control, attempts = [], failAt = 0 } = {}) {
  const sends = [];
  const calls = [];
  const request = async (url, options) => {
    calls.push(url);
    let result;
    if (url.includes("rocket_outreach_control")) result = [campaign];
    else if (url.includes("send_attempts")) result = attempts;
    else if (url.includes("first_batch")) result = candidates;
    else if (JSON.parse(options.body).queue_id === "auth-preflight") {
      return new Response(JSON.stringify({ error: "Invalid queue item" }), { status: 400 });
    } else {
      sends.push(JSON.parse(options.body));
      if (sends.length === failAt) return new Response("failure", { status: 502 });
      result = { ok: true, test_only: false };
    }
    return new Response(JSON.stringify(result), { status: 200 });
  };
  return { request, sends, calls };
}
test("sends no more than ten per batch through the existing sender", async () => {
  const f = fixture();
  assert.deepEqual(await sendFounderOutreach({ key, now, dryRun: false, request: f.request }), { accepted: 10, dryRun: false });
  assert.equal(f.sends.length, 10);
});
test("defaults to dry-run without issuing or sending invitations", async () => {
  const f = fixture();
  const result = await sendFounderOutreach({ key, now, request: f.request });
  assert.equal(result.eligibleInBatch, 10);
  assert.equal(f.sends.length, 0);
});
test("respects rolling daily and hourly remaining capacity", async () => {
  for (const attempts of [
    Array.from({ length: 23 }, () => ({ reserved_at: "2026-10-17T12:00:00Z" })),
    Array.from({ length: 8 }, () => ({ reserved_at: "2026-10-18T09:30:00Z" })),
  ]) {
    const f = fixture({ attempts });
    await sendFounderOutreach({ key, now, dryRun: false, request: f.request });
    assert.equal(f.sends.length, 2);
  }
});
test("a reached limit does not issue invitations", async () => {
  const f = fixture({ attempts: Array.from({ length: 25 }, () => ({ reserved_at: "2026-10-17T12:00:00Z" })) });
  const result = await sendFounderOutreach({ key, now, dryRun: false, request: f.request });
  assert.equal(result.accepted, 0);
  assert.equal(f.calls.length, 2);
});
test("paused, test and unauthorized campaigns never send", async () => {
  for (const change of [{ paused: true }, { send_mode: "test" }, { production_authorized: false }]) {
    const f = fixture({ campaign: { ...control, ...change } });
    assert.equal((await sendFounderOutreach({ key, now, dryRun: false, request: f.request })).accepted, 0);
    assert.equal(f.calls.length, 1);
  }
});
test("stops after an uncertain failure and never retries the recipient", async () => {
  const f = fixture({ failAt: 2 });
  await assert.rejects(sendFounderOutreach({ key, now, dryRun: false, request: f.request }), /stopped after 1 accepted/);
  assert.equal(f.sends.length, 2);
});

test("dry-run checks real sender authentication without sending", async () => {
  const f = fixture();
  await sendFounderOutreach({ key, now, request: f.request });
  assert.equal(f.calls.filter((url) => url.includes("/functions/")).length, 1);
  assert.equal(f.sends.length, 0);
});
test("authentication failure stops before selecting or sending recipients", async () => {
  const f = fixture();
  const request = (url, options) => url.includes("/functions/")
    ? Promise.resolve(new Response(JSON.stringify({ message: "Invalid JWT" }), { status: 401 }))
    : f.request(url, options);
  await assert.rejects(sendFounderOutreach({ key, now, dryRun: false, request }), /authentication preflight failed \(401\)/);
  assert.equal(f.sends.length, 0);
  assert.equal(f.calls.some((url) => url.includes("first_batch")), false);
});
