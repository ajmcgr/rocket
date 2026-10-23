import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deliverSharingEmail,
  sharingEmailContent,
} from "../../supabase/functions/send-email/sharing-email";
import { renderEmail } from "../../supabase/functions/send-email/layout";

const id = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(64);
afterEach(() => vi.unstubAllGlobals());

describe("sharing email outbox", () => {
  it.each(["app_saved", "app_collected"] as const)(
    "renders a private, branded %s notification with text and safe dynamic names",
    async (kind) => {
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            id,
            recipient: "owner@example.com",
            kind,
            context: {
              app_name: '<img src=x onerror="alert(1)"> & App\r\nInjected',
              app_slug: "my-app",
              actor_email: "private@example.com",
              collection_name: "Private collection",
              collection_url: "https://example.com/private",
            },
          },
          error: null,
        })
        .mockResolvedValue({ data: null, error: null });
      const fetch = vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ id: "resend-activity" }),
        });
      vi.stubGlobal("fetch", fetch);
      const result = await deliverSharingEmail(
        { rpc },
        {
          event_id: id,
          dispatch_token: token,
          recipient: "attacker@example.com",
        } as any,
        "key",
        "from",
        renderEmail,
      );
      expect(result.status).toBe(200);
      const message = JSON.parse(fetch.mock.calls[0][1].body);
      expect(message.to).toEqual(["owner@example.com"]);
      expect(message.html).toContain("rocket-email-logo.png");
      expect(message.html).toContain("&lt;img");
      expect(message.html).not.toContain("<img src=x");
      expect(message.subject).not.toMatch(/[\r\n]/);
      for (const text of [message.html, message.text]) {
        expect(text).toContain("https://tryrocket.ai/apps/my-app");
        expect(text).toContain("https://tryrocket.ai/settings/notifications");
        expect(text).not.toContain("private@example.com");
        expect(text).not.toContain("Private collection");
        expect(text).not.toContain("https://example.com/private");
      }
      expect(message.text).toContain(
        kind === "app_saved" ? "Someone saved" : "Someone added",
      );
    },
  );
  it("retries failed activity emails with the existing outbox", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id,
          recipient: "owner@example.com",
          kind: "app_saved",
          context: { app_name: "App", app_slug: "app" },
        },
        error: null,
      })
      .mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("SECRET")));
    expect(
      (
        await deliverSharingEmail(
          { rpc },
          { event_id: id, dispatch_token: token },
          "key",
          "from",
          renderEmail,
        )
      ).status,
    ).toBe(503);
    expect(rpc).toHaveBeenCalledWith(
      "finish_sharing_email",
      expect.objectContaining({
        p_resend_id: null,
        p_error: "Delivery failed; scheduled retry",
      }),
    );
  });
  it("escapes app data and links only to its Rocket listing", () => {
    const content = sharingEmailContent({
      id,
      recipient: "owner@example.com",
      kind: "published",
      context: { app_name: "<Launch>", app_slug: "launch" },
    });
    expect(content.bodyHtml).toContain("&lt;Launch&gt;");
    expect(content.bodyHtml).not.toContain("<Launch>");
    expect(content.ctaUrl).toContain("/apps/launch");
  });
  it("does not share a private claimed listing", () => {
    const content = sharingEmailContent({
      id,
      recipient: "owner@example.com",
      kind: "claimed",
      context: { app_name: "Private", app_slug: "private", is_public: false },
    });
    expect(content.bodyHtml).not.toContain("Share your app");
    expect(content.ctaLabel).toBe("Manage app");
  });
  it("keeps monthly recap email private and links to the owner view", () => {
    const content = sharingEmailContent({
      id,
      recipient: "owner@example.com",
      kind: "recap",
      context: { month: "2026-10-01" },
    });
    expect(content.title).toBe("Your October 2026 Rocket Recap is ready");
    expect(content.bodyHtml).toContain("private until you choose to share");
    expect(content.ctaUrl).toBe("https://tryrocket.ai/recap");
    expect(() =>
      sharingEmailContent({
        id,
        recipient: "owner@example.com",
        kind: "recap",
        context: { month: "<script>" },
      }),
    ).toThrow();
  });
  it("rejects a caller without a valid leased capability", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await deliverSharingEmail(
          { rpc },
          { event_id: id, dispatch_token: token },
          "key",
          "from",
          () => "html",
        )
      ).status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends once with a stable provider idempotency key", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id,
          recipient: "owner@example.com",
          kind: "published",
          context: { app_name: "Launch", app_slug: "launch" },
        },
        error: null,
      })
      .mockResolvedValue({ data: null, error: null });
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "resend-1" }) });
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await deliverSharingEmail(
          { rpc },
          { event_id: id, dispatch_token: token },
          "key",
          "from",
          () => "html",
        )
      ).status,
    ).toBe(200);
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      `rocket-sharing/${id}`,
    );
    expect(rpc).toHaveBeenCalledWith(
      "finish_sharing_email",
      expect.objectContaining({ p_resend_id: "resend-1" }),
    );
  });
});
