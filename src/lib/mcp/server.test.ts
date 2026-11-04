import { describe, expect, it, vi } from "vitest";
import { createRocketMcpHandler } from "./server";
import { PublicCatalogue } from "./catalog";

const catalogue = {
  search: vi.fn(async () => ({ total: 1, apps: [{ name: "Rocket Test" }] })),
  getApp: vi.fn(async () => ({ name: "Rocket Test" })),
  categories: vi.fn(async () => [{ name: "Productivity" }]),
  trending: vi.fn(async () => [{ name: "Rocket Test" }]),
} as unknown as PublicCatalogue;

async function rpc(method: string, params?: object) {
  const handler = createRocketMcpHandler(catalogue);
  const response = await handler.fetch(new Request("https://tryrocket.ai/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  const raw = await response.text();
  const data = raw.split("\n").find((line) => line.startsWith("data:"));
  return { status: response.status, body: JSON.parse(data?.slice(5).trim() || raw) as Record<string, unknown> };
}

describe("remote MCP protocol", () => {
  it("initializes and advertises exactly four read-only tools", async () => {
    const initialized = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(initialized.status).toBe(200);
    expect((initialized.body.result as Record<string, unknown>).serverInfo).toMatchObject({ name: "rocket-public-catalogue" });
    const listed = await rpc("tools/list");
    expect(listed.status).toBe(200);
    const tools = (listed.body.result as { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> }).tools;
    expect(tools.map(({ name }) => name)).toEqual(["search_apps", "get_app", "browse_categories", "get_trending_apps"]);
    expect(tools.every(({ annotations }) => annotations.readOnlyHint)).toBe(true);
  });

  it("calls search and rejects invalid arguments", async () => {
    const good = await rpc("tools/call", { name: "search_apps", arguments: { query: "rocket", limit: 5 } });
    expect(good.status).toBe(200);
    expect(JSON.stringify(good.body)).toContain("Rocket Test");
    const bad = await rpc("tools/call", { name: "search_apps", arguments: { query: "rocket", limit: 999 } });
    expect(JSON.stringify(bad.body)).not.toContain("Rocket Test");
  });
});
