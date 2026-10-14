import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const bookingId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const appId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const buyerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function harness({ metricsError = false } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const rpc = vi.fn(async (name: string, args: Record<string, string>) => {
    if (name === "record_rocket_sponsorship_metric")
      return { data: args.p_sponsorship_id === bookingId && args.p_app_id === appId, error: null };
    if (name === "rocket_sponsorship_metrics_for_owner")
      return { data: args.p_user_id === buyerId ? [{ sponsorship_id: bookingId, views: 12, clicks: 3 }] : [],
        error: metricsError ? { message: "Metrics unavailable" } : null };
    if (name === "active_rocket_sponsorships")
      return { data: [{ sponsorship_id: bookingId, sponsorship_type: "featured_app",
        app_id: appId, category: null }], error: null };
    return { data: null, error: { message: "Unexpected RPC" } };
  });
  const from = (table: string) => {
    const query: Record<string, unknown> = { userId: "", ids: [] };
    query.select = () => query;
    query.eq = (column: string, value: string) => {
      if (column === "purchaser_user_id") query.userId = value;
      return query;
    };
    for (const method of ["is", "order", "limit"]) query[method] = () => query;
    query.in = (_column: string, ids: string[]) => { query.ids = ids; return query; };
    query.then = (resolve: (value: unknown) => void) => resolve({
      data: table === "public_discoverable_apps" && (query.ids as string[]).includes(appId)
        ? [{ id: appId, name: "Launch", slug: "launch", tagline: "Discover apps", logo_url: null }]
        : table === "rocket_sponsorships" && (query.ids as string[]).includes(bookingId)
          ? [{ id: bookingId, destination_url: "https://launch.example/pricing" }]
          : table === "rocket_sponsorships" && query.userId === buyerId
            ? [{ id: bookingId, status: "active", actual_start_at: "2026-10-11T00:00:00Z",
              actual_end_at: "2026-10-18T00:00:00Z" }] : [],
      error: null,
    });
    return query;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: buyerId } }, error: null }) },
    from, rpc,
  };
  runInNewContext(ts.transpileModule(
    readFileSync("supabase/functions/rocket-advertising/index.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText, {
    exports: {}, Request, Response, TextEncoder, crypto: webcrypto, console,
    require: (name: string) => name.startsWith("npm:stripe")
      ? { default: class StripeMock {} } : { createClient: () => client },
    Deno: { env: { get: (name: string) => ({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service_mock",
      SUPABASE_ANON_KEY: "anon_mock",
    })[name as "SUPABASE_URL"] }, serve: (fn: typeof handler) => { handler = fn; } },
  });
  const request = (body: object, headers: Record<string, string> = {}) => handler(new Request(
    "https://example.com/rocket-advertising", { method: "POST", headers, body: JSON.stringify(body) },
  ));
  return { request, rpc };
}

describe("paid placement analytics", () => {
  it("returns only the active sponsored app and its selected click-through destination", async () => {
    const { request } = harness();
    const response = await request({ action: "active" });
    expect(response.status).toBe(200);
    expect((await response.json()).placements).toEqual([expect.objectContaining({
      sponsorship_id: bookingId, destination_url: "https://launch.example/pricing",
      app: expect.objectContaining({ id: appId, name: "Launch" }),
    })]);
  });

  it("rejects cross-origin and invalid metric requests before recording", async () => {
    const { request, rpc } = harness();
    const metric = { action: "metric", sponsorship_id: bookingId, app_id: appId, event_type: "view" };
    expect((await request(metric)).status).toBe(403);
    expect((await request({ ...metric, event_type: "purchase" }, {
      Origin: "https://tryrocket.ai", "cf-connecting-ip": "192.0.2.1",
    })).status).toBe(400);
    expect((await request({ ...metric, sponsorship_id: "not-a-uuid" }, {
      Origin: "https://tryrocket.ai", "cf-connecting-ip": "192.0.2.1",
    })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records only eligible placement events and does not store raw visitor identifiers", async () => {
    const { request, rpc } = harness();
    const headers = { Origin: "https://tryrocket.ai", "cf-connecting-ip": "192.0.2.1",
      "User-Agent": "test-browser" };
    const body = { action: "metric", sponsorship_id: bookingId, app_id: appId, event_type: "click" };
    expect((await request(body, headers)).status).toBe(200);
    expect((await request(body, headers)).status).toBe(200);
    expect((await request({ ...body, app_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }, headers)).status).toBe(200);
    expect(await (await request(body, { Origin: "https://tryrocket.ai" })).json())
      .toEqual({ ok: true, counted: false });
    const first = rpc.mock.calls[0][1];
    expect(first.p_visitor_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rpc.mock.calls[1][1].p_visitor_hash).toBe(first.p_visitor_hash);
    expect(JSON.stringify(first)).not.toContain("192.0.2.1");
    expect(rpc).toHaveBeenCalledWith("record_rocket_sponsorship_metric", expect.objectContaining({
      p_sponsorship_id: bookingId, p_app_id: appId, p_event_type: "click",
    }));
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("reads buyer-scoped counts for My Advertising", async () => {
    const { request, rpc } = harness();
    const response = await request({ action: "mine" }, { Authorization: "Bearer buyer" });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sponsorships).toEqual([expect.objectContaining({ id: bookingId, views: 12, clicks: 3 })]);
    expect(rpc).toHaveBeenCalledWith("rocket_sponsorship_metrics_for_owner", { p_user_id: buyerId });
  });

  it("keeps the buyer's bookings visible when metrics are temporarily unavailable", async () => {
    const { request } = harness({ metricsError: true });
    const response = await request({ action: "mine" }, { Authorization: "Bearer buyer" });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sponsorships).toEqual([expect.objectContaining({ id: bookingId, views: null, clicks: null })]);
  });
});
