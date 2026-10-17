import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { claimInvitationEmail } from "../../supabase/functions/rocket-founder-outreach-test/template";
import { renderEmail } from "../../supabase/functions/send-email/layout";

const appId = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(64);
const unsubscribeToken = "b".repeat(64);
const input = {
  appName: "Bio",
  developerName: "Alex",
  claimUrl: `https://tryrocket.ai/claim-invitation?token=${token}&app=${appId}`,
  listingUrl: "https://tryrocket.ai/apps/bio",
  unsubscribeUrl: `https://tryrocket.ai/outreach/unsubscribe?token=${unsubscribeToken}`,
  postalAddress: "Example sender address\nExample city",
};
const documentFor = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");

describe("branded founder claim invitation", () => {
  it("preserves the existing transactional layout byte-for-byte when no extra content is supplied", () => {
    const html = renderEmail({
      preheader: "Test preview",
      title: "Test title",
      bodyHtml: "<p>Existing transactional content.</p>",
      ctaLabel: "Open Rocket",
      ctaUrl: "https://tryrocket.ai/your-apps",
      footer: "Existing footer.",
    });
    expect(createHash("sha256").update(html).digest("hex")).toBe(
      "ef03b30feb94e5cfac01224d2d02b062aab7868cc102085370c6c76c88845bf5",
    );
  });
  it("uses the requested subject, hidden preheader, branding and primary app-specific CTA", () => {
    const email = claimInvitationEmail(input);
    const doc = documentFor(email.html);
    expect(email.subject).toBe("Your app, Bio, is now on Rocket 🚀");
    expect(email.preheader).toBe(
      "Claim your app and start building your developer reputation.",
    );
    expect(doc.querySelector('div[style*="display:none"]')?.textContent).toBe(
      email.preheader,
    );
    expect(doc.querySelector("h1")?.textContent).toBe("Your app is on Rocket.");
    expect(doc.querySelector('img[alt="Rocket"]')?.getAttribute("src")).toBe(
      "https://tryrocket.ai/rocket-email-logo.png",
    );
    expect(doc.querySelector('meta[name="viewport"]')).toBeTruthy();
    expect(email.html).toContain("max-width:560px;width:100%");
    const primary = Array.from(doc.querySelectorAll("a")).find(
      (a) => a.textContent === "Claim Your App →",
    )!;
    const secondary = Array.from(doc.querySelectorAll("a")).find(
      (a) => a.textContent === "View your listing",
    )!;
    expect(primary.href).toBe(input.claimUrl);
    expect(primary.getAttribute("style")).toContain("background:#167ac6");
    expect(
      primary.compareDocumentPosition(secondary) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(secondary.href).toBe(input.listingUrl);
    expect(secondary.getAttribute("style")).not.toContain("background:");
    expect(doc.querySelectorAll("li")).toHaveLength(4);
    expect(doc.body.textContent).toContain("Hi Alex,");
    expect(doc.body.textContent).toContain("Alex MacGregor");
    expect(doc.body.textContent).toContain(input.postalAddress.split("\n")[0]);
    expect(doc.querySelector(`a[href="${input.unsubscribeUrl}"]`)).toBeTruthy();
    for (const text of [
      input.claimUrl,
      input.listingUrl,
      input.unsubscribeUrl,
      "It's completely free and only takes a few minutes.",
    ])
      expect(email.text).toContain(text);
  });
  it.each([undefined, null, "", "   "])(
    "uses Hi, when developer name is absent (%s)",
    (developerName) => {
      const email = claimInvitationEmail({ ...input, developerName });
      expect(documentFor(email.html).querySelector("p")?.textContent).toBe(
        "Hi,",
      );
      expect(email.text).toContain("\n\nHi,\n\n");
      expect(email.html).not.toMatch(/Hi (undefined|null|,)/);
    },
  );
  it("escapes dynamic names and addresses without breaking the token links or subject", () => {
    const email = claimInvitationEmail({
      ...input,
      appName: '<img src=x onerror="bad()"> & Co\r\nBcc: bad',
      developerName: "<script>bad()</script>",
      postalAddress: "<b>Address</b>",
    });
    const doc = documentFor(email.html);
    expect(doc.querySelectorAll("script,[onerror]")).toHaveLength(0);
    expect(doc.querySelectorAll("img")).toHaveLength(1);
    expect(doc.body.textContent).toContain("<script>bad()</script>");
    expect(doc.body.textContent).toContain("<b>Address</b>");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(
      Array.from(doc.querySelectorAll("a")).find(
        (a) => a.textContent === "Claim Your App →",
      )?.href,
    ).toBe(input.claimUrl);
  });
});

describe("outreach sender uses the branded template without changing delivery gates", () => {
  it("sends both formats to the allowlisted test address and preserves generated tokens", async () => {
    let handler!: (req: Request) => Promise<Response>;
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "resend-test-id" }), { status: 200 }),
      );
    const query = (data: unknown) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data, error: null }) }),
      }),
    });
    const user = {
      auth: {
        getUser: async () => ({ data: { user: { id: "admin" } }, error: null }),
      },
      rpc: async (name: string) => ({
        data:
          name === "is_rocket_admin"
            ? true
            : { claim_token: token, unsubscribe_token: unsubscribeToken },
        error: null,
      }),
      from: () => query({ name: input.appName, slug: "bio" }),
    };
    const admin = {
      from: (name: string) =>
        query(
          name === "rocket_outreach_control"
            ? { paused: true, send_mode: "test", production_authorized: false }
            : {
                id: "queue",
                app_id: appId,
                recipient_email: "alex@alexmacgregor.com",
                founder_first_name: "Alex",
                status: "eligible",
              },
        ),
      rpc: vi.fn(async (name: string) => ({
        data:
          name === "rocket_outreach_reserve_test_send"
            ? {
                recipient_email: "alex@alexmacgregor.com",
                idempotency_key: "one-test-key",
                attempt_id: "attempt",
              }
            : true,
        error: null,
      })),
    };
    const env: Record<string, string> = {
      SUPABASE_URL: "https://example.com",
      SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      RESEND_API_KEY: "mock-only",
      ROCKET_OUTREACH_TEST_EMAIL: "alex@alexmacgregor.com",
      ROCKET_OUTREACH_POSTAL_ADDRESS: input.postalAddress,
    };
    runInNewContext(
      ts.transpileModule(
        readFileSync(
          "supabase/functions/rocket-founder-outreach-test/index.ts",
          "utf8",
        ),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
          },
        },
      ).outputText,
      {
        exports: {},
        Request,
        Response,
        AbortSignal: { timeout: () => undefined },
        fetch,
        Deno: {
          env: { get: (key: string) => env[key] },
          serve: (fn: typeof handler) => {
            handler = fn;
          },
        },
        require: (name: string) =>
          name === "./template.ts"
            ? { claimInvitationEmail }
            : {
                createClient: (_url: string, key: string) =>
                  key === "anon" ? user : admin,
              },
      },
    );
    const response = await handler(
      new Request("https://example.com", {
        method: "POST",
        headers: { Authorization: "Bearer test-user" },
        body: JSON.stringify({ queue_id: appId }),
      }),
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.to).toEqual(["alex@alexmacgregor.com"]);
    expect(payload.from).toBe("Alex from Rocket <alex@tryrocket.ai>");
    expect(payload.subject).toBe(claimInvitationEmail(input).subject);
    expect(payload.html).toBe(claimInvitationEmail(input).html);
    expect(payload.text).toBe(claimInvitationEmail(input).text);
    expect(payload.headers["List-Unsubscribe"]).toBe(
      `<${input.unsubscribeUrl}>`,
    );
    expect(admin.rpc.mock.calls.map(([name]) => name)).toEqual([
      "rocket_outreach_reserve_test_send",
      "rocket_outreach_finish_test_send",
    ]);
  });
});
