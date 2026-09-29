import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizedWebsite, createLaunchRecord, launchVoteRecord } from "./sync-launch-catalog.mjs";

test("normalizes tracking parameters without merging different paths", () => {
  assert.equal(normalizedWebsite("HTTPS://Example.com/App?utm_source=x#section")?.identityKey, "https://example.com/App");
  assert.notEqual(normalizedWebsite("https://example.com/App")?.identityKey, normalizedWebsite("https://example.com/app")?.identityKey);
  assert.equal(normalizedWebsite("https://example.com/?channel_id=trylaunchai%2F_017")?.identityKey, "https://example.com");
});

test("rejects non-public and malformed websites", () => {
  for (const value of ["javascript:alert(1)", "http://localhost/a", "http://127.0.0.1/a", "http://172.16.0.1/a", "https://user:pass@example.com", "https:/bad", "https:/abacktools.com/"]) {
    assert.equal(normalizedWebsite(value), null, value);
  }
});

test("same Launch ID and public content produces stable source hash", () => {
  const product = { id: "abc", slug: "example", name: "Example", domain_url: "https://example.com", launch_date: "2026-09-01T00:00:00Z", platforms: ["web"] };
  const enrichment = { categories: ["AI", "AI"], tags: [], icon: "https://example.com/icon.png" };
  const first = createLaunchRecord(product, enrichment, new Map());
  const second = createLaunchRecord(product, enrichment, new Map());
  assert.deepEqual(first, second);
  assert.deepEqual(first.categories, ["AI"]);
  assert.equal(first.source_url, "https://trylaunch.ai/launch/example");
});

test("duplicate exact URL stays ambiguous without rejecting distinct products on one host", () => {
  const product = { id: "abc", slug: "example", name: "Example", domain_url: "https://example.com/tool", launch_date: null, platforms: [] };
  assert.equal(createLaunchRecord(product, {}, new Map([["https://example.com/tool", 2]])).ambiguous, true);
  assert.equal(createLaunchRecord(product, {}, new Map([["https://example.com/other", 2]])).ambiguous, false);
});

test("public vote aggregates are bounded, deterministic and missing rows become zero", () => {
  assert.deepEqual(launchVoteRecord("product", { net_votes: 5, total_votes: 7 }),
    { launch_id: "product", net_votes: 5, total_votes: 7 });
  assert.deepEqual(launchVoteRecord("product", undefined),
    { launch_id: "product", net_votes: 0, total_votes: 0 });
  assert.equal(launchVoteRecord("product", { net_votes: -1 }).net_votes, 0);
  assert.throws(() => launchVoteRecord("product", { net_votes: "not a count" }));
});
