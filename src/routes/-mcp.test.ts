import { describe, expect, it } from "vitest";
import { rateLimited } from "./mcp";

describe("MCP request rate limit", () => {
  it("allows thirty requests per address each minute", () => {
    const address = "mcp-test-address";
    for (let count = 0; count < 30; count++) expect(rateLimited(address, 1000)).toBe(false);
    expect(rateLimited(address, 1000)).toBe(true);
    expect(rateLimited(address, 61_000)).toBe(false);
    expect(rateLimited("different-address", 1000)).toBe(false);
  });
});
