# Rocket Revenue Verification — account setup pending

This is a backend-only, read-only Stripe App. It is independent of Rocket billing, Buy with Rocket and Connect. No Stripe account has been created, authenticated, uploaded to, or modified by this package preparation.

## Local preparation

- `stripe-app.json`: v1 manifest for the documented OAuth Apps workflow.
- `stripe-app.yaml`: equivalent v2 manifest; use only if the installed CLI supports it.
- `validate.mjs`: offline policy checks; run `node stripe-revenue-app/validate.mjs` from the repository root.
- Run the revenue unit tests with `vitest run src/lib/stripeRevenueOAuth.test.ts src/lib/stripeRevenueManifest.test.ts src/lib/stripeRevenueValidation.test.ts`.

Both manifests request exactly `subscription_read`, `product_read`, `plan_read`, and the callback is:

`https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-stripe-revenue`

Stripe must still validate the upload, global app ID, account eligibility and package requirements. Marketplace artwork (a matching 300×300 PNG logo), listing screenshots and reviewer evidence are not supplied here; do not invent them or reuse Stripe's branding.

Prepared locally on 2026-10-06: official `@stripe/cli` 1.53.0 at `/private/tmp/rocket-stripe-cli.0yURFq/node_modules/.bin/stripe`, Apps plugin 1.20.0. This temporary CLI location may be cleaned by macOS; reinstall from the official package if absent. Version/help only were used; no login or account operations were performed. Upload help has no offline-validation switch. Never pass `--force` to skip validation or `--accept-tos` without action-time user approval.

## Account workflow — blocked until browser permission is resolved

The connected Chrome tool denied `https://dashboard.stripe.com` with “A saved user permission setting blocks this action.” It exposes no matching rule ID or provenance. Do not use CLI/API, another browser or raw CDP to work around this denial.

Once access is genuinely permitted:

1. In an authorized connected browser, verify the exact publisher account ID is `acct_1UNYZnLTVhRPFrYe` (Rocket App) before CLI authentication, upload, app/version registration or distribution changes. A matching account name alone is insufficient; stop on any mismatch. Keep Main Rocket `acct_1TfvwfL9pkHWyRRu` exclusively for SaaS/Developer billing, Connect and Buy with Rocket. Never load or change its credentials for this App. Do not open another financial/business account without the user's action. If this publisher account asks for a Stripe Apps Agreement, stop for action-time owner acceptance; prior acceptance in another account is not sufficient.
2. Ask the user to complete CLI login approval for that account. Never load existing billing credentials as a shortcut. Discover current commands with `stripe --help`, `stripe plugin install --help`, `stripe apps --help` and `stripe apps upload --help`.
3. Use the supported manifest and perform Stripe upload validation from this directory. Do not declare upload readiness until Stripe accepts it. Any required package/artwork changes remain local until reviewed.
4. Open Created apps → this app → External test → Get started. Use an independent controlled tester account. Obtain its Test OAuth authorize link, and the matching app developer test-mode key. Ask at action time before granting the App access.
5. Save test OAuth URL, test developer key, a unique 32-byte base64url encryption key and the exact pilot app UUID in Supabase Edge Function secrets. Never paste keys into chat, logs, manifests or shell arguments. See `../docs/slice3-stripe-revenue-deployment.md`.
6. Deploy reviewed backend source and prove consent → one-time state → token exchange → encrypted storage → exact price mapping → sync → private snapshot against the tester's subscriptions.

## External acceptance checklist (all pending)

- Wrong/expired/replayed state fails; wrong account, mode or OAuth scope fails.
- Missing/incorrect credentials produce configuration errors without secret disclosure.
- Token refresh preserves account and mode; concurrent refresh does not lose rotation.
- Map two Rocket apps on the same Stripe account; prove price isolation and uniqueness.
- Compare monthly/annual quantities, zero subscriptions, mixed currencies and cancellation with actual Stripe data. Discounts, tiers, metering and unsupported intervals must not become verified figures.
- Revoke ownership, change mappings and disconnect; verify public projection removal.
- Test data stays private for every visibility setting. A live snapshot requires a live account, fresh supported evidence and explicit owner-selected public visibility.
- No payment, charge, payout or write capability. No billing or Connect credential reuse.

## Marketplace review draft (not a submission)

Name: **Rocket Revenue Verification**

Subtitle: **Verify selected-app subscription MRR with read-only access.**

About: Rocket helps people discover software. Developers can connect selected recurring Stripe prices to their domain-verified Rocket listing. Rocket calculates subscription MRR separately by currency. Metrics remain private unless the owner chooses to share them. This integration does not process payments or modify subscriptions.

Prepare before submission: activated eligible dedicated developer account; matching square logo; screenshots using synthetic data; working public OAuth onboarding URL; reviewer access to a domain-verified Rocket app; tested disconnect flow; actual privacy/support URLs; permission explanations; frozen MRR calculation and limitations; external acceptance evidence. Do not fabricate approval, customer data, support details or a completed test.

Source: [Stripe manifest reference](https://docs.stripe.com/stripe-apps/reference/app-manifest), [OAuth](https://docs.stripe.com/stripe-apps/api-authentication/oauth), [upload](https://docs.stripe.com/stripe-apps/upload-install-app), [Marketplace review](https://docs.stripe.com/stripe-apps/publish-app).
