import { describe, expect, it, vi } from "vitest";
import { safeReturnPath } from "./navigation";

describe("safe authentication return path", () => {
  it("preserves an app claim destination during server rendering", () => {
    const browserWindow = globalThis.window;
    vi.stubGlobal("window", undefined);
    try {
      expect(safeReturnPath("/apps/add?app=00d71c93-03a6-4a45-9a25-5eb56a6c42a3"))
        .toBe("/apps/add?app=00d71c93-03a6-4a45-9a25-5eb56a6c42a3");
      expect(safeReturnPath("//attacker.example/claim")).toBe("/discover");
    } finally {
      vi.stubGlobal("window", browserWindow);
      vi.unstubAllGlobals();
    }
  });
});
