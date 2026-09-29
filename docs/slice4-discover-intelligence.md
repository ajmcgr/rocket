# Discover intelligence V0

Slice 4 uses public Launch evidence only. It does not use Launch page views as traffic, Launch `verified_mrr` as Rocket-verified revenue, or private GA4/Stripe measurements.

## Source and coverage at preflight (2026-09-29)

- Rocket: 5,406 public apps; launch date 5,406; category 5,405; tags 3,667; platforms 4,822.
- Rocket launches: 181 in 7 days, 738 in 30 days, 1,997 in 90 days; 676 in the preceding 30 days.
- Launch exposes `product_vote_counts`, a public aggregate of net and total votes. Of 5,992 public Launch products, 5,766 have a vote row. Missing vote rows sync as zero.
- Launch's 30-day vote distribution is heavily concentrated at one vote. An app needs at least three net votes before it can qualify as Rising.

## Deterministic signals (calculation version 1)

The daily Launch sync imports public net/total vote counts by Launch product ID into the existing private source evidence. It never changes canonical identity or ownership because of a vote. One transaction refreshes the two derived tables after a successful vote sync.

Apps are split into launch-age bands `0-7`, `8-30`, and `31-90` days. The primary category is the first stable alphabetically sorted category from Slice 1. Compare vote counts within the same age band and primary category when the category cohort has at least 20 apps; otherwise use the whole age band. A product signal is published only when the selected cohort has at least 50 apps. Percentile is PostgreSQL `percent_rank` of net votes (ascending); ties share a percentile.

- **Rising on Launch:** launched within 30 days, at least three net Launch votes, and at or above the 90th percentile of the selected age cohort.
- **New & interesting on Launch:** launched within seven days, at least two net Launch votes, and at or above the 90th percentile of the selected age cohort.
- **Category activity:** count launches in the latest 30 days and preceding 30 days per category; publish only categories with at least ten in each period. Volume change is `(recent - previous) / previous × 100`. Also store recent vote median and recent catalogue share. This measures Launch/Rocket founder listing activity, not customer demand.

Every app signal stores source, net votes, cohort, cohort size, percentile, source observation time, calculation time and version. Public views are security-invoker and inherit private table RLS. If refresh fails, its transaction rolls back and the previous snapshot remains.

## Saved Apps

`public.saved_apps` has one row per `(user_id, app_id)` with `saved_at`. RLS limits reads, inserts, and deletes to the signed-in owner; inserts also require a public app. Saved Apps is distinct from creative-design `/saved`. The view reads current app details and current signals rather than copying a card at save time.

## Operations and rollback

Daily GitHub workflow: Launch catalogue sync → public vote aggregate sync → intelligence refresh. On failure, the workflow reports an error; the last successful derived snapshot remains. The source catalogue does not depend on the intelligence tables.

To roll back presentation, revert the frontend and importer commit. Keep the additive saved-app and derived tables so user saves and source evidence are not lost. A later targeted migration can retire unused tables only after data retention has been reviewed.
