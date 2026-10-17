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
