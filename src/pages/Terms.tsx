import { Link } from "@/lib/router-compat";
import LegalPage from "@/components/LegalPage";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const Terms = () => {
  useDocumentMeta({
    title: "Terms of Service — Rocket",
    description: "Terms for using Rocket's app discovery, creation, developer, identity and payment services.",
    canonical: "https://tryrocket.ai/terms",
  });

  return (
    <LegalPage title="Terms of Service" summary="These terms govern your use of Rocket, including app listings, creation tools, Rocket Developer, Rocket ID and any available Buy with Rocket checkout.">
      <section>
        <h2>1. Who we are and accepting these terms</h2>
        <p>Rocket is operated by Works App, Inc. ("Rocket", "we", "us"). By using tryrocket.ai or a Rocket service, you agree to these Terms and our <Link to="/privacy">Privacy Policy</Link>. If you use Rocket for a company or an app, you confirm that you may act for that business. If you do not agree, do not use the service. You must be old enough to enter a binding agreement where you live.</p>
      </section>

      <section>
        <h2>2. The platform</h2>
        <p>Rocket helps people discover apps and lets developers submit, claim and manage listings. We also offer creation tools and, where enabled, Rocket ID and Buy with Rocket. A listing, ranking, review, rating, verification label or link is not Rocket's endorsement or a guarantee of an app's quality, safety, ownership, performance or legality. Third-party apps have their own terms and privacy practices; review them before using or buying an app.</p>
        <p>Features may be experimental, limited by country or account, or unavailable. In particular, Buy with Rocket's Stripe Connect integration is currently a limited test-mode pilot, not a generally available live payment service. We will identify any live offering and its applicable price and terms before charging you.</p>
      </section>

      <section>
        <h2>3. Accounts and acceptable use</h2>
        <p>Keep your account details accurate, protect your credentials and notify us promptly of suspected misuse. You must not impersonate another person or app owner; submit false listings, reviews, ratings, sales or payment information; infringe intellectual-property or privacy rights; use Rocket for prohibited or unlawful products; attempt fraud, abuse, scraping or security testing without permission; or interfere with other users or the service. We may investigate, remove content, restrict features or suspend accounts where reasonably necessary to protect users, comply with law or enforce these Terms.</p>
      </section>

      <section>
        <h2>4. Listings, ownership and content</h2>
        <p>You retain rights in content you submit. You grant Rocket a non-exclusive, worldwide, royalty-free license to host, reproduce, adapt for display, translate and show that content and your app name, logo and screenshots to operate, promote and improve your Rocket listing and the service. You confirm you have the rights and permissions needed to provide it. You may request correction or removal through <Link to="/contact">Contact</Link>; some information may remain where law, security or legitimate records require it.</p>
        <p>Claiming a listing may require proof of ownership. A claim or verification badge confirms only the specific check stated; it is not a guarantee about the app or its developer. Rocket may correct inaccurate listings and remove unlawful or misleading content.</p>
      </section>

      <section>
        <h2>5. Rocket plans, credits and renewals</h2>
        <p>Free and paid features, prices, billing periods, credits and any trial conditions are shown on the <Link to="/pricing">Pricing page</Link> and at checkout. Paid subscriptions renew for the stated period unless cancelled before renewal. You can manage or cancel a Rocket subscription through the available billing controls; cancellation ordinarily takes effect at the end of the paid period unless checkout terms or law say otherwise. Plan credits and one-time credit packs follow the allowances disclosed when purchased. Taxes may be added where applicable. Nothing here limits refund or cancellation rights that applicable law does not allow us to exclude.</p>
      </section>

      <section>
        <h2>6. Rocket Developer and Stripe Connect</h2>
        <p>Rocket Developer is a separate membership, currently advertised at $99 per year per developer account. Free app submission, claiming and basic management do not require it. Access to Rocket ID and Buy with Rocket production features is subject to an active membership, verified app ownership, supported location, completed Stripe onboarding, technical readiness and our approval. We may decline or pause payment activation where these conditions are not met.</p>
        <p>When you choose to connect a Stripe account, you authorize Rocket to share the business and account information needed for onboarding with Stripe; create or link your connected account through Stripe; receive account capability and payment status information; configure products, prices and checkout for your app at your direction; create charges or subscriptions on your connected account; apply the disclosed Rocket platform fee; and reconcile payment events to provide or revoke app access. Rocket uses connected-account data only for these platform purposes and as described in our <Link to="/privacy">Privacy Policy</Link>. You can ask us to disconnect an integration, subject to outstanding transactions and legal obligations.</p>
        <p>Stripe provides payment processing and connected-account services under the <a href="https://stripe.com/legal/connect-account" target="_blank" rel="noopener noreferrer">Stripe Connected Account Agreement</a> and other applicable Stripe terms, which you must accept during Stripe onboarding. Rocket is not a bank, escrow service or custodian. For Buy with Rocket's current direct-charge design, customer payments are processed on the developer's connected Stripe account. Rocket does not receive or hold the developer's customer funds. Stripe controls settlement, reserves, payout timing and any payment-service restrictions under its terms and applicable law.</p>
        <p>Rocket's Buy with Rocket platform fee for new plans is 5% of eligible transactions, separate from Stripe processing fees and other charges shown at onboarding or checkout. The applicable fee and who pays each charge must be clearly shown before activation or purchase; we will not apply a changed fee retroactively. Developers remain responsible for their app, customer support, fulfillment, applicable taxes and legally required receipts, refund policies and dispute responses. Stripe may debit, withhold or reverse amounts for refunds, disputes, chargebacks, negative balances or other reasons under its terms. Rocket may adjust or revoke app access when a payment is refunded, disputed, cancelled or otherwise not completed.</p>
      </section>

      <section>
        <h2>7. Buying a developer's app</h2>
        <p>Where Buy with Rocket is available, the identified developer supplies the app and sets its product, price, renewal terms and refund policy. Review those details before buying. The developer, not Rocket, is responsible for delivery, app support, cancellation and refunds except where Rocket expressly says it is the seller. Payment is handled by Stripe. Your statutory consumer rights remain intact, and you may contact the developer or <Link to="/contact">Rocket support</Link> if there is a problem. Do not assume that buying one app grants rights to another app or to Rocket Developer.</p>
      </section>

      <section>
        <h2>8. Intellectual property and generated output</h2>
        <p>Rocket and its licensors own the service, software, design and trademarks. We give you a limited, revocable right to use Rocket as these Terms permit. Rights to generated designs and exports depend on the plan and license terms presented for that product. Generated output may resemble existing material; you are responsible for reviewing it before commercial use, registration or publication. Do not remove our notices or reverse engineer the service except where law permits.</p>
      </section>

      <section>
        <h2>9. Changes, availability and liability</h2>
        <p>We may update the service and these Terms. We will post a new effective date and give additional notice where law requires or a material change affects an existing paid relationship. Continued use after the change takes effect means you accept it, except where law requires another form of consent.</p>
        <p>Rocket is provided with reasonable care but cannot promise uninterrupted service or that third-party apps will meet your needs. To the extent law permits, Rocket is not responsible for losses caused by third-party apps, inaccurate third-party listings or events outside our reasonable control. Nothing in these Terms excludes liability that cannot lawfully be excluded, including liability for fraud or rights under consumer law.</p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>For legal notices, payment questions, a listing concern or a complaint, use <Link to="/contact">Contact</Link> or email <a href="mailto:alex@tryrocket.ai">alex@tryrocket.ai</a>. If your concern is about a purchased app, include the app name and transaction reference, but never send full card numbers or passwords.</p>
      </section>
    </LegalPage>
  );
};

export default Terms;
