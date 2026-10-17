import { beforeEach, expect, it, vi } from "vitest";
const track = vi.hoisted(() => vi.fn());
vi.mock("./analytics", () => ({ track }));
import { trackVerificationResult } from "./verificationAnalytics";
beforeEach(() => {
  track.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
it("never equates CTA, previews, private status reads or failed/incomplete syncs with verification", () => {
  for (const [action, result] of [
    ["start", { authorization_url: "secret" }],
    ["preview", { value_minor: 100 }],
    ["status", { connection: { status: "active" } }],
    ["sync", { error: "failed" }],
    ["select_property", { sync: { complete: false } }],
  ])
    trackVerificationResult("analytics", "posthog", action as string, result);
  expect(track).not.toHaveBeenCalled();
});
it("counts server-confirmed GA analytics sync without sending private response fields", () => {
  trackVerificationResult("analytics", "ga4", "select_property", {
    sync: { days: 30, points: 90 },
    connection: { status: "active", property_name: "private name" },
  });
  expect(track.mock.calls.map(([event]) => event)).toEqual([
    "analytics_connected",
    "analytics_sync_succeeded",
  ]);
  expect(JSON.stringify(track.mock.calls)).not.toContain("private name");
});
it("counts revenue only after successful server connection, binding and sync", () => {
  trackVerificationResult("revenue", "revenuecat", "connect_api_key", {
    connected: true,
  });
  trackVerificationResult("revenue", "polar", "save_mapping", {
    saved: true,
    visibility: "private",
  });
  trackVerificationResult("revenue", "polar", "sync", {
    sync: { value_minor: 123456, verified_at: "private" },
  });
  expect(track.mock.calls.map(([event]) => event)).toEqual([
    "revenue_connected",
    "revenue_connected",
    "revenue_sync_succeeded",
    "revenue_sync_succeeded",
  ]);
  expect(JSON.stringify(track.mock.calls)).not.toContain("123456");
});
it("requires authenticated server confirmation of an OAuth return and deduplicates refreshes", () => {
  window.history.replaceState(
    null,
    "",
    "/my-apps/app/analytics?posthog=connected",
  );
  trackVerificationResult("analytics", "posthog", "status", {
    error: "unauthorized",
  });
  expect(track).not.toHaveBeenCalled();
  for (let i = 0; i < 2; i++)
    trackVerificationResult("analytics", "posthog", "status", {
      connection: { status: "select_property" },
    });
  expect(track).toHaveBeenCalledTimes(1);
});

it("does not double-count the same connection during mapping and resets only on confirmed disconnect", () => {
  trackVerificationResult(
    "revenue",
    "polar",
    "connect",
    { connected: true },
    "app",
  );
  trackVerificationResult(
    "revenue",
    "polar",
    "save_mapping",
    { saved: true },
    "app",
  );
  expect(
    track.mock.calls.filter(([event]) => event === "revenue_connected"),
  ).toHaveLength(1);
  trackVerificationResult(
    "revenue",
    "polar",
    "disconnect",
    { disconnected: true },
    "app",
  );
  trackVerificationResult(
    "revenue",
    "polar",
    "connect",
    { connected: true },
    "app",
  );
  expect(
    track.mock.calls.filter(([event]) => event === "revenue_connected"),
  ).toHaveLength(2);
});
