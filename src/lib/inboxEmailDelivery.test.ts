import { afterEach, expect, it, vi } from "vitest";
import { deliverInboxEmail } from "../../supabase/functions/send-email/inbox-email";

const id = "11111111-1111-1111-1111-111111111111";
const token = "a".repeat(64);
afterEach(() => vi.unstubAllGlobals());

it("sends one content-free notification with escaped public labels and a conversation link", async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data: {
    recipient: "buyer@example.test", sender_name: "<script>alert(1)</script>", app_name: "<App>", conversation_id: id,
  }, error: null }).mockResolvedValueOnce({ data: null, error: null });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "resend-1" }) });
  vi.stubGlobal("fetch", fetchMock);
  const result = await deliverInboxEmail({ rpc } as any, { event_id: id, dispatch_token: token }, "key", "Rocket <hello@tryrocket.ai>",
    ({ bodyHtml, ctaUrl }) => `${bodyHtml}<a href="${ctaUrl}">View</a>`);
  expect(result.status).toBe(200);
  const [, options] = fetchMock.mock.calls[0];
  const payload = JSON.parse(options.body);
  expect(payload.to).toEqual(["buyer@example.test"]);
  expect(payload.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(payload.html).toContain("&lt;App&gt;");
  expect(payload.html).toContain(`/inbox?conversation=${id}`);
  expect(payload.html).not.toContain("private message body");
  expect(options.headers["Idempotency-Key"]).toBe(`rocket-inbox-${id}`);
  expect(rpc).toHaveBeenLastCalledWith("finish_rocket_inbox_email", expect.objectContaining({ p_resend_id: "resend-1" }));
});

it("does not call Resend when a notification is suppressed", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const result = await deliverInboxEmail({ rpc } as any, { event_id: id, dispatch_token: token }, "key", "Rocket <hello@tryrocket.ai>", () => "");
  expect(result.body).toEqual({ skipped: true });
  expect(fetchMock).not.toHaveBeenCalled();
});
