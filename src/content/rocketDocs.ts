export type DocSection = { id: string; title: string; body: string };
export type DocArticle = {
  slug: string;
  group: string;
  title: string;
  summary: string;
  sections: DocSection[];
};

const section = (id: string, title: string, body: string): DocSection => ({
  id,
  title,
  body,
});

export const docGroups = [
  "Get started",
  "Your app",
  "Verified metrics",
  "Identity & payments",
  "Growth & tools",
  "Help",
];

export const docArticles: DocArticle[] = [
  {
    slug: "getting-started",
    group: "Get started",
    title: "Getting started with Rocket",
    summary:
      "Find an app, publish your own listing, and understand what each Rocket feature does.",
    sections: [
      section(
        "discover",
        "Find something useful",
        `Start in [Discover](/discover). Search by name or idea, browse a category, or filter by platform. Open a profile to see its description, screenshots, website and any public evidence. Use Visit website to try the product on its own site.

You can browse without an account. Sign in to save apps, create collections, or contribute a review. A Rocket account does not automatically create an account with every app in the catalogue.`,
      ),
      section(
        "publish",
        "Bring your own app",
        `1. Open [Submit my app](/submit) and enter the app's public website.
2. Review the automatic result. Claim a matching listing rather than creating another one.
3. For a new app, check the details, add media and complete the review step before publishing.
4. Sign in when asked, then open [My Apps](/your-apps) to continue ownership verification.
5. Once verified, improve your listing and choose whether to connect traffic or revenue evidence.

Submitting, claiming and domain verification are separate steps. Publishing an app does not verify ownership or activate payments.`,
      ),
      section(
        "choose",
        "Choose the tools you need",
        `Public discovery and basic app setup are free. [Rocket Developer](/docs/rocket-developer) is a separate annual membership. [Create](/docs/create) uses its own plans and generation credits. [Advertising](/docs/advertising) is a one-time purchase.

You do not need to integrate Rocket ID or Buy with Rocket simply to have a public listing. Start with an accurate profile; add integrations when they serve your app.`,
      ),
    ],
  },
  {
    slug: "discovering-apps",
    group: "Get started",
    title: "Discover, save and review apps",
    summary:
      "Use search, platform filters, rankings and collections to find and revisit software.",
    sections: [
      section(
        "browse",
        "Search and filter",
        `Use [Discover](/discover) to search apps and browse categories. Platform filters distinguish Web, iOS, Android and Hardware. Categories describe what an app does; platform labels describe where it runs.

MCP Available filters for apps whose domain-verified owners supplied an MCP URL. This is a developer declaration, not a test of the server or its compatibility with your AI client. Read the app's own documentation before connecting it.`,
      ),
      section(
        "rankings",
        "Understand discovery signals",
        `**New** reflects recently added listings, which may be older products. **Rising** reflects views of app pages on Rocket. **Top Ranked** combines published reviews, current bookmarks and eligible verified purchases with equal weight. Buyers count once per app; refunded and disputed purchases are excluded.

These signals are not download counts or external customer growth. A public listing is not an endorsement. Rocket Picks are separate editorial selections, and sponsored placements are labelled.`,
      ),
      section(
        "save",
        "Keep and share useful finds",
        `Select Save on a card or profile, signing in if prompted. Saved apps belong to your account. Open Saved to revisit them and organize collections. Keep a collection private for your own research, or choose public visibility before sharing its public link.

Reviews appear on app profiles. Describe your experience with the product rather than treating a listing or badge as proof of quality. Use Report app or [Contact](/contact) when information needs review.`,
      ),
    ],
  },
  {
    slug: "submit-an-app",
    group: "Your app",
    title: "Submit an app",
    summary:
      "Go from a website URL to a reviewed public listing, with an alternative manual flow.",
    sections: [
      section(
        "url",
        "Start with the right URL",
        `Open [Submit my app](/submit). Prefer your app's own public website. Rocket also recognizes supported Launch pages, GitHub repositories with a product website, and Hacker News stories linking to a product.

Product Hunt, Apple App Store and Google Play listing URLs are not currently accepted as submission sources. Use the app's website instead. Private, local-network, password-protected and non-HTML pages cannot be read as public product pages.`,
      ),
      section(
        "review",
        "Review the four steps",
        `Choose Add with AI to read public website metadata. The import prepares a draft; it does not publish or verify your app automatically.

1. **Basic Information:** check the name, tagline and website. Developer attribution is not ownership proof.
2. **Media & Assets:** add an app icon and hero image. Optional screenshots and a supported video help explain the product. Uploads require sign-in; use PNG, JPEG or WebP up to 2 MB each, with at most six screenshots.
3. **App Details:** choose accurate categories, platforms and the other supported listing details.
4. **Review & Submit:** check what will be public and explicitly publish. If signed out, sign in to finish.

For a matching app, use Claim existing app. Rocket will not overwrite the existing listing from an automatic import.`,
      ),
      section(
        "manual",
        "If the website cannot be read",
        `Choose Add details manually, or Edit manually after an error. Enter the same required details and review them before publishing. Your draft is saved in the current browser session, but it is not a published listing until submission completes.

A blocked site, a timeout or an incomplete response can prevent extraction. Try the canonical website URL once, then use manual entry if it still fails. See [Submission troubleshooting](/docs/troubleshooting#submission). After publishing, continue with [Claim and verify ownership](/docs/claim-and-verify).`,
      ),
    ],
  },
  {
    slug: "claim-and-verify",
    group: "Your app",
    title: "Claim and verify ownership",
    summary:
      "Claim the existing listing and prove control of its website before managing trusted app settings.",
    sections: [
      section(
        "claim",
        "Find the canonical listing",
        `Search Rocket for your app first. Open its profile and start the claim flow, or use [My Apps](/your-apps) to continue an existing claim. Sign in with the account you want to use to manage it.

An imported listing may already represent your app. Claiming that listing preserves its sources and existing activity. Creating a second copy does not resolve an ownership issue. Ambiguous matches may need review before Rocket can select a canonical identity.`,
      ),
      section(
        "challenge",
        "Complete the challenge shown by Rocket",
        `Choose an available ownership method in the claim screen. For a DNS challenge, copy the exact record name, type and value Rocket provides into your domain's DNS settings. For a website challenge, place the exact content at the HTTPS location shown by Rocket.

Return to the claim screen and run its verification check. DNS records can take time to propagate; confirm the record is on the app's domain and has not been rewritten by your DNS provider. A website challenge must be publicly readable at the specified location.

Do not invent a record name or reuse another app's token. Rocket needs to read the actual challenge before it marks ownership as domain verified.`,
      ),
      section(
        "review",
        "When review is needed",
        `A pending claim is not verified ownership. If you cannot complete a supported challenge, use the available manual-review path and explain your relationship to the product. Review does not automatically award a verified badge.

For a stuck claim, [contact Rocket](/contact) with the listing URL, the method used and the visible error. Do not send registrar passwords or API keys. Once verification succeeds, open [My Apps](/your-apps) to edit the profile or configure supported integrations.`,
      ),
    ],
  },
  {
    slug: "manage-your-app",
    group: "Your app",
    title: "Manage your app profile",
    summary:
      "Maintain app details and media, add agent links, and distinguish your edits from verified evidence.",
    sections: [
      section(
        "edit",
        "Edit the public presentation",
        `Open [My Apps](/your-apps), select your app and choose Edit profile. Available controls depend on your ownership status. Complete [domain verification](/docs/claim-and-verify) if management options are missing.

Use a recognizable name and icon, a clear description and useful screenshots. Keep category, platform and pricing information accurate. Save changes, then use View public profile to check the actual published presentation, including on mobile.`,
      ),
      section(
        "evidence",
        "Know what edits can change",
        `Owner presentation edits do not replace Rocket's source provenance, user reviews or verification history. Website control verifies a specific relationship to a domain; it is not a certification of the app's quality, security or revenue.

Traffic and revenue badges come from separate integrations and visibility choices. Entering a number in a description does not turn it into a verified metric. See [Metric visibility](/docs/verified-metrics) for the requirements.`,
      ),
      section(
        "agents",
        "Add agent integrations",
        `After domain verification, open your app's Agent Integrations settings. Add the public MCP server URL, API documentation, GitHub repository or deployment guide that applies to your product, plus the supported AI clients.

These fields are free to configure and are labelled developer-declared. Rocket displays the supplied links under Works with AI Agents; it does not run the server or test each client. Use public documentation URLs, not private access tokens or credential-bearing URLs.`,
      ),
    ],
  },
  {
    slug: "developer-profile",
    group: "Your app",
    title: "Build your developer profile",
    summary:
      "Set up your public identity, connect it to your apps and share a useful portfolio.",
    sections: [
      section(
        "identity",
        "Complete your public identity",
        `Open [Profile settings](/settings/profile). Add your public name, username, avatar and a short bio describing what you build. Your username forms the public profile URL, such as /@yourname.

Review the public page before sharing. A public developer profile is different from your private account settings. Do not put private contact details or credentials in your bio.`,
      ),
      section(
        "apps",
        "Connect your work",
        `Submit or claim the canonical listings for your apps, then complete ownership verification. Public attribution in an app description is not a substitute for a verified ownership relationship.

An accurate profile and verified apps help people understand your portfolio. They do not create a universal reputation score, guarantee placement, or activate identity and payment integrations. [Rocket 100](/docs/rocket-100) has separate eligibility and public revenue rules.`,
      ),
      section(
        "share",
        "Share your public profile",
        `Use the profile's Share action to copy its link or create a supported sharing card. Check the preview before downloading. A missing or private metric will not become public just because you share the page.

Post the link or image yourself in the channels you use. Rocket's share tools do not automatically publish to your social accounts. Update the underlying profile when your public name, bio or portfolio changes.`,
      ),
    ],
  },
  {
    slug: "verified-metrics",
    group: "Verified metrics",
    title: "Connections, verification and visibility",
    summary:
      "Understand the steps between connecting a provider and showing a trustworthy public metric.",
    sections: [
      section(
        "states",
        "A connection is the first step",
        `Start from a domain-verified app in [My Apps](/your-apps). Connect a supported provider, select the matching property, project or account, map the source to the app, and complete a successful sync.

Connected means authorization exists. Verified means supported data passed the integration's checks. Public means you explicitly enabled eligible visibility. These are different states: a connected account may still need source selection, a new sync or renewed authorization.`,
      ),
      section(
        "privacy",
        "Choose what visitors can see",
        `Metrics are private by default. Where supported, choose:

| Visibility | Public result |
| --- | --- |
| Private | No public metric |
| Verified only | Verification without a numeric value |
| Range | A supported value band |
| Exact | The eligible numeric value |

Only one analytics provider and one revenue provider can be selected for an app at a time. Authorizing another provider does not mean its metrics are automatically public. Confirm a source switch when requested and review visibility afterwards.`,
      ),
      section(
        "freshness",
        "Keep the evidence current",
        `Check the last successful sync, reported period and provider label. An incomplete, stale, unsupported or disconnected source can lose public eligibility. Test revenue cannot be displayed as production-verified revenue.

After changing a property or product mapping, sync again and inspect View public profile. Disconnecting removes public verification; revoke the upstream key or grant separately when the provider instructions require it. A public traffic figure measures that provider's metric, not installs, purchases or customer growth.`,
      ),
    ],
  },
  {
    slug: "google-analytics",
    group: "Verified metrics",
    title: "Connect Google Analytics",
    summary:
      "Authorize GA4, choose the web stream that matches your verified domain and publish selected traffic metrics.",
    sections: [
      section(
        "prepare",
        "Before connecting",
        `You need a domain-verified Rocket app and access to the GA4 property that measures its website. Use the Google account that can read that property. A property containing a different website cannot verify this app's traffic.

GA4 traffic is distinct from Rocket's own profile-view analytics. GA4 measures activity on your website; [Rocket app analytics](/docs/app-analytics) measures activity on Rocket.`,
      ),
      section(
        "connect",
        "Authorize and select the stream",
        `1. Open My Apps, choose your app and open its Google Analytics connection.
2. Select Connect Google Analytics and complete Google's authorization flow.
3. Back in Rocket, choose the GA4 property.
4. Select the web stream matching your app's verified domain. If no stream matches, check the property and stream website configuration.
5. Save the selection and let Rocket sync. Use Sync now to retry after correcting a problem.

Granting access alone does not complete property selection. Check the connection status and last successful sync before expecting a public card.`,
      ),
      section(
        "publish",
        "Choose visibility and check the result",
        `Public visibility controls apply to supported active-user, session and view metrics. The public profile uses eligible completed-day data, rather than an unfinished current day. Verified only reveals no number.

Select the visibility for each metric, then inspect the public app profile. Keep GA4 selected if it is your intended public analytics source. Disconnecting removes public traffic verification. If authorization expires or a property disappears, reconnect with an account that still has access.`,
      ),
    ],
  },
  {
    slug: "posthog",
    group: "Verified metrics",
    title: "Connect PostHog",
    summary:
      "Verify completed-day pageviews for your app's host and optionally switch your selected analytics source.",
    sections: [
      section(
        "connect",
        "Authorize the correct region and project",
        `From your domain-verified app in My Apps, open PostHog. Choose US Cloud or EU Cloud to match your PostHog project, then connect and authorize access.

Choose PostHog project, select the relevant project and run Verify project and sync. Rocket checks pageview activity for the app's verified website host. A project authorization is not proof that its events belong to the app.`,
      ),
      section(
        "sync",
        "Wait for a completed day",
        `Rocket uses completed UTC-day pageviews. A newly installed project may have recent events but no complete day yet. Keep sending normal pageviews and retry Sync now after a full reporting day.

Check the verified host, last successful sync and any action-required message. A project with events for another hostname must not be used to represent this app. PostHog pageviews are not interchangeable with GA4 active users.`,
      ),
      section(
        "switch",
        "Select PostHog for public display",
        `A connected PostHog project does not replace GA4 automatically. Once verification is healthy, choose Use verified PostHog and confirm the source switch. The new source starts private.

Choose public pageview visibility and inspect the app's public page. Only one analytics source appears at a time. Stale data needs a fresh sync before sharing. Disconnecting removes the local connection and its public verification; follow the provider's grant-revocation controls if needed.`,
      ),
    ],
  },
  {
    slug: "revenue-verification",
    group: "Verified metrics",
    title: "Choose a revenue verification source",
    summary:
      "Select an app-specific revenue source and understand MRR, gross revenue and payment-volume differences.",
    sections: [
      section(
        "choose",
        "Start in your app's Revenue settings",
        `Open My Apps, select a domain-verified app and open Revenue. Choose an available provider. A read-only revenue connection is separate from [Buy with Rocket](/docs/buy-with-rocket): it does not enable checkout or grant payment access.

Keep one selected revenue provider per app. If switching, review the confirmation and check the new source's mapping and visibility. A previous provider's numbers should not be added to the new source as a second public verification.`,
      ),
      section(
        "compare",
        "Know which figure is being verified",
        `| Provider | Current verification scope |
| --- | --- |
| Stripe | Supported subscription MRR from mapped prices; availability gated |
| RevenueCat | Gross project revenue for the previous 30 complete UTC days; single-app project required |
| Polar | Gross revenue for the previous 30 complete UTC days; dedicated organization required |
| Dodo Payments | Succeeded, non-refunded USD payment volume for the previous 30 complete UTC days; dedicated brand required |

Gross revenue and payment volume are not monthly recurring revenue, profit or developer take-home income. Read the currency, period and metric label before comparing apps.`,
      ),
      section(
        "publish",
        "Verify privately before publishing",
        `Review the selected account and included products, confirm they belong to this app, and complete a successful private sync. Shared accounts must not be attributed to a single app when the integration cannot separate them safely.

Only then choose supported public visibility. Unsupported configurations, stale evidence and test data must not appear as live verified revenue. See the provider-specific guides and [visibility rules](/docs/verified-metrics).`,
      ),
    ],
  },
  {
    slug: "stripe-revenue",
    group: "Verified metrics",
    title: "Stripe revenue verification",
    summary:
      "Understand Stripe availability, exact price mapping, supported subscription MRR and public visibility.",
    sections: [
      section(
        "availability",
        "Check availability first",
        `Stripe revenue verification uses the read-only Rocket Revenue Verification Stripe App. General availability is gated on Marketplace review and production acceptance. If Rocket shows Coming soon, the public connection flow is not enabled for your app.

Do not substitute a full-access live API key or a separate payment integration to bypass that state. A test pilot or a successful test authorization is not a public live revenue integration.`,
      ),
      section(
        "mapping",
        "Connect and map only this app's prices",
        `When connection is available, start Connect Stripe from the app's Revenue settings and authorize the correct Stripe account. Return to Rocket and check the account identifier and Live or Sandbox label.

Choose Load Stripe prices. Select the exact recurring prices belonging to this app, save the mapping and run Sync MRR. A price can belong to only one Rocket app for that Stripe account. Changing the mapping clears public verification until a new successful sync.

Review any unsupported-subscription message. A connected account alone cannot establish that every subscription is attributable to the app or supported by the calculation.`,
      ),
      section(
        "visibility",
        "Publish eligible MRR",
        `MRR is a monthly-normalized recurring subscription figure, not cash collected during the month. Only fresh, fully supported live snapshots can appear on the public profile. Sandbox figures remain private.

Choose a supported visibility setting, then check the public profile's label, currency and timestamp. Disconnect removes public verification; uninstall the Stripe App separately in Stripe if you no longer want the installation. This flow never changes Buy with Rocket checkout.`,
      ),
    ],
  },
  {
    slug: "revenuecat",
    group: "Verified metrics",
    title: "Connect RevenueCat",
    summary:
      "Map a single-app project and verify gross revenue without presenting it as MRR.",
    sections: [
      section(
        "prepare",
        "Use a single-app project",
        `Rocket's current RevenueCat flow verifies the previous 30 complete UTC days of gross project revenue. It accepts projects containing exactly one app and maps the complete product catalogue. It cannot safely assign project-wide revenue from a shared multi-app project to one Rocket app.

Complete domain verification first and open the app's Revenue settings. If secure connection setup is unavailable, do not paste credentials into another form or contact message.`,
      ),
      section(
        "setup",
        "Connect, preview and save",
        `1. Use the available read-only API-key connection, or RevenueCat OAuth when Rocket offers it.
2. Choose the project and its single app.
3. Preview the source and review the product list, currency, reporting period and gross revenue.
4. Confirm the source belongs to the Rocket app. Confirm a provider switch if another revenue source is selected.
5. Save the private source and check the completed synchronization.

A multi-app project is unsupported in this flow. Do not choose an unrelated project merely to make verification succeed.`,
      ),
      section(
        "maintain",
        "Control visibility and access",
        `RevenueCat gross revenue is not subscription MRR. Keep the metric private until you have reviewed its scope, then choose the supported public visibility and inspect the app profile.

Use Sync now after correcting access or mapping issues. If the connection is stale or unhealthy, public display may be unavailable. Disconnecting removes Rocket's public verification; revoke the upstream API key or OAuth grant separately in RevenueCat when appropriate.`,
      ),
    ],
  },
  {
    slug: "polar",
    group: "Verified metrics",
    title: "Connect Polar",
    summary:
      "Verify gross revenue from a dedicated Polar organization using read-only access.",
    sections: [
      section(
        "prepare",
        "Prepare an app-specific organization",
        `Use a Polar organization dedicated to this app, including its historical revenue. Rocket's current flow verifies gross revenue for the previous 30 complete UTC days. A shared organization cannot safely be attributed to a single app.

Create a read-only organization token with organizations, products and metrics access using Polar's own controls. Enter it only in the secure Polar connection field in the app's Revenue settings. Do not use a credential that grants unnecessary write access.`,
      ),
      section(
        "setup",
        "Preview before saving",
        `1. Open My Apps, select the domain-verified app and open Revenue.
2. Connect Polar with the read-only token.
3. Choose the dedicated organization and select Preview verified source.
4. Review the organization's products, USD revenue and reporting dates.
5. Confirm that the account and its historical revenue belong only to this app, then Save private source.

If another revenue provider is selected, confirm the intended replacement. Saving a verified source does not automatically publish its numbers.`,
      ),
      section(
        "maintain",
        "Publish and maintain the connection",
        `Use the supported visibility choices only after reviewing a healthy private sync. Polar gross revenue is not MRR or profit. Compare it using the stated period and currency.

Sync now refreshes the source. If access changes, replace the token through the connection form. Disconnect removes local public verification; revoke the token separately in Polar if it is no longer needed. An error or missing public card should be investigated before making a public revenue claim.`,
      ),
    ],
  },
  {
    slug: "dodo",
    group: "Verified metrics",
    title: "Connect Dodo Payments",
    summary:
      "Verify succeeded, non-refunded USD payment volume for a dedicated Dodo brand.",
    sections: [
      section(
        "scope",
        "Understand the metric",
        `The current Dodo integration reads succeeded, non-refunded USD payments for the previous 30 complete UTC days. This is customer payment volume, including tax. It is not subscription MRR, profit or net payouts.

Use a live read-only Dodo API key and a brand dedicated to this one app. A shared brand's historical payments cannot safely verify a single app's revenue. Complete domain ownership verification before connecting.`,
      ),
      section(
        "setup",
        "Connect the brand and verify privately",
        `1. Open the app's Revenue settings in My Apps.
2. Enter the live read-only key in the Dodo Payments connection field.
3. Choose the dedicated brand and Preview verified source.
4. Review the products, USD payment volume and reporting dates.
5. Confirm exclusive attribution to this app and save the private source. Confirm a provider replacement if prompted.

The integration reads evidence; it does not enable Buy with Rocket or move money.`,
      ),
      section(
        "maintain",
        "Check public display and disconnect safely",
        `Choose supported visibility after a successful private verification. A healthy, fresh live sync is still required for public display. Check the provider and payment-volume label on your public app page.

Use Sync now after a correction or Replace key if access changes. Disconnecting removes the local connection's public verification. Revoke the API key in Dodo separately when it should no longer be usable.`,
      ),
    ],
  },
  {
    slug: "rocket-id",
    group: "Identity & payments",
    title: "Integrate Rocket ID",
    summary:
      "Add Continue with Rocket using authorization code, PKCE and explicit user consent.",
    sections: [
      section(
        "register",
        "Register your integration",
        `Open [Rocket ID](/rocket-id) with the developer account managing the app. Access and eligibility are checked by the portal. Register the app and its exact callback URL; use separate test and production registrations where the portal requires them.

Only deliberately integrated apps support Continue with Rocket. A directory listing, public profile or membership does not connect an app automatically. The hosted [official button kit](/buttons/v1/brand-usage.html) controls presentation; you still implement the authorization flow.`,
      ),
      section(
        "authorize",
        "Use the supported OAuth flow",
        `Use authorization code with S256 PKCE. Send response_type=code, the registered client_id and redirect_uri, scope, a random state, code_challenge and code_challenge_method=S256. The openid scope is required; profile and email are optional. Use nonce when validating an OIDC ID token.

Redirect the user to the authorization endpoint, let them authenticate and review consent, then validate state on your callback. Exchange the one-time code with the same redirect URI and the original code_verifier. Do not put a Rocket session token into your app or trust an unvalidated callback parameter.

The supported client flow is public PKCE. Do not assume confidential-client authentication or refresh tokens are supported.`,
      ),
      section(
        "endpoints",
        "Discover endpoints and validate identity",
        `Authorization endpoint: https://tryrocket.ai/connect/authorize

Discovery document: https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-connect-discovery

Use the discovery document for the token, UserInfo and JWKS endpoints. At the token endpoint, POST grant_type=authorization_code, client_id, code, redirect_uri and code_verifier with Content-Type application/x-www-form-urlencoded. Read UserInfo with the Rocket integration access token; validate ID-token signatures, issuer, audience, expiry and nonce against the published metadata and keys.

Create your own application's session after validation. Test denied consent, wrong state, invalid PKCE, reused codes and revoked authorization. Users can revoke connected applications in Rocket Settings; your integration must handle authorization failures rather than continuing to trust an old token.`,
      ),
    ],
  },
  {
    slug: "buy-with-rocket",
    group: "Identity & payments",
    title: "Set up Buy with Rocket",
    summary:
      "Connect a merchant, map eligible Stripe prices and verify entitlements before enabling an offer.",
    sections: [
      section(
        "prepare",
        "Prepare identity, ownership and payments",
        `Open [Buy with Rocket](/buy-with-rocket). The portal checks membership, app ownership and integration eligibility. Configure your app's Rocket identity integration, then complete Stripe-hosted merchant onboarding for payments.

Use the intended merchant account. A read-only Stripe revenue-verification connection is separate and does not provide checkout access. A ready merchant must satisfy Stripe's payment requirements; merely starting onboarding does not make an offer purchasable.`,
      ),
      section(
        "offers",
        "Map a price to app access",
        `When an eligible fixed price already exists on the connected merchant account, map it instead of creating a duplicate Stripe product. Associate the exact price with the app access key your integration understands. Register the exact checkout return URL.

Offers are saved inactive until the developer activates them. A purchase test is recommended, but is not mandatory for activation. Check amount, currency, interval and access mapping in the portal. Stripe readiness and live payment validation still apply; your app must grant access only from verified payment or entitlement state.

Publish multiple offers for one app, including one-time, monthly and annual prices. Edit each offer's name, short description and entitlement key. Give monthly and annual prices the same entitlement key when they grant the same tier. An entitlement key cannot change after an offer is used in checkout. Unpublishing stops new checkout without removing existing paid access.

The public listing shows a native plan picker with actual Stripe prices and available billing intervals. Buyers choose a plan before Buy with Rocket. Visit website remains available separately. Copy the hosted picker or plan-specific link from setup for your own website. The official button supports public app-id and optional offer-id attributes for the same hosted flow; no secret credentials belong in it. It never grants access.`,
      ),
      section(
        "entitlements",
        "Grant access only from verified payment state",
        `The buyer pays through Stripe Checkout for the connected merchant. Rocket confirms payment server-side; your app must check the current verified purchase or entitlement before granting the mapped access. The entitlement_key filter selects a logical tier across monthly and annual offers; product_key still selects an exact offer. Check the matching client, active state, expiry and revocation on your server.

A checkout return URL or a browser success screen is not proof of payment. Handle pending and failed payments, duplicate delivery, cancellations, refunds and disputes. Revoked or refunded access must not remain active solely because an earlier callback said success.

V1 does not support upgrades or downgrades during an existing app subscription. Buyers can manage cancellation in My Purchases and buy a different plan after the existing subscription ends. Another subscription or open checkout for the same app blocks duplicate checkout.

Rocket's platform fee is 5% on new Buy with Rocket plans, separate from Stripe processing fees and the Developer membership. On a $100 payment, the Rocket fee is $5 before separate costs. Stripe controls the connected merchant's payout timing. Test and live transactions must remain separate.`,
      ),
    ],
  },
  {
    slug: "rocket-developer",
    group: "Identity & payments",
    title: "Rocket Developer membership",
    summary:
      "Understand the $99 annual membership, app eligibility and separate billing products.",
    sections: [
      section(
        "membership",
        "What the membership covers",
        `[Rocket Developer](/settings/developer) costs $99 per year per developer account. It brings together Verified Traction, Rocket ID and Buy with Rocket for eligible owned apps. Advanced Analytics, AI App Optimization and Beta Testing are labelled beta.

Membership is not automatic configuration. Domain ownership, supported providers, merchant readiness and the app's integration must still satisfy their individual requirements. A beta label does not promise a completed result for every app.`,
      ),
      section(
        "free",
        "Start with the free app setup",
        `You can browse, submit or claim an app, complete supported ownership checks and maintain its basic public listing without buying a membership. Domain-verified owners can add Agent Integrations for free. Available evidence connections have their own readiness checks.

Paying does not purchase an organic rank, a positive review, a Rocket Pick or verified revenue. Set up an accurate listing before deciding which additional tools you need.`,
      ),
      section(
        "billing",
        "Manage the right subscription",
        `Use Developer settings to inspect your membership and available billing controls. Check the current checkout amount and renewal terms before paying. [Pricing](/pricing) is the reference for current offers.

Create subscriptions and credits are separate from Developer membership. Advertising is a separate one-time purchase. An independent app's subscription is also separate unless that app deliberately sells through Rocket. For a billing question, provide the relevant product and receipt reference through Contact, without card details.`,
      ),
    ],
  },
  {
    slug: "advertising",
    group: "Growth & tools",
    title: "Book and understand advertising",
    summary:
      "Choose Featured App or Category Sponsor, review availability and understand sponsored reporting.",
    sections: [
      section(
        "placements",
        "Choose a placement",
        `Open [Advertise](/advertise) for current inventory and eligibility. Featured App costs $49 for 7 days. Category Sponsor costs $299 for 30 days. Both are one-time purchases. New bookings use shared rotation with no cap on the number of advertisers.

Sponsored placements are labelled. They do not buy Rocket Picks, positive reviews, a verified metric or a position in organic rankings. Featured ads rotate through up to eight homepage positions and eligible public-page placements. Category sponsors rotate within their selected category. Each active shared campaign has an equal chance of selection; exposure depends on traffic and the number of advertisers. There is no guaranteed number of impressions, clicks or sales. Existing reserved bookings retain their original terms until they end.`,
      ),
      section(
        "booking",
        "Review before paying",
        `Sign in and choose an eligible app or a supported website destination. Check the destination URL, placement type, price, schedule and the details Rocket asks you to review.

Reserve and review before opening Stripe Checkout. A reservation or an opened checkout is not a completed booking. After payment, check the recorded booking and its actual placement period. If payment status is unclear, check the existing receipt or contact Rocket before starting a second payment.`,
      ),
      section(
        "reporting",
        "Interpret impressions and clicks",
        `Advertising reporting counts the activity Rocket records for the placement. An impression is not proof that someone read the card, and a click is not a signup, sale or install.

Keep paid discovery separate from organic engagement. Use your own website analytics and suitable campaign parameters to understand downstream outcomes. Rocket does not guarantee a particular visitor volume or commercial return from a booking.`,
      ),
    ],
  },
  {
    slug: "sharing",
    group: "Growth & tools",
    title: "Share apps, profiles and collections",
    summary:
      "Choose a public link or downloadable card and prepare it for your social channels.",
    sections: [
      section(
        "share",
        "Share the right public page",
        `Open a public app or developer profile and choose Share. Copy the link when you want people to browse the live page, or use an available card download when posting an image. Public collections also have shareable pages.

Use the app's Share action for that app. The header's site-share action represents Rocket itself. Sign-in state can affect which personal actions are available, but a recipient should be able to view an eligible public page without your account.`,
      ),
      section(
        "cards",
        "Check the card before posting",
        `Choose a supported format for your destination and inspect the generated image. Confirm the name, screenshots and any visible provider metric. Cards can only include evidence that is eligible for public display; a private connection or sandbox figure does not become public by exporting an image.

Post or upload the image yourself. Copy its caption or link where supported. Some destinations use a browser or mobile system share sheet instead of a direct web action. Rocket does not publish to your social accounts automatically.`,
      ),
      section(
        "recap",
        "Keep private material private",
        `A private collection needs public visibility before its public link can be shared. Rocket Recap is private by default and covers eligible activity from completed months. Where recap sharing is offered, select the recorded metrics you intend to publish and review the share before enabling it.

Revoking a public link can stop future access through that link; it cannot remove a screenshot someone already saved. Never include account tokens, private dashboard screenshots or unsupported revenue claims in a public post.`,
      ),
    ],
  },
  {
    slug: "rocket-100",
    group: "Growth & tools",
    title: "Rocket 100 eligibility, MRR and growth",
    summary:
      "Join the eligible builder cohort and understand public revenue ranking and missing values.",
    sections: [
      section(
        "join",
        "Qualify and join",
        `Open [Rocket 100](/100). The page checks your eligibility and shows the next available action. Complete your confirmed account's public name, username, avatar and bio, and have an eligible discoverable app with verified domain ownership.

Use Join the Rocket 100 when eligible. The cohort is limited to 100 builders and eligibility is checked server-side. Membership or advertising cannot buy a place. An app submission alone does not complete ownership verification or enrollment.`,
      ),
      section(
        "mrr",
        "Understand public MRR",
        `The leaderboard ranks builders by public MRR and lets visitors sort by MRR or Growth. Eligible live verified subscription revenue is included only when the app owner has chosen exact public visibility.

Private values, ranges, test figures and unsupported metrics must not be exposed through the board. Gross revenue and payment volume are not substituted for subscription MRR. Currency and comparable-source requirements can leave an aggregate unavailable rather than adding incompatible numbers.`,
      ),
      section(
        "growth",
        "Read missing values correctly",
        `Growth compares qualifying verified MRR with a comparable snapshot around 30 days earlier. It needs usable source history and a valid baseline. A new connection may show MRR while growth is still unavailable.

A dash means the required public or comparable evidence is unavailable; it does not mean zero revenue. Sorting changes the table order, while stored rank follows the current published calculation. Improve the underlying app's eligible evidence rather than expecting a profile edit or sponsorship to create revenue data.`,
      ),
    ],
  },
  {
    slug: "app-analytics",
    group: "Growth & tools",
    title: "Read your Rocket app analytics",
    summary:
      "Distinguish Rocket profile activity from external traffic and business results.",
    sections: [
      section(
        "open",
        "Open the app's Analytics page",
        `In [My Apps](/your-apps), choose the app you manage and open Analytics. This reports supported activity on Rocket, such as profile views, current saves, published reviews and ratings. Additional analytics may be beta or require eligibility.

Use the selected reporting period when comparing values. A current total such as bookmarks is different from new activity during that period. A missing or untracked field is not automatically zero.`,
      ),
      section(
        "meaning",
        "Keep different signals separate",
        `Rocket profile views describe visits to a listing on Rocket. Connected GA4 or PostHog metrics describe traffic on your own website. Sponsored impressions and clicks describe an advertising placement.

None of these establishes paid customers, installs, product usage or MRR. Deduplicated view records are not a durable count of unique people across all dates. Use the metric's stated scope rather than combining incompatible counts into a conversion rate.`,
      ),
      section(
        "act",
        "Use the numbers to improve the listing",
        `Check whether people who open your profile can quickly understand the app and find its website. Improve unclear descriptions or media, then compare later activity over a comparable period.

To understand revenue or customer retention, use the app's own product and payment systems. To show external traffic publicly, configure [Google Analytics](/docs/google-analytics) or [PostHog](/docs/posthog), complete verification and choose visibility.`,
      ),
    ],
  },
  {
    slug: "create",
    group: "Growth & tools",
    title: "Create assets and Brand Kits",
    summary:
      "Use Rocket's creative workspace while keeping projects, credits and app listings distinct.",
    sections: [
      section(
        "start",
        "Start in Brand Studio",
        `Open [Brand Studio](/create) and sign in. Use the available creation tools for logos, icons and other supported brand assets. Give the tool a clear brief: the product name, audience, intended use and visual direction matter more than a long list of unrelated styles.

Review the generated result before using it publicly. A generated image is not proof of trademark availability or ownership of another company's brand.`,
      ),
      section(
        "projects",
        "Keep related assets together",
        `Use the workspace's project controls to organize related assets. A project's Brand Kit collects supported logos, colors, typography and other structured brand materials when they exist. Generate or add the relevant asset types if a kit is empty.

Inspect the available editing and export controls for the asset. Export formats depend on the tool and asset; do not assume that every raster output is an editable vector. Download and inspect the file before sending it to a printer, developer or social platform.`,
      ),
      section(
        "billing",
        "Check credits and separate products",
        `Creative generation may use credits or a Create subscription. Check the current balance, tool cost and [Pricing](/pricing) before generating. Developer membership, advertising and independent-app subscriptions are separate products.

A creative project is not a public app listing. Use Submit my app when you want your software listed in discovery, then add the assets that accurately represent it. Rocket's own downloadable logos and color guidelines live in the public [Brand Kit](/brand-kit).`,
      ),
    ],
  },
  {
    slug: "troubleshooting",
    group: "Help",
    title: "Troubleshooting and account help",
    summary:
      "Recover from submission, verification, connection and sign-in problems with the right next step.",
    sections: [
      section(
        "submission",
        "The automatic submission failed",
        `Check that you entered the product's public website, not an unsupported store page, private dashboard or local address. Retry once if the error is temporary. A site that blocks automated reads or returns an incomplete response may need manual entry.

Choose Edit manually or Add details manually and review the required fields. Do not publish a duplicate if Rocket identifies an existing app. A failed website read is not evidence that your app was rejected. For help, send the submitted URL, error text and approximate time through Contact.`,
      ),
      section(
        "ownership",
        "A claim is pending or verification fails",
        `Check the exact challenge values and domain shown by Rocket. DNS changes may need propagation time; a website challenge must be reachable publicly at the specified HTTPS location.

An open claim is not domain verification. A manual-review request must be reviewed before ownership changes. Contact Rocket with the app listing and visible claim status if the next step is unclear; never send DNS-account credentials.`,
      ),
      section(
        "metrics",
        "A connection exists but the card is missing",
        `Check each stage: authorization, matching source selection, app-specific mapping, last successful sync, selected provider and public visibility. Connecting alone does not complete the remaining steps.

Wait for a completed reporting day where required. Reconnect if provider access was revoked. Test revenue, unsupported configurations and stale evidence cannot establish public live revenue. If changing sources, confirm the switch and recheck visibility.`,
      ),
      section(
        "account",
        "Sign-in or billing needs attention",
        `Use the same Google, X, GitHub or email identity you used for the account, where offered. For email/password access, use the password-reset flow rather than sharing a password. If a confirmation link has expired, request a fresh link through the account flow.

For a payment question, first identify whether it concerns Rocket Developer, Create, advertising or an independent app. Check the existing receipt before paying again. [Contact Rocket](/contact) with the relevant URL, receipt reference, approximate time and error. Do not include passwords, API keys, authorization codes or card details.`,
      ),
    ],
  },
];

export const getDoc = (slug: string) =>
  docArticles.find((article) => article.slug === slug);

export function searchDocs(query: string): DocArticle[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return docArticles;
  return docArticles
    .filter((article) => {
      const text =
        `${article.title} ${article.summary} ${article.sections.map((s) => `${s.title} ${s.body}`).join(" ")}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    })
    .sort(
      (a, b) =>
        Number(b.title.toLowerCase().includes(query.trim().toLowerCase())) -
        Number(a.title.toLowerCase().includes(query.trim().toLowerCase())),
    );
}
