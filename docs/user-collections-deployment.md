# User Collections — implementation and release checklist

Base: `631e0c22d3b600e385fe2c7855cbc931bc454a61` (remote main inspected).

## Data and security boundary

Migration: `supabase/migrations/20261007080910_user_app_collections.sql`.
Follow-up: `supabase/migrations/20261007085046_user_collection_public_curators.sql`.
Preflight definitions/count/checksum: `docs/user-collections-preflight.json`.
Four production saved rows existed, one saver. No personal saved rows were exported.

`saved_apps` is unchanged and remains the canonical default **Saved** collection.
`my_saved_collection` is a private, security-invoker aggregate over those rows, not
a copied/backfilled bookmark store. The default has no custom-collection UUID and
cannot be renamed, deleted or made public. Unsave removes only the default
membership; intentional custom memberships remain until explicitly removed.

Custom collections use `user_collections` and `collection_apps`. New collections
default private; owner derives from `auth.uid()`. Browser inserts cannot choose
owner, UUID, timestamps or slug. Stable human-readable slugs are generated once
and remain unchanged on rename. Unique `(collection_id,app_id)` prevents duplicates.
RLS guards every direct table read/write; public projections explicitly exclude
private collections even when queried by their owner. Hidden app details,
artwork and counts are filtered through the same `public_apps` projection as Saves.
Invoker triggers touch only their parent collection; trigger functions are not
executable through the public API. A narrowly scoped read-only SECURITY DEFINER
helper in the non-exposed `collection_private` schema returns only published
curator name/username/avatar for a currently PUBLIC collection. It cannot return
internal user IDs or private collection metadata. This is necessary because
production deliberately withholds the profile `user_id` column from anon; those
grants remain unchanged. All four Data API views remain security-invoker.

No payment/subscription/entitlement/merchant/billing tables, functions, secrets or
visibility settings change. No purchased apps are added automatically. Editorial
collections are not changed. No homepage changes.

## Frontend

- `/my-collections`: private Saved plus custom collection summaries and creation.
- `/my-collections/:slug`: owner controls with rename, privacy confirmation,
  confirmed delete, removal and sharing only when public.
- `/collections`: populated public community collections, updated timestamp then
  ID ordering, paginated 24 + one lookahead; efficient public projection for future homepage.
- `/collections/:slug`: public-only SSR title, curator, first app page,
  canonical/OG metadata. Missing/private response uses generic noindex metadata.
- Existing `/saved-apps` stays supported and is labeled Saved.
- Both desktop shells and the approved six-slot mobile bar expose Collections
  and My Collections. Mobile Search shortcut is replaced; existing header search remains.
- Public profile collections appear below public apps, six lazy app logos per card.
- One-click Save remains a single saved_apps write and stays in place. The optional
  collection picker loads on open, supports independent multiple memberships and
  private-by-default creation. Default bookmarking never depends on picker success.
- Public/private HTML is no-store; route loader caches disabled. Public pages
  revalidate on tab return. A previously viewed/copied public page cannot be
  retrospectively erased; subsequent database/API reads enforce current privacy.
- Private component state is keyed by authenticated account to prevent session-switch leakage.
- Detail apps are paginated and optional media/metadata/saved state loaded in batches.

## Release steps (do not skip gates)

1. Review the additive migration and preflight snapshot; run isolated PostgreSQL
   tests and frontend tests/build.
2. Apply only these two migrations with Supabase `apply_migration` to project
   `lcujmvdgczkjxdstzhnr` as the prerequisite for controlled production acceptance.
   Do not run a blanket migration push: the repository contains unrelated work.
3. Recheck saved count/checksum, new RLS/grants/invoker options, and advisors.
   Test anonymous REST behavior and direct trigger/RPC denial.
4. Use two authorized controlled accounts with actual signed-in sessions. Run
   `scripts/test-user-collections-production.mjs` and browser acceptance against
   the prepared frontend: private two apps → User B denied → public/profile/discovery
   allowed → rename keeps URL → remove/count → private/public disappears → delete.
   Confirm User A has a public profile before the test; do not manufacture one.
5. Verify desktop/mobile interaction, initial HTML/metadata and normal Save;
   preserve and compare existing controlled saves. Do not substitute role simulation
   for actual signed-in E2E.
6. Only after all acceptance gates pass, commit/push the scoped branch, review/merge
   its PR, wait for Lovable to build that exact main revision, then explicitly
   publish the Rocket project and verify actual `tryrocket.ai` HTML/API behavior.

## Rollback

Preferred: restore the prior frontend deployment and leave the additive collection
schema/data intact, so any user-created collections are recoverable. No existing
Save definitions or data need restoring because the migration never changes them.

Database rollback is **not automatic**: only after an approved backup and confirming
there are no real collections to lose, remove the four new views, the two new
tables (memberships before collections), then the two trigger functions and the
private curator helper/schema. Never
drop or rewrite saved_apps, app_graph apps, identity or financial objects.

## Known limitations / unverified gates

- Production authenticated two-user and real browser/mobile acceptance needs two
  controlled sessions. Never log or commit passwords/access tokens.
- Existing Saved detail retains its pre-existing 200-row limit; custom collection
  details paginate. Custom picker/management use Supabase's row limit (normally 1,000).
- Collection-specific report/moderation is deferred: current production report RPCs
  target apps/reviews and the checked-in admin UI targets review reports. Extending
  that contract requires a separate reviewed moderation change; this task does not
  pretend an app report can report a collection. No giant new moderation system added.
- Public collection detail routes are indexable with metadata, but only the public
  discovery root is added to the static sitemap, avoiding stale private URLs in a
  build-time collection sitemap.
- Existing security advisor findings predate this change (including YMH definer
  view/search-path findings and leaked-password protection). No claim that the
  entire project's advisor report is clean.

## Unrelated baseline test failures

These five failures reproduce in an untouched `git archive HEAD` copy of base main:

1. `launchAcceptance.test.ts`: binds the exact plan to Launch, its owner and current merchant.
2. `launchAcceptance.test.ts`: requires a new live paid transaction with its exact unrevoked future entitlement.
3. `launchAcceptanceEndpoint.test.ts`: owner, other buyer, prior purchase and absent terms cannot initiate checkout.
4. `launchAcceptanceEndpoint.test.ts`: only the selected new buyer can receive the exact-total checkout.
5. `launchAcceptanceEndpoint.test.ts`: requires current authorization, canonical paid invoice and real external access before recording proof.

The first fixture expects the old plan; another imports a removed
`paidAcceptanceProof` export. Endpoint fixtures expect old pilot success/status
paths but current gate responds 409. Collections changes no Launch/Stripe code.

## Current verification record

- Both additive migrations applied to production successfully. Remote history:
  `20261007084530_user_app_collections`,
  `20261007085256_user_collection_public_curators` (MCP records apply-time versions).
- Production save count still 4; checksum unchanged
  `a0739665dd41f8b8868c54dad9407478`. No custom collections created in production.
- Public projection and visible-app REST reads: HTTP 200, zero rows (no invented collections).
- Anonymous personal views: HTTP 401; trigger RPCs: HTTP 404 (not callable).
- All new tables have RLS, all four views have security_invoker=true,
  trigger functions have empty search_path and revoked execution.
- Security advisors after both migrations: no findings on the new collection objects.
- 29 isolated PostgreSQL assertions pass, with production-equivalent protected
  profile-column grants. Not a substitute for real authenticated production E2E.
- Final unit suite: 319 pass; the five unchanged Launch pilot baseline failures above remain.
- TypeScript passes. Production build passes, including existing app sitemap generation.
- Headless Chrome local layout smoke passes at 390px and 1440px with isolated,
  GET-only browser fixtures: discovery/detail cards, mobile links, no horizontal
  overflow, no owner controls for anonymous users. Actual local SSR missing/private
  metadata and Cache-Control `private, no-store` also pass.
- The packaged `vite preview` command fails on its existing `dist/server/server.js`
  expectation while this build emits `.output`; layout smoke used the working
  development server without changing hosting configuration. Positive public SSR
  content/metadata is covered by unit tests; real signed-in production is not claimed.
- On 2026-10-07 the owner declined creation of controlled test accounts and explicitly
  authorized pushing Collections live. Real-session two-user acceptance remains
  unverified; isolated PostgreSQL tests do not substitute for that evidence.
- Release rebased onto main `a8a4c68214ac6111389c292fac370a1573492f9e`, preserving
  marketplace completion and canonical profile routes. Focused frontend tests:
  22 passed; isolated PostgreSQL assertions: 29 passed; TypeScript/build passed.
  The migrations above are already applied and must not be reapplied.
