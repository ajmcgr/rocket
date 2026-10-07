# Homepage merchandising validation — 7 October 2026

## Scope and release boundary

Homepage composition only. Discover, navigation, global theme, financial state,
Stripe, Rocket ID, merchant bindings, checkout gates and metric visibility are
unchanged. No database migration or Edge Function deployment is required.

Reuse current public projections, cards, save controls, editorial administration,
Launch signal methodology and Rocket profile-view ranking methodology.

Homepage public shelves render through a deferred SSR loader: hero/search do not
wait for optional shelves or auth. Personal shelves hydrate separately and reset
on user changes. Public queries are bounded and independently tolerate errors;
app/media lookup is batched, not per card. Verification-only metric values are
removed from serialized homepage data, not merely hidden with CSS.

## Actual production inventory (read-only audit)

| Input | Eligible/current supply | Homepage behavior |
| --- | ---: | --- |
| Active public Rocket Picks | 0 | Hide until editors publish genuine picks |
| Existing Rising signals | 13 | Show six; explicit imported Launch vote attribution |
| Existing new-interesting signals | 4 | Require recent Rocket listing, description, logo and media |
| Rocket profile-view ranking rows | 5,690 | Show eight in unchanged approved order |
| Public verified usage apps | 1 | Hide Proven Traction until at least three distinct eligible apps |
| Public editorial collections | 0 | Hide; require a real editorial label and at least two eligible apps |
| Populated public user collections | 0 | Hide; community frontend remains a separate unreleased change |
| Users with follows / app release notes | 0 / 0 | Hide until a signed-in visitor has real followed-developer updates |
| Successful production purchases | 0 | Do not render Popular Purchases or imply test transactions are sales |

New & Noteworthy means **new to Rocket**, not newly released. Rising is cohort
percentile/net Launch votes, not verified Rocket growth/usage. Top Apps means
Rocket profile views, not installs or purchases. No selections, scores, reviews,
growth rates, communities or endorsements were invented.

Personalization reuses owner-filtered saved_apps and marketplace_follows plus
ownership-backed get_public_member_apps and public app_releases. It does not
introduce browsing history or a recommendation/ownership system.

## Verification

- Twelve new tests: ordering, empty gates, recent/media eligibility, current
  discoverability, truthful signals, distinct evidence threshold, serialization
  privacy, real editorial labels, optional query failure, anonymous/private
  separation, empty personalization, and user switch/sign-out cleanup.
- TypeScript check passes.
- Final clean full suite: 317 passed, five unchanged Launch pilot failures
  across 82 test files. All twelve new merchandising tests pass.
- Clean release build excludes unrelated Collections work. Generated route tree
  must come from this clean build, not the dirty worktree's mixed generated file.
- Anonymous real-public-data browser checks pass at 320, 375, 390, 430 and 1440px:
  no horizontal overflow or page errors; no private-state requests; real shelves
  in SSR HTML; /rising and /picks respond successfully.
- Real signed-in browser acceptance remains unverified: no authorized connected
  browser session is available to this task. Controlled component tests are not
  a substitute for that check.

### Existing Launch failures

The same five failures reproduce on unchanged origin/main d7b37bc, with no
homepage code present:

1. launchAcceptance.test.ts: binds the exact plan to Launch, its owner and current merchant.
2. launchAcceptance.test.ts: requires a new live paid transaction with its exact unrevoked future entitlement.
3. launchAcceptanceEndpoint.test.ts: owner, other buyer, prior purchase and absent terms cannot initiate checkout.
4. launchAcceptanceEndpoint.test.ts: only the selected new buyer can receive the exact-total checkout.
5. launchAcceptanceEndpoint.test.ts: requires current authorization, canonical paid invoice and real external access before recording proof.

These tests import only unchanged Launch acceptance rules/functions and fixtures;
they do not import the homepage. Their outdated pilot fixtures remain outside
this frontend/query-composition task. Do not alter payment behavior to make them
pass or describe the full suite as green.

## Measured comparison

Two anonymous, cold-context desktop runs for each revision, same headless Chrome,
1440×1000, local Vite servers, real public production data. Not a production
Web Vitals benchmark; dev bundles, external network and scripts add substantial
noise. API counts below are **browser** REST requests; candidate SSR performs up
to eight additional bounded public REST queries in parallel/batched waves.

| Metric | Unchanged main | Candidate |
| --- | --- | --- |
| Browser REST requests | 9 / 9 | 4 / 4 |
| First visible catalogue card | 15.63s / 9.62s | 4.78s / 4.86s |
| Observed LCP | 17.49s / 11.02s | 4.76s / 4.85s |
| Observed CLS | 0.0795 / 0.0795 | 0.0662 / 0.0662 |
| Image encoded transfer | 99,344 / 150,037 bytes | 115,508 / 115,443 bytes |
| All encoded transfer (dev + third-party) | 17,777,158 / 17,827,833 bytes | 17,805,772 / 17,807,194 bytes |

Candidate image traffic lies inside the baseline range. No demonstrated local
performance regression; do not claim these numbers are live-user measurements.
Repeat signed-out and signed-in checks on the actual deployed revision.

## Files to release

### Push validation against updated main

Remote main advanced to a8a4c68 during push preparation. The scoped homepage
release is based on that revision, preserving its @username routes, canonical
developer attribution, pricing bylines and marketplace changes. Its generated
route tree includes the existing @username route and new Picks/Rising routes,
but none of the unfinished Collections frontend routes.

Final current-main build and TypeScript check pass; all twelve new tests pass.
Full suite: 341 passed, six failed. The five Launch failures above remain, plus
MyApps.test.tsx "links Analytics and previews owned apps, not pending claims".
That additional failure reproduces on unchanged a8a4c68 (one failed, two passed)
and concerns an existing badge-link assertion, not homepage code.

Modified: src/pages/Home.tsx, src/routes/index.tsx,
src/components/MarketplaceCards.tsx (optional editorial image priority only).

Added: src/lib/homeMerchandising.ts and its test,
src/components/HomeMerchandising.tsx and its test,
src/pages/CuratedApps.tsx, src/routes/rising.tsx, src/routes/picks.tsx,
scripts/test-home-merchandising-browser.mjs,
scripts/compare-home-merchandising.mjs, this document.

Generate src/routeTree.gen.ts and sitemap from a clean scoped build. Do not stage
the unrelated Collections changes, their migrations, nav modifications, server
changes or the mixed working route tree.

Deployment/rollback: frontend revision only. Roll back this scoped revision to
restore the former homepage; no data rollback or financial action is needed.

Remaining acceptance: authorized signed-in homepage and real save/follow behavior,
then actual live signed-out/signed-in smoke. Deployment is not claimed by this
document.
