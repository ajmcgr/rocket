// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as oauth from "../../supabase/functions/_shared/stripeRevenueOAuth";
import * as mrr from "../../supabase/functions/_shared/stripeRevenueMrr";

const reviewer = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const app = "20000000-0000-4000-8000-000000000001";
const unrelated = "20000000-0000-4000-8000-000000000002";
const env = {
  SUPABASE_URL: "https://lcujmvdgczkjxdstzhnr.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-fixture",
  SUPABASE_ANON_KEY: "anon-fixture", STRIPE_REVENUE_LIVE_ENABLED: "false",
  STRIPE_REVENUE_PUBLIC_CLIENT_ID: "ca_registeredfixture", STRIPE_REVENUE_APP_LIVE_API_KEY: "sk_live_fixture",
  STRIPE_REVENUE_TOKEN_ENCRYPTION_KEY: btoa("a".repeat(32)), STRIPE_REVENUE_PILOT_APP_IDS: unrelated,
  STRIPE_REVENUE_APP_TEST_API_KEY: "sk_test_fixture",
  STRIPE_REVENUE_TEST_OAUTH_URL: "https://marketplace.stripe.com/oauth/v2/chnlink_fixture/authorize?client_id=ca_fixture",
  STRIPE_REVENUE_REVIEW_ACCESS: JSON.stringify([{ user_id: reviewer, app_id: app,
    expires_at: new Date(Date.now() + 86400_000).toISOString() }]),
};
const source = readFileSync("supabase/functions/rocket-stripe-revenue/index.ts", "utf8")
  .replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(options: { user?: string; revoked?: boolean; expired?: boolean; callback?: boolean } = {}) {
  const user = options.user || reviewer;
  const settings = { ...env, ...(options.expired ? { STRIPE_REVENUE_REVIEW_ACCESS: "[]" } : {}) };
  const inserts: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string) => ({ data: name === "consume_app_revenue_oauth_state"
    ? (options.callback ? [{ app_id: app, user_id: reviewer }] : []) : null, error: null }));
  function from(table: string) {
    const filters: Record<string, unknown> = {};
    let inserted = false;
    const result = () => {
      if (inserted) return { data: table === "app_revenue_connections" ? { id: "connection-fixture" } : null, error: null };
      if (table === "app_owners") {
        const ownerRows = options.revoked ? [] : [{ app_id: app, verification_level: "domain_verified" },
          { app_id: unrelated, verification_level: "domain_verified" }];
        return { data: filters.app_id ? ownerRows.find((row) => row.app_id === filters.app_id) || null : ownerRows, error: null };
      }
      if (table === "public_apps") return { data: filters.id
        ? { id: filters.id, canonical_host: "controlled.example" }
        : [{ id: app, name: "Controlled app", logo_url: null }], error: null };
      if (table === "app_revenue_bindings") return { data: { connection_id: "connection-fixture", owner_user_id: user,
        mapping_version: 1, visibility: "private" }, error: null };
      if (table === "app_revenue_connections") return { data: { id: "connection-fixture", owner_user_id: user,
        provider: "stripe", status: "active", livemode: true, external_account_id: "acct_reviewfixture" }, error: null };
      return { data: [], error: null };
    };
    const chain = {
      select: () => chain, eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      is: () => chain, in: (_key: string, value: string[]) => { expect(value).toEqual([app]); return chain; },
      insert: (row: Record<string, unknown>) => { inserted = true; inserts.push(row); return chain; },
      upsert: (row: Record<string, unknown>) => { inserted = true; inserts.push(row); return chain; },
      maybeSingle: async () => result(), single: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  }
  const service = { from, rpc };
  const auth = { auth: { getUser: async (token: string) => ({ data: { user: token === "valid-session" ? { id: user } : null }, error: null }) } };
  const request = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/v1/account")
    ? { id: oauth.REVENUE_PUBLISHER_ACCOUNT } : { livemode: true, scope: "stripe_apps",
      stripe_user_id: "acct_reviewfixture", access_token: "fixture-access", refresh_token: "fixture-refresh" }),
  { status: 200, headers: { "Content-Type": "application/json" } }));
  let handler!: (request: Request) => Promise<Response>;
  const globals = { ...oauth, ...mrr,
    verifyRevenuePublisher: (key: string) => oauth.verifyRevenuePublisher(key, request as typeof fetch),
    createClient: (_url: string, key: string) => key === "service-fixture" ? service : auth,
    Deno: { env: { get: (name: string) => settings[name as keyof typeof settings] },
      serve: (callback: typeof handler) => { handler = callback; } }, fetch: request };
  new Function(...Object.keys(globals), compiled)(...Object.values(globals));
  const post = (action: string, appId = app, extra: Record<string, unknown> = {}) => handler(new Request(
    `${env.SUPABASE_URL}/functions/v1/rocket-stripe-revenue`, { method: "POST",
      headers: { Authorization: "Bearer valid-session", "Content-Type": "application/json" },
      body: JSON.stringify({ action, app_id: appId, ...extra }) }));
  return { handler, post, inserts, request, rpc };
}

describe("deployed revenue handler review authorization", () => {
  it("allows only the exact enrolled user/app pair and stores a hashed expiring state", async () => {
    const run = fixture();
    const response = await run.post("start");
    expect(response.status).toBe(200);
    const url = new URL((await response.json()).authorization_url);
    expect(url.origin + url.pathname).toBe("https://marketplace.stripe.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe("ca_registeredfixture");
    expect(url.searchParams.get("redirect_uri")).toBe(oauth.REVENUE_REDIRECT_URI);
    expect(run.inserts[0]).toMatchObject({ app_id: app, user_id: reviewer });
    expect(run.inserts[0].state_hash).not.toBe(url.searchParams.get("state"));
    expect(Date.parse(String(run.inserts[0].expires_at)) - Date.now()).toBeGreaterThan(590_000);
  });
  it.each([{ user: other }, { expired: true }])("rejects unenrolled or expired review access", async (options) => {
    const run = fixture(options);
    expect((await run.post("start")).status).toBe(503);
    expect(run.inserts).toEqual([]);
    expect(run.request).not.toHaveBeenCalled();
  });
  it("does not trust a user ID supplied in the request body", async () => {
    const run = fixture({ user: other });
    expect((await run.post("start", app, { user_id: reviewer })).status).toBe(503);
  });
  it("rechecks domain ownership even for an enrolled reviewer", async () => {
    const run = fixture({ revoked: true });
    expect((await run.post("start")).status).toBe(403);
    expect(run.request).not.toHaveBeenCalled();
  });
  it("keeps unrelated apps gated and the original external-test pilot available", async () => {
    const run = fixture();
    expect((await run.post("start", unrelated)).status).toBe(503);
    const test = await run.post("start", unrelated, { installation: "external_test" });
    expect(test.status).toBe(200);
    expect(new URL((await test.json()).authorization_url).pathname).toBe("/oauth/v2/chnlink_fixture/authorize");
    expect((await run.post("start", app, { installation: "external_test" })).status).toBe(503);
  });
  it("returns only the authorized controlled app at the installation entry", async () => {
    expect(await (await fixture().post("installation_apps")).json()).toMatchObject({ apps: [{ app_id: app }] });
    expect(await (await fixture({ user: other }).post("installation_apps")).json()).toEqual({ apps: [] });
  });
  it("rejects public visibility for a review-only connection", async () => {
    expect((await fixture().post("set_visibility", app, { visibility: "exact" })).status).toBe(403);
  });
  it("requires an authenticated session", async () => {
    const run = fixture();
    const response = await run.handler(new Request(env.SUPABASE_URL, { method: "POST", body: JSON.stringify({ action: "start", app_id: app }) }));
    expect(response.status).toBe(401);
  });
  it("rejects unknown/replayed callback state before making a Stripe request", async () => {
    const run = fixture();
    expect((await run.handler(new Request(`${oauth.REVENUE_REDIRECT_URI}?code=fixture&state=${oauth.createRevenueOAuthState("live")}`))).status).toBe(400);
    expect(run.request).not.toHaveBeenCalled();
  });
  it("rechecks review access and ownership at callback", async () => {
    for (const options of [{ expired: true }, { revoked: true }]) {
      const run = fixture({ ...options, callback: true });
      await run.handler(new Request(`${oauth.REVENUE_REDIRECT_URI}?code=fixture&state=${oauth.createRevenueOAuthState("live")}`));
      expect(run.request).not.toHaveBeenCalled();
      expect(run.inserts).toEqual([]);
    }
  });
  it("exchanges a valid review callback, encrypts tokens and uses the existing binding RPC", async () => {
    const run = fixture({ callback: true });
    const response = await run.handler(new Request(`${oauth.REVENUE_REDIRECT_URI}?code=fixture&state=${oauth.createRevenueOAuthState("live")}`));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://tryrocket.ai/my-apps/${app}/revenue`);
    expect(run.inserts[0]).toMatchObject({ owner_user_id: reviewer, livemode: true });
    expect(run.inserts[0].access_token_ciphertext).not.toBe("fixture-access");
    expect(run.rpc).toHaveBeenCalledWith("bind_app_revenue_connection", { p_app_id: app, p_connection_id: "connection-fixture", p_user_id: reviewer });
  });
});

describe("review configuration fails closed", () => {
  it("does not authorize malformed or excessive-duration grants", () => {
    for (const value of ["broken", "{}", JSON.stringify([{ user_id: reviewer, app_id: app, expires_at: "2099-01-01" }])]) {
      expect(oauth.revenueReviewAuthorized((name) => name === "STRIPE_REVENUE_REVIEW_ACCESS" ? value : undefined, { userId: reviewer, appId: app })).toBe(false);
    }
  });
  it("rejects publisher and Rocket payments accounts as revenue sources", () => {
    expect(() => oauth.validateRevenueSourceAccount("acct_1TfvwfL9pkHWyRRu")).toThrow();
    expect(() => oauth.validateRevenueSourceAccount(oauth.REVENUE_PUBLISHER_ACCOUNT)).toThrow();
  });
  it("verifies publisher credentials using only the account identity endpoint", async () => {
    const request = vi.fn(async (_url: string) => new Response(JSON.stringify({ id: "acct_wrong" })));
    await expect(oauth.verifyRevenuePublisher("sk_live_fixture", request)).rejects.toThrow("publisher credential");
    expect(request.mock.calls[0][0]).toBe("https://api.stripe.com/v1/account");
  });
});
