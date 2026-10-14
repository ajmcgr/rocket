import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type EmailEvent = {
  type: string;
  created_at: string;
  data: { email_id: string; tags?: Record<string, string> };
};

function harness(event: EmailEvent, matched = false, validSignature = true) {
  let handler!: (request: Request) => Promise<Response>;
  const rpc = vi.fn(async () => ({ data: matched, error: null }));
  class ResendMock {
    webhooks = {
      verify: () => {
        if (!validSignature) throw new Error("Invalid signature");
        return event;
      },
    };
  }
  runInNewContext(ts.transpileModule(
    readFileSync("supabase/functions/rocket-founder-resend-webhook/index.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText, {
    exports: {}, Request, Response, Set,
    require: (name: string) => name.startsWith("npm:resend")
      ? { Resend: ResendMock } : { createClient: () => ({ rpc }) },
    Deno: {
      env: { get: (name: string) => ({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service_mock",
        ROCKET_OUTREACH_RESEND_WEBHOOK_SECRET: "whsec_mock",
        RESEND_API_KEY: "re_mock",
      })[name as "SUPABASE_URL"] },
      serve: (fn: typeof handler) => { handler = fn; },
    },
  });
  const request = () => handler(new Request("https://example.com/rocket-founder-resend-webhook", {
    method: "POST",
    headers: {
      "svix-id": "msg_123", "svix-timestamp": "123", "svix-signature": "v1=mock",
    },
    body: "{}",
  }));
  return { request, rpc };
}

const launchEvent: EmailEvent = {
  type: "email.delivered",
  created_at: "2026-10-14T00:00:00Z",
  data: { email_id: "email_launch" },
};

describe("founder Resend webhook on a shared Resend account", () => {
  it("acknowledges an unrelated email without creating an outreach record", async () => {
    const { request, rpc } = harness(launchEvent);
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true, reason: "not founder outreach" });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("retries a tagged founder event until the send attempt exists", async () => {
    const { request } = harness({
      ...launchEvent,
      data: { email_id: "email_outreach", tags: { category: "rocket_founder_outreach" } },
    });
    expect((await request()).status).toBe(503);
  });

  it("records a matched outreach event regardless of tags", async () => {
    const { request, rpc } = harness(launchEvent, true);
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, matched_outreach: true });
    expect(rpc).toHaveBeenCalledWith("rocket_outreach_record_resend_event", expect.objectContaining({
      p_provider_email_id: "email_launch",
    }));
  });

  it("rejects an invalid webhook signature before recording", async () => {
    const { request, rpc } = harness(launchEvent, false, false);
    expect((await request()).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
