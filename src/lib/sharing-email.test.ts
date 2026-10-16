import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverSharingEmail, sharingEmailContent } from "../../supabase/functions/send-email/sharing-email";

const id = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(64);
afterEach(() => vi.unstubAllGlobals());

describe("sharing email outbox", () => {
  it("escapes app data and links only to its Rocket listing", () => {
    const content = sharingEmailContent({ id, recipient: "owner@example.com", kind: "published", context: { app_name: "<Launch>", app_slug: "launch" } });
    expect(content.bodyHtml).toContain("&lt;Launch&gt;");
    expect(content.bodyHtml).not.toContain("<Launch>");
    expect(content.ctaUrl).toContain("/apps/launch");
  });
  it("does not share a private claimed listing", () => {
    const content = sharingEmailContent({ id, recipient: "owner@example.com", kind: "claimed", context: { app_name: "Private", app_slug: "private", is_public: false } });
    expect(content.bodyHtml).not.toContain("Share your app");
    expect(content.ctaLabel).toBe("Manage app");
  });
  it("keeps monthly recap email private and links to the owner view", () => {
    const content = sharingEmailContent({ id, recipient: "owner@example.com", kind: "recap", context: { month: "2026-10-01" } });
    expect(content.title).toBe("Your October 2026 Rocket Recap is ready");
    expect(content.bodyHtml).toContain("private until you choose to share");
    expect(content.ctaUrl).toBe("https://tryrocket.ai/recap");
    expect(() => sharingEmailContent({ id, recipient: "owner@example.com", kind: "recap", context: { month: "<script>" } })).toThrow();
  });
  it("rejects a caller without a valid leased capability", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await deliverSharingEmail({ rpc }, { event_id: id, dispatch_token: token }, "key", "from", () => "html")).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends once with a stable provider idempotency key", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { id, recipient: "owner@example.com", kind: "published", context: { app_name: "Launch", app_slug: "launch" } }, error: null }).mockResolvedValue({ data: null, error: null });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "resend-1" }) });
    vi.stubGlobal("fetch", fetch);
    expect((await deliverSharingEmail({ rpc }, { event_id: id, dispatch_token: token }, "key", "from", () => "html")).status).toBe(200);
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(`rocket-sharing/${id}`);
    expect(rpc).toHaveBeenCalledWith("finish_sharing_email", expect.objectContaining({ p_resend_id: "resend-1" }));
  });
});
