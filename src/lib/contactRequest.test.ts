import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { validateContactMessage } from "../../supabase/functions/_shared/contactValidation";

type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
const send = vi.fn();

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: { get: (key: string) => key === "RESEND_API_KEY" ? "test-only-key" : undefined },
    serve: (callback: Handler) => { handler = callback; },
  });
  vi.stubGlobal("fetch", send);
  await import("../../supabase/functions/contact-request/index");
});

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(new Response(JSON.stringify({ id: "test-id" }), { status: 200 }));
});

const request = (body: unknown, ip = "192.0.2.1") => new Request("https://example.supabase.co/functions/v1/contact-request", {
  method: "POST",
  headers: { Origin: "https://tryrocket.ai", "Content-Type": "application/json", "x-forwarded-for": ip },
  body: JSON.stringify(body),
});

const valid = { name: "Alex", email: "alex@example.com", topic: "General question", message: "I have a question about Rocket." };

describe("Rocket contact requests", () => {
  it("validates fields and rejects unsupported topics", () => {
    expect(validateContactMessage(valid)).toMatchObject(valid);
    expect(validateContactMessage({ ...valid, topic: "Send money" })).toBeNull();
    expect(validateContactMessage({ ...valid, message: "short" })).toBeNull();
    expect(validateContactMessage({ ...valid, email: "not-an-email" })).toBeNull();
  });

  it("rejects invalid data without sending", async () => {
    const response = await handler(request({ ...valid, message: "short" }));
    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("accepts honeypot submissions without sending", async () => {
    const response = await handler(request({ ...valid, website: "https://spam.example" }));
    expect(response.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends validated text through Resend to Rocket only", async () => {
    const response = await handler(request(valid, "192.0.2.2"));
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    const [url, options] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(String(options.body));
    expect(payload.to).toEqual(["alex@tryrocket.ai"]);
    expect(payload.reply_to).toBe(valid.email);
    expect(payload.text).toContain(valid.message);
    expect(payload.html).toBeUndefined();
  });

  it("limits repeated messages from the same sender", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await handler(request(valid, "192.0.2.3"))).status).toBe(200);
    }
    expect((await handler(request(valid, "192.0.2.3"))).status).toBe(429);
    expect(send).toHaveBeenCalledTimes(3);
  });
});
