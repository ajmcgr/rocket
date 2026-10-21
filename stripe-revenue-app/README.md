# Rocket Revenue Verification

This backend-only Stripe App gives Rocket developers a read-only way to verify
subscription revenue for selected app plans. It does not process payments,
modify subscriptions, or use Rocket's production payments account.

## v0.1.2 package

- `stripe-app.json` is the Stripe Apps v1 manifest used by the CLI.
- `stripe-app.yaml` is the equivalent v2 manifest reference.
- `rocket-icon.png` is Rocket's existing official mark from
  `public/rocket-sidebar-icon.png`, resized to Stripe's 300 × 300 PNG
  requirement.
- `package.json` and `package-lock.json` let Stripe's packager include and
  validate this manifest-only package. There are no npm dependencies.
- `validate.mjs` checks the manifest's identity, callback, permissions, icon
  reference, PNG format, and dimensions offline.

The app ID is `com.worksapp.rocket-revenue-verification`. Upload new versions
from publisher account `acct_1UNYZnLTVhRPFrYe` only. Do not use the separate
Rocket payments account `acct_1TfvwfL9pkHWyRRu`.

## OAuth and credentials

Published installs use Stripe's public Marketplace OAuth endpoint. The app
uses its registered public client ID and exact registered callback; Rocket
creates a random, mode-prefixed state, stores only its hash for ten minutes,
and validates it on callback. The `external_test` installation selection
continues to use the existing test OAuth link and test API key. New public
Marketplace installs use the live app API key only after the live feature gate
is enabled. Never reuse a Rocket billing or payments credential.

In Supabase project `lcujmvdgczkjxdstzhnr`, the public Marketplace client ID is
configured. The dedicated live app key and `STRIPE_REVENUE_LIVE_ENABLED=true`
remain owner configuration steps; the public flow stays unavailable until
both are set. Test credentials and the pilot allowlist remain in place.

## Checks

Run `node stripe-revenue-app/validate.mjs` from the repository root and run
the focused OAuth, manifest, and callback validation tests. The official Stripe
Apps upload command performs Stripe-side validation and packaging; a local
check is not proof of a successful upload.

The app is data-only and has no Stripe Dashboard UI extension, so it does not
add a drawer screen or settings page. Listing artwork, reviewer setup, and
Marketplace publication remain separate from package upload. Do not submit a
Marketplace review until the logo, public OAuth configuration, live app
credential, and reviewer flow are ready.
