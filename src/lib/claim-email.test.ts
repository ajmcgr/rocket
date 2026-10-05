import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimEmailContent,
  deliverClaimEmail,
} from "../../supabase/functions/send-email/claim-email";

const context = {
  app_name: "<Test>",
  app_url: "https://example.com",
  claim_id: "00000000-0000-4000-8000-000000000001",
  user_id: "requester",
  requester_email: "owner@example.com",
  requested_at: "2026-10-05",
  evidence_available: true,
  method: "manual_review",
  owner_conflict: true,
  token: "SECRET",
  evidence: "API KEY SECRET",
  review_reason: "rocket-verification=SECRET",
};
const input = { event_id: context.claim_id, dispatch_token: "a".repeat(64) };
afterEach(() => vi.unstubAllGlobals());
describe("claim emails", () => {
  it("escapes text, uses a secured Ops deep link and excludes free text/tokens", () => {
    const content = claimEmailContent("admin_request", context);
    expect(content.bodyHtml).toContain("&lt;Test&gt;");
    expect(content.bodyHtml).toContain("owner@example.com");
    expect(content.bodyHtml).not.toContain("SECRET");
    expect(content.ctaUrl).toContain(
      `/admin/ops?claim=${context.claim_id}#claim-`,
    );
  });
  it("does not call the database or Resend for malformed capabilities", async () => {
    const rpc = vi.fn();
    expect(
      (await deliverClaimEmail({ rpc }, {}, "key", "from", () => "html"))
        .status,
    ).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("cannot send without a valid server-side lease", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(
      (await deliverClaimEmail({ rpc }, input, "key", "from", () => "html"))
        .status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses only the DB recipient and a stable Resend idempotency key", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id: input.event_id,
          recipient: "authorized@example.com",
          kind: "approved",
          context,
        },
        error: null,
      })
      .mockResolvedValue({ error: null });
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "resend-id" }),
      });
    vi.stubGlobal("fetch", fetch);
    const result = await deliverClaimEmail(
      { rpc },
      { ...input, recipient: "attacker@example.com" },
      "key",
      "from",
      () => "html",
    );
    expect(result.status).toBe(200);
    expect(JSON.parse(fetch.mock.calls[0][1].body).to).toEqual([
      "authorized@example.com",
    ]);
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      `rocket-claim/${input.event_id}`,
    );
    expect(rpc.mock.calls[1][1].p_resend_id).toBe("resend-id");
  });
  it("queues retry without storing provider secrets on a Resend failure", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id: input.event_id,
          recipient: "authorized@example.com",
          kind: "rejected",
          context,
        },
        error: null,
      })
      .mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("SECRET")));
    expect(
      (await deliverClaimEmail({ rpc }, input, "key", "from", () => "html"))
        .status,
    ).toBe(503);
    expect(rpc.mock.calls[1][1].p_error).not.toContain("SECRET");
  });
});
