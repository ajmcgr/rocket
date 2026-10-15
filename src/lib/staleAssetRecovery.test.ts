import { beforeEach, describe, expect, it } from "vitest";
import { claimStaleAssetReload, isStaleAssetError } from "./staleAssetRecovery";

describe("stale asset recovery", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("recognizes a missing route chunk without treating ordinary page errors as stale assets", () => {
    expect(isStaleAssetError(new TypeError("Failed to fetch dynamically imported module: https://tryrocket.ai/assets/discover-old.js"))).toBe(true);
    expect(isStaleAssetError(new Error("Unable to preload CSS for /assets/route-old.css"))).toBe(true);
    expect(isStaleAssetError(new Error("Database request failed"))).toBe(false);
  });

  it("allows one reload per minute and then permits recovery again", () => {
    expect(claimStaleAssetReload(window.sessionStorage, 100_000)).toBe(true);
    expect(claimStaleAssetReload(window.sessionStorage, 100_001)).toBe(false);
    expect(claimStaleAssetReload(window.sessionStorage, 160_000)).toBe(true);
  });
});
