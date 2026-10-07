import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { describe, it, expect, vi } from "vitest";

function tracking() {
  let handler!: (r: Request) => Promise<Response>;
  const rpc = vi.fn(async () => ({ data: true, error: null }));
  const source = readFileSync(
    "supabase/functions/rocket-app-view/index.ts",
    "utf8",
  ).replace(/^import .*;\n/gm, "");
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    {
      Deno: {
        env: {
          get: (key: string) =>
            key === "SUPABASE_URL"
              ? "https://example.invalid"
              : "local-test-only",
        },
        serve: (h: typeof handler) => (handler = h),
      },
      createClient: () => ({ rpc }),
      Response,
      Request,
      TextEncoder,
      crypto: webcrypto,
      Date,
      Uint8Array,
      console,
    },
  );
  const request = (
    body: Record<string, unknown>,
    origin = "https://tryrocket.ai",
    ip = "192.0.2.1",
  ) =>
    new Request("https://example.invalid", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "cf-connecting-ip": ip,
        "user-agent": "local test",
      },
      body: JSON.stringify(body),
    });
  return { handler, rpc, request };
}
const app = "00000000-0000-4000-8000-000000000001";
describe("Existing view endpoint extended for outbound clicks", () => {
  it("uses separate RPCs and a rotating opaque hash, with only allowlisted link sources", async () => {
    const h = tracking();
    const response = await h.handler(
      h.request({ app_id: app, kind: "outbound", source: "rocket_badge" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ counted: true });
    expect(h.rpc).toHaveBeenCalledWith("record_marketplace_click", {
      p_app_id: app,
      p_source: "rocket_badge",
      p_visitor_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(h.rpc.mock.calls)).not.toContain("192.0.2.1");
    await h.handler(
      h.request({ app_id: app, kind: "outbound", source: "email@example.com" }),
    );
    expect(h.rpc.mock.lastCall![1].p_source).toBe("direct");
    await h.handler(h.request({ app_id: app }));
    expect(h.rpc.mock.lastCall![0]).toBe("record_app_profile_view");
  });
  it("rejects invalid origins/events and does not manufacture ownership or count without a visitor signal", async () => {
    const h = tracking();
    expect(
      (await h.handler(h.request({ app_id: app }, "https://attacker.invalid")))
        .status,
    ).toBe(403);
    expect(
      (await h.handler(h.request({ app_id: app, kind: "purchase" }))).status,
    ).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
    const noIp = new Request("https://example.invalid", {
      method: "POST",
      headers: {
        origin: "https://tryrocket.ai",
        "content-type": "application/json",
      },
      body: JSON.stringify({ app_id: app, kind: "outbound" }),
    });
    expect((await h.handler(noIp)).status).toBe(202);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
