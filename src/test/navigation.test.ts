import { describe, expect, it } from "vitest";
import { safeReturnPath } from "@/lib/navigation";

describe("safeReturnPath", () => {
  it("preserves an internal pricing purchase path", () => {
    expect(safeReturnPath("/pricing?buy=business_yearly")).toBe("/pricing?buy=business_yearly");
  });

  it("rejects absolute and protocol-relative destinations", () => {
    expect(safeReturnPath("https://example.com/steal")).toBe("/logos");
    expect(safeReturnPath("//example.com/steal")).toBe("/logos");
  });

  it("uses the requested fallback when no path is supplied", () => {
    expect(safeReturnPath(null, "/create")).toBe("/create");
  });
});
