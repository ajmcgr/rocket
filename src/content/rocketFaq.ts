export const faqSections = [
  {
    title: "Discovering apps",
    questions: [
      {
        q: "What is Rocket?",
        a: "Rocket is an open app platform where people discover software and developers build a public presence around what they make. You can search, browse categories, explore New and Rankings, and submit or claim your app.",
      },
      {
        q: "What makes Rocket an open app platform?",
        a: "You can explore public app listings without an account, and developers can submit or claim their apps for free. A listing does not require a Rocket payment or identity integration.",
      },
      {
        q: "Who is Rocket for?",
        a: "Rocket is for people looking for useful apps and for developers who want to present, improve, and grow the apps they build.",
      },
      {
        q: "Are all apps on Rocket reviewed or recommended?",
        a: "No. An indexed app is one Rocket knows about; listing does not equal endorsement. A Rocket Pick is an explicit editorial selection. Claims and verification describe specific evidence, not an overall quality guarantee.",
      },
      {
        q: "How do Rankings work?",
        a: "Top Ranked combines published reviews, current bookmarks and verified purchases with equal weight. Each buyer counts once per app; refunded and disputed purchases are excluded. Ties use reviews, then bookmarks, then app name. Rising lists the most viewed app pages on Rocket. Category rankings are offered when at least 20 apps qualify. Rankings do not imply Rocket endorsement.",
      },
      {
        q: "Can I use every listed app with my Rocket account?",
        a: "No. You can use your Rocket account for Rocket features such as saving apps. Only apps that have explicitly integrated Rocket identity support Continue with Rocket; other apps use their own sign-in.",
      },
      {
        q: "Can I buy every app through Rocket?",
        a: "No. Live Buy with Rocket checkout is enabled, but a Buy option appears only for an individually configured and ready offer. Otherwise, pricing and payment happen on the app's own website.",
      },
      {
        q: "How do I save an app?",
        a: "Select Save on an app card or profile and sign in if prompted. Your saved apps are private to your Rocket account.",
      },
      {
        q: "How do I report an inaccurate or problematic listing?",
        a: "Use the report or correction option on the app profile where available, or send its URL and the issue through our contact form. We review reported information rather than automatically changing another owner's listing.",
      },
    ],
  },
  {
    title: "Launching and managing an app",
    questions: [
      {
        q: "How do I add my app?",
        a: "Open Submit my app and paste its public URL. Rocket first looks for an existing canonical listing. You can review the result before signing in to continue a claim or submission.",
      },
      {
        q: "What if my app is already listed?",
        a: "Claim the existing app rather than creating a duplicate. If multiple records might match, Rocket asks you to resolve the ambiguity instead of guessing.",
      },
      {
        q: "Does claiming my app verify that I own it?",
        a: "Not by itself. A claim starts the ownership process. Domain verification uses a real DNS or website challenge before Rocket marks domain ownership as verified.",
      },
      {
        q: "Can I edit my app profile?",
        a: "Verified owners can manage supported public presentation details in My Apps. Owner edits do not replace Rocket's source provenance, public evidence, user reviews, or verification history.",
      },
      {
        q: "What is my developer profile?",
        a: "Your public developer profile shows the identity and apps connected to your Rocket account. Keep your app information accurate and connect supported evidence to give people context about what you build. Rocket does not assign a single reputation score.",
      },
      {
        q: "What can I do as a developer for free?",
        a: "You can submit or claim an app, manage its basic listing, complete supported ownership checks, and connect available verification evidence without a Rocket Developer membership. Public app profiles and organic discovery are free.",
      },
      {
        q: "What does Rocket Developer add?",
        a: "Rocket Developer costs $99/year per developer account. It brings together Verified Traction, Rocket ID, and Buy with Rocket for eligible apps you own. Advanced Analytics, AI App Optimization, and Beta Testing are in rollout. Each integration has its own setup and readiness checks; membership alone does not activate it.",
      },
      {
        q: "How can Rocket help my app grow?",
        a: "A public profile lets people discover your app through search, categories, New, Rising, and Top Ranked. You can improve your listing and share supported evidence about your app. Discovery and verification do not guarantee traffic, sales, or a ranking position.",
      },
      {
        q: "Can I connect Rocket Login or payments?",
        a: "Supported developers can configure Rocket identity and payments for apps they own. These capabilities require a deliberate integration and are not turned on for every indexed app.",
      },
      {
        q: "Can I show traffic or revenue on my profile?",
        a: "Only supported, connected evidence can be shown as verified. Provider metrics are private by default, and owners choose supported public visibility. Availability and verification depend on the specific integration and account.",
      },
      {
        q: "What is the difference between Verified Purchases and Verified Revenue?",
        a: "Verified Purchases are eligible paid Buy with Rocket purchases used in Top Ranked. Verified Revenue is a separate metric from a supported connected payment provider when its data passes verification. A purchase does not automatically make a public revenue claim.",
      },
    ],
  },
  {
    title: "Payments and Buy with Rocket",
    questions: [
      {
        q: "Do I need to create a second Stripe product for Buy with Rocket?",
        a: "Not when an eligible fixed price already exists on the Stripe merchant account connected to Rocket for payments. You can map that price to an app access key without creating another Stripe product or price. The mapping remains inactive until payment and entitlement handling are verified. A separate read-only revenue connection does not give Rocket payment access to its products. Only individually enabled, ready offers can use live checkout.",
      },
      {
        q: "How does selling through Rocket work?",
        a: "A buyer selects a ready offer and pays through Stripe Checkout for the connected app merchant. Rocket confirms the payment server-side, then makes the verified purchase available to the app's integration. The app must check that purchase or entitlement before granting access; a checkout return alone is not proof of payment.",
      },
      {
        q: "How and when do developers get paid?",
        a: "Buy with Rocket payments go through the developer's connected Stripe merchant account. Stripe controls payout timing and availability for that account. Rocket's 5% platform fee and Stripe's separate processing fees apply.",
      },
      {
        q: "What happens after a refund or dispute?",
        a: "Refunded or disputed purchases do not count toward Top Ranked. Paid access must follow the current verified purchase or entitlement state, so a revoked purchase must not keep granting access.",
      },
      {
        q: "What is the Buy with Rocket take rate?",
        a: "Rocket takes a 5% platform fee on payments through new Buy with Rocket plans. This transaction fee is separate from the $99/year Rocket Developer membership.",
      },
      {
        q: "Are Stripe processing fees included in the 5%?",
        a: "No. Stripe processing fees and any other applicable charges are separate. On a $100 payment, Rocket's platform fee is $5, leaving $95 for the app before those separate costs.",
      },
    ],
  },
  {
    title: "Account, creative tools, and billing",
    questions: [
      {
        q: "Do I need an account to browse Rocket?",
        a: "No. Discovery and public app profiles are available without signing in. An account is needed to save apps, claim an app, manage a listing, or use account-based tools.",
      },
      {
        q: "What can I create on Rocket?",
        a: "Rocket also offers logo, icon, design, and Brand Kit tools. These are separate from browsing or claiming an app and may use credits or a paid plan.",
      },
      {
        q: "Where can I see pricing and manage billing?",
        a: "Current Rocket plans and credits are listed on Pricing. Signed-in users can manage their Rocket billing from Settings. An independent app's own subscription is separate unless it explicitly uses Rocket payments.",
      },
      {
        q: "Can I disconnect a provider or revoke an app?",
        a: "Supported provider connections and sharing controls live with the relevant app in My Apps. You can view and revoke third-party app authorization from Connected Apps in your Rocket account.",
      },
      {
        q: "How do I get help?",
        a: "Send us a message through Contact. Include the relevant Rocket or app URL and a short description, but never send passwords, API keys, or payment-card details.",
      },
    ],
  },
];
