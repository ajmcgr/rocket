import { describe, expect, it } from "vitest";
import { rateLimited, serve } from "./mcp";

describe("MCP request rate limit", () => {
  it("allows thirty requests per address each minute", () => {
    const address = "mcp-test-address";
    for (let count = 0; count < 30; count++) expect(rateLimited(address, 1000)).toBe(false);
    expect(rateLimited(address, 1000)).toBe(true);
    expect(rateLimited(address, 61_000)).toBe(false);
    expect(rateLimited("different-address", 1000)).toBe(false);
  });
});

describe("MCP browser navigation", () => {
  it("opens the setup guide for an HTML navigation", async () => {
    const result = await serve(new Request("https://tryrocket.ai/mcp", {
      headers: { accept: "text/html,application/xhtml+xml", "x-real-ip": "mcp-browser-test" },
    }));
    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe("https://tryrocket.ai/docs/rocket-mcp");
  });

  it("keeps the origin check for browser navigation", async () => {
    const result = await serve(new Request("https://tryrocket.ai/mcp", {
      headers: { accept: "text/html", origin: "https://example.com", "x-real-ip": "mcp-origin-test" },
    }));
    expect(result.status).toBe(403);
  });
});
