# Developer activation and organic growth — 24 October 2026

## Audit: reused functionality

Rocket already has free app submission, duplicate resolution, DNS/file/manual/invitation claims, server-checked My Apps ownership, developer profiles, domain-gated analytics/revenue settings, provider selection, private-by-default metrics, anonymous consent/freshness-gated public projections, branded share-card rendering, X/LinkedIn intents, OG/Twitter metadata, UTM links and an admin overview/CSV export. Provider success events already distinguish connections from successful sync responses.

The main friction was after success: submission emphasized monetization; claim completion offered little guidance; public developer profiles lacked a dedicated Share action; app/profile cards omitted their public verified metrics. Browser share events and UTM links did not form a persistent registration/claim attribution chain.

## Changes

- Optional, dismissible next steps after publication and successful domain/invitation claiming. Reuse profile, domain verification, analytics and revenue routes. Provider links require the current authenticated app owner to be domain verified. Sharing and existing monetization remain available; no connections are mandatory.
- Share profile action uses the existing dialog/cards and attribution format.
- App cards put approved public revenue before public traffic. Developer cards can feature one of their public apps, explicitly named; currencies/providers are never aggregated. Reuse the existing metric-card renderer. Sources, dates, gross revenue/MRR/payment-volume and daily traffic units remain distinct. Missing evidence keeps the existing branding card.
- Renderer uses only the anonymous public projections. Private/verified-only values, stale points and conflicting revenue snapshots are excluded. App/profile images use no-store rather than caching consented values in Rocket's response cache. Previously downloaded images and third-party social caches cannot be recalled by Rocket.
- Private first-party share/referral events reuse rocket-app-view. One receipt per tab, seven-day first touch, idempotent visit UUIDs, one confirmed registration per account, public target validation, bounded abuse limit, DNT/GPC opt-outs. No new third-party dependencies or tracking cookies.
- Email signup can carry an opaque receipt through verification in another tab. This user-editable metadata is never an authorization claim: the server independently verifies the authenticated account, confirmed email, recorded visit, chronology and expiry. Existing logins never become referral signups.
- A small Developer growth loop section and existing CSV export report the counts with the selected period and existing Bangkok cutoff.

## Events and definitions

Existing `share_button_clicked`, `share_link_copied`, `share_caption_copied`, `share_destination_clicked`, `share_card_downloaded`, `share_native_completed`, `analytics_connected`, `analytics_sync_succeeded`, `revenue_connected`, `revenue_sync_succeeded`, `claim_verified` and submission events remain. No second browser success event or CTA-as-verification event was added.

The private ledger adds `share_action`, `referral_visit`, `referral_signup`:

| Admin metric | Meaning |
|---|---|
| Activated developers | Unique currently eligible app owners whose first recorded successful production sync falls in the period; uses retained authoritative provider records. |
| Verified analytics connections | Unique connections with actual verified points and successful sync evidence; first recorded evidence in the period. |
| Verified revenue connections | Unique production connections with actual revenue evidence and successful sync; excludes sandbox. |
| Share actions | Successful copies/downloads/native handoffs or social intents for public app/profile cards, not dialog openings or confirmed published posts. |
| Referral visits | Idempotent attributed tab landings on public app/profile URLs; not unique people. |
| Referral registrations | Confirmed new accounts linked to an earlier recorded visit within seven days. |
| Referred developers with claims | Distinct referred accounts subsequently receiving an active app ownership record; pending requests do not qualify. |

Referrals start at deployment. No historical attribution was inferred from old UTM traffic. Claim outcomes reuse ownership records instead of emitting a duplicate claim event. Activation history describes retained provider evidence, not a guaranteed complete lifetime event history; revoking ownership can remove a developer from eligible outcome counts.

## Validation and limits

87 focused tests cover success guidance, ownership isolation, auth redirects, the existing onboarding, sharing, public/private card evidence, referral receipts, opt-outs and CSV. TypeScript and production build pass. Transactional SQL fixtures exercise the visit → confirmed signup → successful claim chain, duplicate protection, expiry, private targets, verified analytics, production/sandbox revenue, unique activation and non-admin denial. All fixtures roll back.

Production verification checks deployed admin counts, a public share action/arrival and live card/metadata responses. No production apps are submitted or claimed during testing; no real provider credentials, Launch mappings or payments are changed. Full new-provider OAuth handshakes remain covered by existing provider tests rather than reconnecting personal production accounts. Actual social posting and platform cache refresh are outside this change.

## Measuring and next steps

Use the admin period filter to compare verified outcomes, share actions, visits and referred registrations/claimants. These are separate aggregate counts, not a cohort conversion rate: visits are tab landings, actions may repeat intentionally, and outcomes can occur in later periods. Monitor seven-day referred registration-to-claim outcomes and recruit developers who choose to publish verified evidence before expanding the feature set. Cross-device attribution and a larger historical/cohort ledger are possible later, only if the current loop demonstrates value.

## Files modified

- `docs/developer-growth-loop.md`
- `src/components/AppSubmissionSuccess.tsx`
- `src/components/DeveloperActivationNextSteps.test.tsx`
- `src/components/DeveloperActivationNextSteps.tsx`
- `src/components/GrowthAttribution.tsx`
- `src/components/RocketShare.test.tsx`
- `src/components/RocketShare.tsx`
- `src/components/SiteHeader.tsx`
- `src/lib/adminOverviewCsv.test.ts`
- `src/lib/adminOverviewCsv.ts`
- `src/lib/growthRequest.test.ts`
- `src/lib/growthTracking.test.ts`
- `src/lib/growthTracking.ts`
- `src/lib/publicShareMetrics.test.ts`
- `src/lib/shareLinks.test.ts`
- `src/lib/shareLinks.ts`
- `src/pages/AddApp.claim-flow.test.tsx`
- `src/pages/AddApp.tsx`
- `src/pages/Admin.tsx`
- `src/pages/ClaimInvitation.tsx`
- `src/pages/Login.tsx`
- `src/pages/PublicMemberProfile.tsx`
- `supabase/functions/_shared/growthTracking.ts`
- `supabase/functions/_shared/publicShareMetrics.ts`
- `supabase/functions/rocket-app-view/index.ts`
- `supabase/functions/rocket-share-card/index.tsx`
- `supabase/migrations/20261024090235_developer_growth_loop.sql`
- `tests/developer-growth-loop.sql`
