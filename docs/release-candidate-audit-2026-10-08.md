# Rocket release-candidate audit — 8 October 2026

## Outcome

The audited source now passes its complete automated suite and production build. This branch fixes the source-level regressions found during the audit, but it does not deploy a migration, Edge Function, frontend, Stripe configuration, or checkout change.

## Verified

- The full suite passes: 97 test files and 391 tests.
- The production build succeeds and regenerated the sitemap for 5,719 public app profiles.
- The existing isolated marketplace tests passed for RLS, cross-user access denial, replay prevention, refunds, one-time ledger behaviour, rankings, collections, and analytics isolation.
- Controlled User B remains a normal non-admin account and is denied `/admin` access.
- Live checkout remains disabled. No purchase, payment, refund, entitlement, review, or analytics data was fabricated.
- Natural scheduled Launch catalogue and GA4 imports both completed successfully during the audit window.

## Source fixes in this branch

- Align the Launch Pro acceptance UI and its tests with the canonical $39 one-time purchase. The UI no longer describes a $1/month subscription.
- Repair the stale Launch acceptance endpoint tests so they validate the one-time checkout, payment intent, grant, exact amount, and external fulfilment checks currently enforced by the function.
- Add `/rankings`, redirecting it to the existing Rankings discovery view. The live site previously returned a 404 for this route.
- Remove disabled `Buy` controls from marketplace cards while public checkout is unavailable, and use clean slug URLs for the remaining View controls.
- Add `noindex, nofollow` metadata to the authenticated Library and My Apps routes.
- Advertise `entitlements:read` in the Rocket OIDC discovery document, matching the scope used by the active Launch client.
- Refresh tests that had retained obsolete assumptions about the former shell and badge URLs.

## Remaining release boundaries

These items require a separate deployment or product decision and were intentionally left unchanged:

1. The OIDC discovery-source correction is in `rocket-connect-discovery`; it takes effect only after that Edge Function is deployed. The branch does not deploy it.
2. The audited production Edge Functions are not fully synchronized with `main`. Eight of 31 checked functions differ, including Rocket Connect shared behaviour. Reconcile and deploy those deliberately, function by function, with post-deploy checks.
3. Production frontend assets cannot yet be proven byte-for-byte identical to the current source build. Publish the merged frontend through the normal Lovable workflow, then re-check key public routes.
4. Public checkout stays disabled. There are no verified production marketplace purchases, so a real one-time Launch Pro purchase/refund validation remains pending the separately approved transaction.
5. Supabase security advisories still flag the older `ymh_bids_public` security-definer view and disabled leaked-password protection. They were outside the reviewed marketplace migration and should be remediated in a dedicated security change.
6. The repository-wide lint command remains outside a clean release baseline because of widespread pre-existing Prettier violations. This branch was checked with the full test suite and production build; format remediation should be a dedicated mechanical cleanup.

## Recommended follow-up order

1. Merge this branch and publish the frontend through Lovable.
2. Deploy and verify `rocket-connect-discovery` separately.
3. Reconcile the remaining deployed Edge Function drift before treating the Rocket Connect integration as release-ready.
4. Keep public checkout disabled until the separate controlled Launch Pro transaction has completed and been verified.
