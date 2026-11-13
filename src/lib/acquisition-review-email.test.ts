import { afterEach, describe, expect, it, vi } from "vitest";
import { acquisitionReviewEmailContent, deliverAcquisitionReviewEmail } from "../../supabase/functions/send-email/acquisition-review-email";

const input = { event_id: "00000000-0000-4000-8000-000000000001", dispatch_token: "a".repeat(64) };
const context = {
  app_name: "<Launch>", app_url: "https://example.com", seller_email: "seller@example.com",
  status: "for_sale", asking_price_cents: null, requested_at: "2026-11-13",
  description: "PRIVATE DESCRIPTION", review_reason: "PRIVATE REASON",
};
afterEach(() => vi.unstubAllGlobals());

describe("acquisition review emails", () => {
  it("uses the claim-review layout contract and excludes seller free text", () => {
    const email = acquisitionReviewEmailContent(context);
    expect(email.title).toBe("Acquisition listing review requested");
    expect(email.bodyHtml).toContain("&lt;Launch&gt;");
    expect(email.bodyHtml).toContain("Price on request");
    expect(email.bodyHtml).not.toContain("PRIVATE DESCRIPTION");
    expect(email.bodyHtml).not.toContain("PRIVATE REASON");
    expect(email.ctaUrl).toBe("https://tryrocket.ai/admin/ops");
  });
  it("rejects missing or malformed capabilities before touching the database", async () => {
    const rpc = vi.fn();
    expect((await deliverAcquisitionReviewEmail({ rpc }, {}, "key", "from", () => "html")).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires a server-side lease", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await deliverAcquisitionReviewEmail({ rpc }, input, "key", "from", () => "html")).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends to the queued recipient with a stable idempotency key", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { id: input.event_id, recipient: "admin@example.com", context }, error: null }).mockResolvedValue({ error: null });
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "resend-id" }) });
    vi.stubGlobal("fetch", fetch);
    expect((await deliverAcquisitionReviewEmail({ rpc }, { ...input, recipient: "attacker@example.com" }, "key", "from", () => "html")).status).toBe(200);
    expect(JSON.parse(fetch.mock.calls[0][1].body).to).toEqual(["admin@example.com"]);
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(`rocket-acquisition-review/${input.event_id}`);
    expect(rpc.mock.calls[1][1].p_resend_id).toBe("resend-id");
  });
  it("retries failures without persisting provider details", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { id: input.event_id, recipient: "admin@example.com", context }, error: null }).mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("SECRET")));
    expect((await deliverAcquisitionReviewEmail({ rpc }, input, "key", "from", () => "html")).status).toBe(503);
    expect(rpc.mock.calls[1][1].p_error).not.toContain("SECRET");
  });
});
