import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

function load(configured = true) {
  let handler!: (request: Request) => Promise<Response>;
  const createClient = vi.fn();
  const fetch = vi.fn();
  runInNewContext(ts.transpileModule(
    readFileSync("supabase/functions/rocket-founder-outreach-test/index.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText, {
    exports: {}, Request, Response, fetch,
    Deno: {
      env: { get: () => configured ? "mock-only" : undefined },
      serve: (fn: typeof handler) => { handler = fn; },
    },
    require: () => ({ createClient }),
  });
  return { handler, createClient, fetch };
}

describe("outreach browser delivery connection", () => {
  it("answers preflight without checking secrets or creating a send attempt", async () => {
    const h = load(false);
    const response = await h.handler(new Request("https://example.com", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://tryrocket.ai");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("authorization");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("x-supabase-client-platform");
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("still rejects unauthenticated sends with a browser-readable error", async () => {
    const h = load();
    const response = await h.handler(new Request("https://example.com", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://tryrocket.ai");
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("rejects other methods and preserves the configuration gate", async () => {
    const h = load(false);
    expect((await h.handler(new Request("https://example.com"))).status).toBe(405);
    const response = await h.handler(new Request("https://example.com", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://tryrocket.ai");
    expect(h.fetch).not.toHaveBeenCalled();
  });
});


describe("outreach handler scheduler and admin authentication", () => {
  const probe = (token?: string) => new Request("https://example.com", {
    method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ queue_id: "auth-preflight" }),
  });
  it("accepts a server credential validated by the service-only database probe", async () => {
    const h = load();
    h.createClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: true, error: null }) });
    const response = await h.handler(probe("valid-rotated-server-key"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid queue item" });
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("does not trust a forged service-role JWT or an arbitrary bearer token", async () => {
    for (const token of ["invalid", "eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0."]) {
      const h = load();
      const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("Invalid JWT") });
      h.createClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("Permission denied") }), auth: { getUser } });
      expect((await h.handler(probe(token))).status).toBe(401);
      expect(getUser).toHaveBeenCalledWith(token);
      expect(h.fetch).not.toHaveBeenCalled();
    }
  });
  it("requires both an authenticated user and admin authorization for browser sends", async () => {
    for (const isAdmin of [false, true]) {
      const h = load();
      const rpc = vi.fn().mockImplementation(async (name) => name === "rocket_outreach_is_scheduler"
        ? { data: null, error: new Error("Permission denied") }
        : { data: isAdmin, error: null });
      h.createClient.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } }, error: null }) }, rpc });
      expect((await h.handler(probe("user-jwt"))).status).toBe(isAdmin ? 400 : 403);
      expect(rpc).toHaveBeenCalledWith("is_rocket_admin");
      expect(h.fetch).not.toHaveBeenCalled();
    }
  });
});
