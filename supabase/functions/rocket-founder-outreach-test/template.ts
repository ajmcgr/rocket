import { renderEmail } from "../send-email/layout.ts";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
const cleanLine = (value: string) => value.replace(/\p{Cc}+/gu, " ").trim();

export function claimInvitationEmail(input: {
  appName: string;
  developerName?: string | null;
  claimUrl: string;
  listingUrl: string;
  unsubscribeUrl: string;
  postalAddress: string;
}) {
  const appName = cleanLine(input.appName);
  const developerName = cleanLine(input.developerName || "");
  const greeting = developerName ? `Hi ${developerName},` : "Hi,";
  const subject = `Your app, ${appName}, is now on Rocket 🚀`;
  const preheader =
    "Claim your app and start building your developer reputation.";
  const benefits = [
    "Take ownership of your listing.",
    "Build your verified developer profile.",
    "Showcase your apps and achievements.",
    "Reach new users and potential customers.",
  ];
  return {
    subject,
    preheader,
    text: `${preheader}\n\nYour app is on Rocket.\n\n${greeting}\n\nYour app, ${appName}, is now listed on Rocket.\n\nRocket is the open app platform where developers get discovered, build their reputation and grow what they create.\n\nClaim your app to:\n\n${benefits.map((benefit) => `• ${benefit}`).join("\n")}\n\nClaim Your App → ${input.claimUrl}\n\nIt's completely free and only takes a few minutes.\n\nView your listing: ${input.listingUrl}\n\nYour app is already live. Now make it yours.\n\nAlex MacGregor\nFounder, Rocket\n\nYou're receiving this because your app is listed on Rocket.\n${input.postalAddress}\n\nUnsubscribe from Rocket founder invitations: ${input.unsubscribeUrl}`,
    html: renderEmail({
      preheader,
      title: "Your app is on Rocket.",
      bodyHtml: `<p>${escapeHtml(greeting)}</p><p>Your app, <strong>${escapeHtml(appName)}</strong>, is now listed on Rocket.</p><p>Rocket is the open app platform where developers get discovered, build their reputation and grow what they create.</p><p>Claim your app to:</p><ul style="margin:16px 0;padding-left:22px;">${benefits.map((benefit) => `<li style="margin:8px 0;">${benefit}</li>`).join("")}</ul>`,
      ctaLabel: "Claim Your App →",
      ctaUrl: escapeHtml(input.claimUrl),
      afterCtaHtml: `<p style="margin:12px 0;font-size:13px;">It's completely free and only takes a few minutes.</p><p style="margin:12px 0 24px;font-size:13px;"><a href="${escapeHtml(input.listingUrl)}" style="color:#00598a;text-decoration:underline;">View your listing</a></p><p>Your app is already live. Now make it yours.</p><p>Alex MacGregor<br>Founder, Rocket</p>`,
      footer: `You're receiving this because your app is listed on Rocket.<br><br>${escapeHtml(input.postalAddress).replace(/\r?\n/g, "<br>")}<br><br><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#00598a;text-decoration:underline;">Unsubscribe from Rocket founder invitations</a>`,
    }),
  };
}
