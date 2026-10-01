import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

const secretBytes = new TextEncoder().encode("rocket-auth-hook-test-secret-32-bytes");
const secret = `v1,whsec_${btoa(String.fromCharCode(...secretBytes))}`;
let handler: (request: Request) => Promise<Response>;
const originalFetch = globalThis.fetch;

async function signedRequest(signatureOverride?: string) {
  const body = JSON.stringify({
    user: { email: "internal-test@example.com" },
    email_data: {
      token: "123456", token_hash: "test-hash", redirect_to: "https://tryrocket.ai/",
      email_action_type: "signup", site_url: "https://lcujmvdgczkjxdstzhnr.supabase.co",
    },
  });
  const id = "hook-test-1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const signature = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return new Request("https://example.com/functions/v1/auth-email-hook", {
    method: "POST", body,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signatureOverride ?? signature}`,
    },
  });
}

describe("auth-email-hook", () => {
  beforeAll(async () => {
    vi.stubGlobal("Deno", {
      env: { get: (key: string) => ({ RESEND_API_KEY: "test-key", SEND_EMAIL_HOOK_SECRET: secret }[key]) },
      serve: vi.fn(),
    });
    ({ handleAuthEmailHook: handler } = await import("../../supabase/functions/auth-email-hook/index"));
  });

  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterAll(() => { vi.stubGlobal("fetch", originalFetch); vi.unstubAllGlobals(); });

  it("rejects an invalid signature without sending", async () => {
    const response = await handler(await signedRequest("invalid"));
    expect(response.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns a retryable error when Resend fails", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("provider unavailable", { status: 503 }));
    const response = await handler(await signedRequest());
    expect(response.status).toBe(503);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("sends one email for a valid signed request", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await handler(await signedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
