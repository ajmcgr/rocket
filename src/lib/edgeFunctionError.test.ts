import { describe, expect, it } from "vitest";
import { edgeFunctionErrorMessage } from "./edgeFunctionError";
describe("Edge Function errors", () => {
  it("extracts the server error body without consuming the original response", async () => {
    const context = new Response(JSON.stringify({ error: "Google Analytics read-only permission is missing" }), { status: 502 });
    expect(await edgeFunctionErrorMessage({ context }, "Request failed")).toContain("read-only permission");
    expect(context.bodyUsed).toBe(false);
  });
  it("handles empty gateway responses", async () => {
    expect(await edgeFunctionErrorMessage({ context: new Response(null, { status: 502 }) }, "Request failed")).toBe("Request failed (HTTP 502). Please retry.");
  });
  it("keeps network errors understandable", async () => {
    expect(await edgeFunctionErrorMessage(new Error("Network unavailable"), "Request failed")).toBe("Network unavailable");
  });
});
