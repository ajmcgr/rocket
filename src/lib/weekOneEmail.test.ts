import { describe, expect, it } from "vitest";
import { sharingEmailContent } from "../../supabase/functions/send-email/sharing-email";

const token = "a".repeat(64);
const appId = "c43f055a-c131-48f2-abd8-574ee4379426";
const job = (context: Record<string, unknown>) => ({
  id: appId,
  recipient: "developer@example.com",
  kind: "week_one" as const,
  context: { unsubscribe_token: token, ...context },
});

describe("one-week Rocket follow-up", () => {
  it("links verified owners to settings without revealing revenue", () => {
    const email = sharingEmailContent(job({ app_id: appId, app_name: "Test <App>", verification_level: "domain_verified" }));
    expect(email.ctaUrl).toContain(`/my-apps/${appId}/analytics`);
    expect(email.bodyHtml).toContain("Test &lt;App&gt;");
    expect(email.bodyHtml).not.toContain("Test <App>");
    expect(email.text).toContain(`/email/unsubscribe?token=${token}`);
    expect(email.bodyHtml).toContain(`/my-apps/${appId}/revenue`);
    expect(email.text).toContain(`/my-apps/${appId}/revenue`);
    expect(email.bodyHtml).toContain("optional");
    expect(email.bodyHtml).toContain("Featured App and Category Sponsor");
    expect(email.bodyHtml).toContain("/advertise?utm_source=rocket&amp;");
    expect(email.text).toContain("/advertise?utm_source=rocket&");
  });

  it("links other owners to their apps", () => {
    const email = sharingEmailContent(job({ app_id: appId, app_name: "Test App", verification_level: "claimed" }));
    expect(email.ctaUrl).toContain("/my-apps?");
    expect(email.ctaLabel).toBe("Manage my app");
    expect(email.bodyHtml).toContain("Featured App and Category Sponsor");
    expect(email.text).toContain("/advertise?utm_source=rocket&");
  });

  it("links explorers to Discover and requires an unsubscribe token", () => {
    const email = sharingEmailContent(job({}));
    expect(email.ctaUrl).toContain("/discover?");
    expect(email.bodyHtml).not.toContain("Featured App and Category Sponsor");
    expect(() => sharingEmailContent(job({ unsubscribe_token: "bad" }))).toThrow("Invalid unsubscribe token");
  });
});
