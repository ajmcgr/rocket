import { expect, it } from "vitest";
import { verificationPhase } from "./verificationJourney";

const recent = new Date(Date.now() - 60_000).toISOString();
const base = { connected: true, status: "active", successfulSync: recent, selected: true, visibility: "private" };

it("distinguishes connection, failure, stale, inactive and ineligible syncs", () => {
  expect(verificationPhase({ ...base, connected: false })).toBe("unconnected");
  expect(verificationPhase({ ...base, successfulSync: null })).toBe("pending");
  expect(verificationPhase({ ...base, lastError: "provider failed" })).toBe("failed");
  expect(verificationPhase({ ...base, successfulSync: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString() })).toBe("stale");
  expect(verificationPhase({ ...base, selected: false })).toBe("inactive");
  expect(verificationPhase({ ...base, eligibleLive: false })).toBe("ineligible");
});

it("only marks explicitly selected, fresh metrics public when visibility allows it", () => {
  expect(verificationPhase(base)).toBe("private");
  expect(verificationPhase({ ...base, visibility: "verified_only" })).toBe("verified_only");
  expect(verificationPhase({ ...base, visibility: ["private", "range"] })).toBe("public");
  expect(verificationPhase({ ...base, visibility: "exact" })).toBe("public");
});
