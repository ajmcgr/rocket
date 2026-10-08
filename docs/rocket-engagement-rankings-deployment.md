# Rocket engagement rankings deployment

Production project: `lcujmvdgczkjxdstzhnr` (Rocket).
PR: https://github.com/ajmcgr/rocket/pull/36
Preflight main: `a899f02092df983393d978392647fd66ad7e2f35`.

## Database deployment — 2026-10-08

Applied the reviewed SQL through the Supabase migration API. The production
migration history records `20261008093200`, name `rocket_engagement_rankings`.
The repository filename matches this recorded version; its SQL is unchanged.

The migration adds only `app_graph.rank_marketplace_apps(text,integer)` and
`public.get_public_app_rankings(text,integer)`, their execution grants and a
function comment. It creates no triggers and performs no data writes. Existing
DDL event triggers were inspected: relevant events only reload the PostgREST
schema cache; no email or external request is dispatched.

The public invoker wrapper returns app IDs and ordinal positions. The private
definer helper has an empty search path and reads eligible public listings,
published review counts, current bookmark counts and distinct buyers with
existing settlement proof and matching merchant/product/client bindings.
It exposes no scores, buyer identities, private purchase totals or revenue.

## Production verification

- Before/after fingerprints match for every existing public/app_graph table's
  RLS flags and grants, all policies, views and existing functions.
- Full row fingerprints match for transactions, purchase grants, entitlements,
  entitlement events, products, checkout configuration and metric visibility.
- Public checkout remains disabled (`live_checkout_enabled = false`).
- Read-only transactions exercised both `anon` and `authenticated`: ranking
  reads, public eligibility, limit and category-filter assertions passed.
- Both roles still lack SELECT on the private transaction/grant/entitlement
  tables and EXECUTE on the settlement helper.
- Supabase security advisor comparison found no new findings (122 existing
  findings before and after). Unrelated findings were not changed.
- The isolated PostgreSQL suite passed all 25 checks again after the migration
  filename reconciliation.

No Edge Functions, Stripe configuration, financial records, entitlements,
products, metric visibility or auth configuration were changed. No production
test content was created. Frontend publication is performed manually by the
user after merge; database deployment alone does not publish the frontend.

## Rollback boundary

Before frontend publication, drop the public wrapper followed by the private
helper using a separately tracked rollback migration:

```sql
drop function public.get_public_app_rankings(text, integer);
drop function app_graph.rank_marketplace_apps(text, integer);
```

After frontend publication, restore the previous frontend first, then apply
those drops. Do not drop or rewrite any underlying tables or views. No database
restore is needed for this function-only rollback. This record is not evidence
of a platform backup or PITR recovery point.
