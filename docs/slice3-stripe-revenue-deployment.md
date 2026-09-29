# Slice 3 Stripe revenue verification — controlled test setup

This is **read-only revenue verification**, not Rocket Connect Payments or Rocket's own billing. Do not point it at the existing Rocket Connect platform account, connected developer account, or payment credentials.

## Frozen Subscription MRR v1

At each dated snapshot, for each explicitly mapped Stripe price and currency, sum only `active` subscriptions' licensed, fixed `per_unit` recurring items. Multiply `unit_amount_decimal` (Stripe minor units) by item quantity; divide by `interval_count` for monthly prices or by `12 × interval_count` for annual prices. Retain six decimal places of the minor unit and round half-up only after multiplying by quantity. Keep currencies separate; no FX conversion. A period-end cancellation remains included while the subscription is active and before its cancel time. Exclude trialing, past-due, unpaid, incomplete, paused, canceled, and other nonactive subscriptions, and subscriptions with paused collection.

If any relevant active subscription has a discount, tiered or metered price, transformed quantity, unsupported interval, missing quantity/amount, changed product/currency, or more precision than the formula can represent, the **entire affected currency snapshot is unsupported** and cannot be public. Discounts are intentionally not approximated in v1. Taxes, shipping, one-off charges, refunds, Rocket application fees, and cash receipts are not MRR. This is a recurring subscription run-rate, not realized revenue or profit. Each mapping edit increments a version and invalidates the prior public projection. Historical private points are never relabeled as new mapping evidence. A completed test calculation is stored as sandbox evidence only; it is never public verification.

## Stripe App configuration (human action required)

Create a **separate read-only Stripe App integration** when a suitable existing developer account and a genuine external founder account are available. Do not create another Stripe business/account solely for the test, and do not use Rocket Connect Payments credentials. A public-distribution, back-end-only Stripe App with `stripe_api_access_type: "oauth"` is the intended integration. Set its exact HTTPS redirect URI to:

`https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-stripe-revenue`

Request only these read permissions in its manifest:

- `subscription_read` — read subscription status, items, quantities, and discounts for MRR.
- `product_read` — show product names and verify price-to-product bindings.
- `plan_read` — list/retrieve prices and intervals.

No write, charge, customer, invoice, payout, balance, webhook, or Connect-account permission is requested. The account administrator who installs the app must accept these permissions. The Stripe App must be uploaded and an **External test** configured; use a controlled, independent Stripe account as tester. Stripe's external test is capped at 25 testers and does not constitute general publication. A v1 Connect test account cannot host the external test. Stripe Marketplace review is needed for general availability, not for this controlled external test.

A minimal v2 manifest is prepared at `stripe-revenue-app/stripe-app.yaml`. Its app ID is a proposed unique identifier and must be confirmed by Stripe when the app is created. It has no Dashboard UI extension and no payment permissions. A same-account self-install does not prove least-privilege permission grants; defer external acceptance until an independently owned Stripe account installs the App.

The backend needs the **test OAuth install URL** from Stripe's External test tab and the app developer test-mode API credential for one-time code exchange and refresh. Configure them directly in Supabase Edge Function secrets, never in the frontend, GitHub, chat, or logs:

- `STRIPE_REVENUE_TEST_OAUTH_URL` — the exact test OAuth authorize link, on `https://marketplace.stripe.com/oauth/v2/authorize` with its Stripe App `client_id`.
- `STRIPE_REVENUE_APP_TEST_API_KEY` — the separate Stripe App developer account's test-mode API credential required by Stripe's OAuth token endpoint. **Do not reuse any Rocket Connect payment key.**
- `STRIPE_REVENUE_TOKEN_ENCRYPTION_KEY` — a separate 32-byte base64url AES-GCM key. Do not reuse the GA4 key.
- `STRIPE_REVENUE_FRONTEND_ORIGIN` — `https://tryrocket.ai` (optional; the function defaults to this).
- `STRIPE_REVENUE_PILOT_APP_IDS` — optional comma-separated exact Rocket app UUIDs. Leave unset during the safe infrastructure deployment; the owner UI shows **Coming soon** and all connection actions are rejected. Enroll only a controlled, domain-verified external founder app when the least-privilege pilot is ready. This is independent of OAuth credentials.

No secret values belong in this document. If the Stripe App cannot be created in a separate account or the requested read permissions cannot be granted, stop rather than substituting a platform secret or Connect credentials.

## Deployment order

1. Apply `20260929075313_slice3_stripe_revenue_verification.sql` to Rocket's Supabase project. Check that every private table denies `anon` and `authenticated` access and that `public_app_revenue` is empty.
2. Deploy `rocket-stripe-revenue` with `verify_jwt = false`. The function validates Rocket Auth for every owner action and uses a one-time OAuth state for the callback.
3. Publish the frontend with `/my-apps/:id/revenue` and the public profile projection query.
4. Leave `STRIPE_REVENUE_PILOT_APP_IDS` unset until a real external least-privilege pilot is ready. Connect reports **Coming soon** and cannot start even if OAuth credentials happen to be configured; no data is marked verified.
5. Using a **domain-verified Rocket app owner**, install the App on the controlled independent Stripe tester account. Map exact recurring price IDs to that Rocket app. A price may not be mapped to two Rocket apps on the same Stripe account.
6. Sync and compare the private snapshot to Stripe subscriptions. Test a second Rocket app on the same Stripe account to prove mapping isolation. Test unsupported discount and tiered cases, disconnect, changed mapping, and owner revocation. Sandbox snapshots must not appear in `public_app_revenue` regardless of visibility setting.
7. Only after Stripe App publication/review and a separate authorized **live** OAuth flow is implemented should live snapshots be eligible for the public badge. The current Edge Function intentionally rejects live OAuth responses.

## Rollback

The new function and route can be disabled without touching GA4, Rocket Connect Payments, or Rocket billing. If deployed, set all revenue visibility to private, clear `public_app_revenue`, and disable the revenue Edge Function/frontend route before considering a schema rollback. Do not delete historical private points or Stripe payment records as part of rollback.

## Current boundary

The source implementation and fixtures are prepared; Stripe App creation, external-test installation with an independent founder account, real OAuth, and a controlled account sync are pending. No mock amount may be shown on a production public profile. Production `/my-apps` access still requires Rocket domain verification; the paused `trylaunch.ai` GA4 acceptance test is unchanged.
