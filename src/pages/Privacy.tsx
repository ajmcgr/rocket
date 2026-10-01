import { Link } from "@/lib/router-compat";
import LegalPage from "@/components/LegalPage";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const Privacy = () => {
  useDocumentMeta({
    title: "Privacy Policy — Rocket",
    description: "How Rocket collects, uses and shares information across app discovery, creation tools, Rocket ID and Stripe Connect payments.",
    canonical: "https://tryrocket.ai/privacy",
  });

  return (
    <LegalPage title="Privacy Policy" summary="This policy explains the information Rocket uses to run the open app platform, developer tools and optional payment integrations.">
      <section>
        <h2>1. Scope and contact</h2>
        <p>Works App, Inc. operates Rocket at tryrocket.ai. This policy covers Rocket's website, accounts, app listings, creation tools, Rocket ID and Buy with Rocket where available. It does not cover an independent developer's app or Stripe's own services. For privacy questions or requests, use <Link to="/contact">Contact</Link> or email <a href="mailto:alex@tryrocket.ai">alex@tryrocket.ai</a>.</p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <ul>
          <li><strong>Account and profile:</strong> your email, name or handle, profile image, authentication provider, account identifiers and settings.</li>
          <li><strong>App and developer details:</strong> submitted descriptions, links, logos, screenshots, ownership evidence, verification status, integration settings and support messages. Public listing details may be visible to anyone.</li>
          <li><strong>Activity:</strong> searches, page views, saves, ratings, reviews, device and browser information, approximate location from IP address, cookies and similar identifiers, and security logs.</li>
          <li><strong>Creation and communications:</strong> prompts, uploaded images, generated assets, projects, contact requests and newsletter email addresses when you use those features.</li>
          <li><strong>Billing and payment status:</strong> Rocket plan, credit, invoice, checkout, subscription and entitlement records; Stripe customer and connected-account identifiers; and transaction status, amounts and fee records needed for support and reconciliation. Stripe collects and processes payment-card, bank and identity-verification details in its own payment and onboarding flows. Do not send that sensitive information through Rocket support forms.</li>
        </ul>
      </section>

      <section>
        <h2>3. Where information comes from</h2>
        <p>We receive information directly from you, from your use of Rocket, from an authentication provider you choose (such as Google, GitHub or X where enabled), from developers and public app sources used to create listings, and from service providers such as Stripe. A developer using Rocket ID may receive the identity and authorization information needed for the scopes you approve; that developer's own privacy policy then applies to its app.</p>
      </section>

      <section>
        <h2>4. How we use information</h2>
        <p>We use information to provide accounts and app discovery; publish and manage listings; verify claims; generate and save requested assets; authenticate users and connected apps; process subscriptions, payments and entitlements; respond to support; send opted-in newsletters; measure use and improve the service; prevent fraud and abuse; and meet legal, tax and accounting duties. Where privacy law requires a legal basis, these purposes rely on performance of our agreement, legitimate interests in operating and securing Rocket, legal obligations, or your consent for optional activities.</p>
      </section>

      <section>
        <h2>5. Stripe Connect and connected apps</h2>
        <p>If a developer enables Buy with Rocket, we exchange account and transaction information with Stripe to onboard the connected account, check whether it can accept payments, configure developer products and checkout, calculate Rocket's disclosed platform fee, and match payment events to app access. In the current direct-charge design, Stripe processes the buyer's payment on the developer's connected account; Rocket does not hold the funds. We may receive status, amounts, customer and account IDs, refunds and dispute events, but not full card numbers or bank credentials. Stripe's <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> explains Stripe's own processing.</p>
        <p>When you authorize Rocket ID for a developer's app, we share only the information and access covered by that authorization. The developer may separately process information in its app. Review that developer's terms and privacy policy before connecting or purchasing.</p>
      </section>

      <section>
        <h2>6. Who receives information</h2>
        <p>We share information as needed with hosting and database providers; payment and billing providers; email and newsletter delivery providers; analytics, translation and customer-support services; developers whose apps you connect to or buy; professional advisers; and authorities when required by law or necessary to protect rights and safety. Our site currently uses Supabase for accounts and data, Stripe for payments, Beehiiv for newsletter sign-ups, Google Analytics and Ahrefs for analytics, Crisp for chat, and Google Translate for translations. Providers may process data in other countries under their own terms and applicable safeguards. We do not disclose your private account data in public app listings unless you choose to publish it.</p>
      </section>

      <section>
        <h2>7. Cookies, analytics and communications</h2>
        <p>Rocket uses essential storage for sign-in, security, preferences and theme. Analytics and support providers may use cookies or similar technologies to measure visits and operate chat. Browser settings can limit some tracking, but essential functions may then stop working. If you subscribe to the newsletter, you can unsubscribe using the link in each message. Service and transaction messages are different from marketing and may still be sent when needed.</p>
      </section>

      <section>
        <h2>8. Retention, security and your choices</h2>
        <p>We keep information while your account or listing is active and for as long as reasonably needed for support, security, disputes, tax, accounting or other legal obligations. Retention varies by record; deletion of an account may not immediately remove public information already indexed elsewhere or records we must preserve. We use access controls and other reasonable safeguards, but no online service can guarantee absolute security.</p>
        <p>You may update account details, remove your own content where controls allow, unsubscribe from marketing, or ask to access, correct, export or delete personal information. Depending on your location, you may also object to or restrict some processing and complain to a data-protection authority. Contact us to make a request; we may need to verify your identity and may retain information where law permits or requires.</p>
      </section>

      <section>
        <h2>9. Children and changes</h2>
        <p>Rocket is not intended for children under 13, and we do not knowingly collect their personal information. If you believe a child has provided information, contact us. We may update this policy as the platform changes and will revise the date above and give additional notice where required.</p>
      </section>
    </LegalPage>
  );
};

export default Privacy;
