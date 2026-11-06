import { describe, expect, it } from "vitest";
import { sharingEmailContent } from "../../supabase/functions/send-email/sharing-email";

describe("weekly Resend email", () => {
  it("requires a valid unsubscribe token and keeps metrics private", () => {
    const token = "a".repeat(64);
    const email = sharingEmailContent({ id: "job", recipient: "user@example.com", kind: "weekly", context: { unsubscribe_token: token } });
    expect(email.footer).toContain(`/email/unsubscribe?kind=weekly&token=${token}`);
    expect(email.bodyHtml).toContain("metrics stay private");
    expect(email.ctaUrl).toContain("utm_campaign=weekly");
    expect(() => sharingEmailContent({ id: "job", recipient: "user@example.com", kind: "weekly", context: {} })).toThrow();
  });
});
