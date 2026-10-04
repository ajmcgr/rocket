# Slice 3 Stripe revenue verification preparation

Status: architecture and metric definition only. No Stripe App has been created, uploaded, installed, or used to access a founder's account. No MRR is public or marked verified. This is independent of Rocket Developer payments and Rocket's own billing.

## Installation model

Build a **public Stripe App** using `stripe_api_access_type: "oauth"` and an exact HTTPS callback. The founder must install it on **their own Stripe account**; an installation on Rocket's Stripe platform account must not be treated as permission to read founders' connected accounts. Store the Stripe account ID and rotated OAuth refresh token under a server-only encrypted boundary. The Rocket app owner must independently prove Rocket app ownership and explicitly select the Stripe products/prices that belong to that app. A Stripe account alone is never an app identifier.

Minimum proposed read permissions for the first controlled proof: `subscription_read` to enumerate current subscriptions and items; `product_read` and `plan_read` to inspect the product/price catalog for explicit mapping. Confirm these against the Stripe CLI's current permission checker when building the manifest. Request no write, charge, payout, balance, customer, or Rocket Developer permissions. Add `invoice_read` only if the controlled test demonstrates that subscription/discount objects do not contain enough information for the frozen definition below. Do not ask a founder to paste a secret key.

The next integration needs a separate `stripe_revenue_connections` table, a service-only encrypted credential, `app_stripe_product_mappings` keyed by Rocket app and Stripe account/product/price, private calculated points, privacy controls defaulting to PRIVATE, and a consented public projection. A product/price cannot be mapped to two Rocket apps under the same owner without explicit review. Disconnect must remove credentials and public verification without deleting historical private evidence.

Stripe's external testing is for public apps uploaded from a live account, supported sandbox, or test-only account, with at most 25 testers; a v1 Connect test account cannot host that external test. The external tester must install the app on the account whose subscriptions will be measured. Rocket needs its own Stripe App registration, app ID, test OAuth install link, exact callback, and developer test account before this proof can run. Broad Marketplace distribution requires Stripe review; it is not equivalent to external testing.

## Frozen V1 metric: Subscription MRR

Subscription MRR is the monthly-normalized **currently billable recurring subscription amount** for **only the founder-selected products/prices belonging to one Rocket app**, in the subscription's original currency. It is not cash received, revenue, profit, or Rocket Developer transaction volume. Calculate at a dated snapshot using a versioned formula; store the Stripe account, selected product/price mapping version, currency, status basis, and observation time privately.

- Include `active` subscriptions. Exclude `trialing` until the first billable period begins. Exclude `past_due`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`, and `canceled` from **verified billable** MRR; report their excluded counts privately.
- A subscription set to cancel at period end remains included until its paid period ends; then it is excluded.
- Sum mapped licensed recurring item unit amounts times quantities. Divide a month-interval price by its `interval_count`; divide a year-interval price by `12 × interval_count`. Any other recurring interval, tiered pricing, usage-based component, or quantity that cannot be determined precisely must be excluded and surfaced as unsupported, not guessed.
- Apply only currently effective deterministic recurring discounts/coupons attributable to mapped items, using Stripe's documented discount order. If discount allocation is ambiguous across mapped and unmapped items, do **not** mark that subscription's contribution verified. A one-time discount is not a continuing MRR reduction once exhausted.
- Exclude tax, shipping, one-time invoice items, one-time payments, application fees, and refunds from MRR. Refunds are cash adjustments, not recurring contract value; a refunded/canceled subscription's status controls inclusion.
- Keep currencies separate. No automatic FX conversion or cross-currency single MRR number in V1. Never combine values from another product/business in the same Stripe account.
- Historical points are snapshots, not retroactively rewritten when a founder changes a mapping. Mapping changes create a new version and require re-verification.

The formula deliberately fails closed when Stripe's actual subscription configuration cannot support a defensible calculation. The first controlled founder test must validate discounts, annual normalization, mappings, and status handling against Stripe's API before any badge or public value ships.

## Sources and approval gates

- [Stripe Apps architecture and permission boundary](https://docs.stripe.com/stripe-apps/how-stripe-apps-work)
- [Stripe Apps OAuth installation and token rotation](https://docs.stripe.com/stripe-apps/api-authentication/oauth)
- [External test eligibility and limits](https://docs.stripe.com/stripe-apps/test-app)
- [Stripe subscription status and item fields](https://docs.stripe.com/api/subscriptions/object)
- [Stripe prices and recurring intervals](https://docs.stripe.com/api/prices)

No external Stripe App was created in this commit. An external test requires the operator to create/upload the least-privilege app and provide non-secret app identifiers/configuration; secret values must be configured directly in the server environment, never sent in chat or committed.
