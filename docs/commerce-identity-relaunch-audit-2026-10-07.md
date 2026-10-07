# Commerce and identity completion audit — 7 October 2026

## Verdicts

| Phase | Verdict | Evidence / remaining boundary |
| --- | --- | --- |
| 1 — Revenue Stripe App | IMPLEMENTED — E2E PENDING HUMAN/EXTERNAL ACTION | Local manifest validation and 17 revenue tests passed. `rocket-stripe-revenue` v10 is deployed. Publisher account, upload, scopes granted by Stripe, external installation and real sync remain unverified. |
| 2 — Buy with Rocket | FAIL — live acceptance incomplete | 61 commerce/setup/Library regressions and isolated PostgreSQL settlement tests passed. `rocket-buy` v14 is deployed with buyer-scoped one-time Library entries. No new Launch Pro product exists; merchant Stripe readiness and natural live payment/fulfilment remain unverified. This is not READY FOR AUTHORIZED LIVE PURCHASE. |
| 3 — Rocket ID | E2E PENDING HUMAN ACTION | Public discovery/JWKS checks, exact production Launch callback/scope/S256/state/nonce checks and seven isolated Launch identity/access tests passed. Natural consent, actual buyer session, revocation/re-login and retained paid access remain unverified. |
| 4 — Competitive audit | COMPLETE, qualified by the incomplete live acceptance above | Documentation-based comparison below, not a claim that Rocket's live flows are finished. No competitor-inspired features added. |

## Completed safe fixes

- The buyer Library now includes production one-time purchase grants, independently from subscription entitlements. Buyer and product/client isolation are enforced; test clients are excluded. Cards show the actual amount/currency and one-time status, use stable purchase IDs, and do not offer subscription cancellation for one-time purchases.
- Production setup accepts one-time, monthly and annual products. One-time registration requires the merchant's exact approved payment-return URL. Registration does not activate a product or change the public checkout gate.
- The generated developer integration prompt includes only public facts from the selected app's registered products. Inactive products are identified as inactive. It specifies the existing client-bound `purchases` contract and atomic fulfilment keyed by purchase ID without requiring a particular database/session architecture. Missing products remain missing, not invented.
- Existing subscription checkout/cancellation behaviour remains unchanged in regression tests. PostgreSQL settlement testing proved one unit across ten replays, refund non-resurrection, client/mode isolation and service-only privileges. These were isolated fixtures, not production transactions.

Validation: 61 targeted Rocket tests; seven Launch identity/access tests; isolated PostgreSQL ledger test; TypeScript check; development client/server build. Public OAuth inspect requests issued no consent grant, authorization code or token. Backend deployed source was re-read and matched the reviewed change.

## Account, financial and privacy isolation

| System | Account / responsibility |
| --- | --- |
| Main Rocket | `acct_1TfvwfL9pkHWyRRu`: SaaS, $99/year Developer, Stripe Connect, Buy with Rocket and application fees. |
| Rocket App | `acct_1UNYZnLTVhRPFrYe`: dedicated Stripe Apps publisher and read-only revenue verification only. |
| Rocket ID | Existing OAuth/OIDC identity system, independent of the Stripe publisher account. |

These are the required account assignments, not a claim that current live secrets were verified against both accounts. No Stripe account authentication, API account calls, upload, agreement acceptance or credential modifications were performed in this audit. No existing Create subscriber, credit balance, subscription, billing product or public metric visibility was changed.

Revenue App manifest ID: `com.worksapp.rocket-revenue-verification`, version `0.1.0`. This is the prepared ID, not a confirmed Stripe registration. Requested permissions are exactly `subscription_read`, `product_read`, `plan_read`; no evidence yet of Stripe approving/granting them. Exact OAuth redirect: `https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-stripe-revenue`. [Stripe permission reference](https://docs.stripe.com/stripe-apps/reference/permissions).

Read-only production database inspection found zero revenue connections and zero public revenue projections. Connection secrets remain server-side; test snapshots remain private. Disconnect removes Rocket's binding and projections, clearing encrypted credentials when the last binding is removed. Provider-side uninstall/revocation must also be verified in Stripe; local disconnect alone is not evidence of that.

The public commerce gate remains **false**, with the configured server application fee **500 bps (5%)**. The inactive legacy $39/month Pro product was not altered. Launch's approved new product is **$39 USD one-time**, exact client `rocket-dev-fZfbAEjB3Kp_eroMLQ_y4_fn`, return `https://trylaunch.ai/my-products?success=true`; it is **not registered**, so no new UUID/product key can be supplied.

Launch's deployed `launch-rocket-access` endpoint currently verifies a configured subscription acceptance resource, not a $39 one-time Launch Pro fulfilment. Its real one-unit fulfilment still needs implementation/acceptance against the eventual canonical product. The payment-return URL is never proof of payment. Rocket ID revocation invalidates identity access/codes without canceling payment subscriptions; natural revoke/re-authenticate acceptance remains pending.

## Focused competitive audit

| Comparison | Documented competitor capability | Rocket assessment / relaunch implication |
| --- | --- | --- |
| Google identity | OIDC discovery, ID-token validation and anti-forgery state; official client libraries. [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect). | Rocket has the relevant protocol controls and client-bound paid access. That connection to purchased access is its narrower positioning; do not claim identity maturity or adoption parity without natural production proof. |
| Apple identity | User-controlled private email relay alongside sign-in. [Apple relay documentation](https://developer.apple.com/documentation/signinwithapple/communicating-using-the-private-email-relay-service). | Do not imply Rocket offers Apple's email-relay privacy feature. Rocket can request minimal scopes; Launch currently requests no email scope. |
| Clerk / Auth0 developer experience | Clerk documents user synchronization via webhooks; Auth0 provides stack-specific quickstarts. [Clerk syncing](https://clerk.com/docs/guides/development/webhooks/syncing), [Auth0 quickstarts](https://auth0.com/docs/quickstarts). | Rocket's app-specific, AI-native prompt and hosted button kit are useful integration aids, not proof of plug-and-play completion. Registered product facts and a tested callback are essential. The updated prompt closes a factual gap; actual installation proof is still missing. |
| Stripe Connect commerce | Direct charges live on the connected merchant account, with platform application fees and asynchronous webhook fulfilment. [Stripe direct charges](https://docs.stripe.com/connect/direct-charges?platform=web&ui=stripe-hosted). | Rocket extends that architecture with identity, product/client isolation and a buyer Library. Its 5% platform fee is separate from processing; actual account fee responsibility still requires verification. Do not advertise a merchant-of-record or tax-handling service. |
| Lemon Squeezy | It acts as merchant of record, taking payment/tax/refund/chargeback responsibilities. [Merchant of record](https://docs.lemonsqueezy.com/help/payments/merchant-of-record). | Different operating model. Rocket cannot claim equivalent seller compliance coverage from its Connect integration. Comparison must explain merchant responsibility, not just transaction fees. |
| Paddle lifecycle | Access provisioning uses verified webhook state, deduplication and cancellation-effective dates; one-off transactions require transaction handling. [Paddle access provisioning](https://developer.paddle.com/build/subscriptions/provision-access-webhooks/). | Rocket implements corresponding replay-safe payment-ledger controls and paid-period access rules. The unresolved competitive gap is live operational evidence, not missing UI features. |

Assessment (inference from inspected implementation and cited documentation): position Rocket narrowly as discovery-linked identity and purchasing for independent apps. The immediate relaunch blockers are verified publisher installation, real merchant readiness and natural identity/payment fulfilment. A new design, extra providers or more marketing copy would not establish that evidence. No recommendation here was implemented as a new feature.

## Smallest next owner actions

1. Continue in a chat with an authorized connected Stripe browser. Open `https://dashboard.stripe.com/acct_1UNYZnLTVhRPFrYe/apps/created` and confirm the account ID is exactly `acct_1UNYZnLTVhRPFrYe` before any CLI login/upload. This session exposes no connected browser controls; the earlier denial's policy origin cannot be re-tested or identified here. Do not substitute CLI/API access to bypass it.
2. If that publisher account prompts for the Stripe Apps Agreement, the owner must read/accept it. Stop for any additional agreement or permission expansion. Then finish normal upload/external-test installation with only the three requested read permissions, an independent tester, secure matching App secrets, and private sync/disconnect acceptance. [External testing](https://docs.stripe.com/stripe-apps/test-app), [review requirements](https://docs.stripe.com/stripe-apps/publish-app).
3. In the separate Main Rocket account, inspect existing Connect readiness/webhook delivery without changing billing. Only the owner handles any requested business verification, bank details or binding account action. The inactive subscription must remain untouched when registering the new one-time product.
4. Once a real canonical product, merchant readiness and Launch one-unit fulfilment are verified, present the full purchase summary (app, merchant, product, price, fee, processing, buyer, pre-access, live mode, total, post-access) and wait for **AUTHORIZE LIVE PURCHASE**. No real-money action is authorized by this audit.
5. After that natural purchase, prove exactly one unit, Library/Open App, identity revocation without payment cancellation, and re-login with the same subject/paid access. Do not fabricate transactions, manually grant entitlements, or mark integration/public gates ready using fixtures.

Frontend changes were pushed with the safe backend change; backend deployment is verified. Hosted frontend publication must be separately confirmed through the existing hosting pipeline—local build success and GitHub push are not proof that the public website serves the new UI.
