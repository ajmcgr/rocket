# Rocket production reconciliation — recovery record

Captured 2026-10-01 before production mutation. Project: Rocket
(`lcujmvdgczkjxdstzhnr`, ap-northeast-1, PostgreSQL 17.6). Source baseline:
GitHub main `22e33b8322dc59fc673476da7ad0c2253786471b`.

## Baseline

- Frontend: live `https://tryrocket.ai` responds but its deploy revision was not
  exposed by the available deployment tooling. Visible UI still says **Open**
  and ranks by Launch votes, so it is older than the source baseline. Do not
  infer a commit from GitHub main.
  This was the initial observation. A later production request returned a
  Lovable/Cloudflare `x-deployment-id` beginning `psr2.e9d82361-6d79-4ec9`
  and visibly showed **View** and Rocket-view rankings. No platform record maps
  that deployment ID to a Git commit, and an external publish may have occurred
  during this reconciliation. The exact live frontend commit remains unknown.
- Production migration history ends at
  `20260930173636 restore_public_app_rankings_for_marketplace`. The four
  source migrations dated `20260930060000`, `20260930144000`,
  `20260930174245`, and `20260930181335` are not recorded. The first and
  last two introduce schema absent in production; the second's Launch-vote
  views are already materially present from the manual restoration.
- `rocket-apps` is v8 (JWT gateway on). `rocket-ga4` is v1 (JWT gateway off).
  `auth-email-hook` is v18 (JWT gateway on). `rocket-app-view` and
  `contact-request` are absent. Other Edge Function versions are obtainable
  from Supabase deployment history; do not redeploy unrelated functions.
- 5,458 canonical apps; 5,668 source records; 5,452 discoverable apps;
  28 app-intelligence and 16 category-intelligence rows; 0 website-health
  rows; 7 import jobs (5 completed, 2 failed); 1 pending claim, 0 owners,
  0 saved apps; 2 OAuth clients, 3 historical Connect transactions and
  2 entitlements. Preserve historical Connect and import evidence.
- Launch catalogue is scheduled daily 02:20 UTC, GA4 daily 05:23 UTC,
  blog Mondays 09:15 UTC. The last Launch scheduled run imported apps but
  failed at missing `sync_launch_app_media_batch`; GA4 returned 401.
- `public.public_app_rankings` currently exposes `launch_net_votes` and
  `votes_observed_at`. `public.public_ranking_categories` groups this view
  by category with a minimum count of 20. Definitions match the local
  `20260930144000_public_app_rankings.sql` migration. The current
  `public.ymh_bids_public` view is security-definer/updatable and grants ALL
  to anon and authenticated (separate security remediation required).

## Recovery procedure / stop gates

1. Keep the deployed frontend unchanged until schema, functions and sync
   smoke checks pass. Record the deployed frontend revision before publishing
   a replacement and use that platform's previous deployment for rollback.
   If no deterministic previous deployment or rollback control is available,
   do **not** publish.
2. Apply only reviewed additive migrations, one at a time, verifying objects,
   RLS and grants after each. These migrations create new tables and functions;
   do not drop them on rollback because post-deployment media/review/view data
   may exist. Disabling consumers is safer than deleting evidence.
3. If Rocket-view ranking fails, restore the former Launch-vote view definitions
   from `supabase/migrations/20260930144000_public_app_rankings.sql` in a
   transaction after first checking current dependent objects. This is the
   exact pre-change view shape. Preserve view-count events and counts.
4. If an Edge Function deploy fails, redeploy its pre-change version from
   Supabase function deployment history (`rocket-apps` v8,
   `auth-email-hook` v18 where applicable), preserving JWT-gateway settings.
   Never echo or copy runtime secrets into this record.
5. If Launch sync fails after deployment, stop the scheduled workflow and
   diagnose the failed phase. Do not delete imported apps, media, import jobs,
   payment transactions, entitlements, or OAuth clients. Resume only after
   fixing the exact phase; unique source IDs make app/media imports idempotent.
6. Re-run Supabase Security Advisor and compare with this baseline. Resolve
   any new exposed-schema RLS or privileged-execution findings before
   publishing frontend consumers.

This is an application-level rollback record, **not** a database backup or
proof that point-in-time recovery is enabled. Obtain a platform backup/PITR
restore point before any destructive migration or data rewrite. None is
authorized by this reconciliation plan.

## Reconciliation performed on 2026-10-01

- Supabase applied additive migrations `20261001020311` (media/reviews),
  `20261001020335` (card metadata), `20261001020358` (Rocket profile-view
  rankings), `20261001020432` (privileged-entrypoint hardening), and
  `20261001022503` (write-only review-report conflict fix),
  `20261001023421` (public-design share filter), and `20261001023559`
  (immediate corrective removal of an ambiguous project-share overload).
  The Launch-vote
  view source migration was not replayed because its earlier shape was already
  present through `20260930173636`; the profile-view migration replaced it.
- `rocket-apps` v9 (gateway JWT off; mutation actions validate user JWT),
  `rocket-app-view` v1 (gateway JWT off, public Origin gate, service-only RPC),
  `contact-request` v1 (gateway JWT off), `rocket-ga4` v2 (gateway JWT off;
  reads the existing `ROCKET_GA4_SYNC_SECRET`), and `auth-email-hook` v19
  (gateway JWT off; HMAC/timestamp validation and retryable send errors) were
  deployed. No unrelated payment/provider function was redeployed.
- Re-ran GitHub Launch workflow `36690958577` attempts 2 and 3. Both completed
  all steps, including bounded website checks. Source read: 5,721 evaluated,
  5,718 valid public, 3 invalid skipped, 213 ambiguous exact URL records,
  92 duplicate URL groups, 5,505 safe candidates. First pass created 48 apps
  (import job), with 2 ambiguous held, synchronized 14,646 media rows and
  5,506 vote rows, refreshed 28 app and 16 category intelligence signals,
  then checked 80 sites (2 hard failures). Second pass created **0** apps,
  synchronized the same 14,646 media and 5,506 votes, and checked another
  bounded 80 sites (1 hard failure). App/source/media counts were unchanged;
  zero duplicate source or media IDs. The importer reads Launch with a
  publishable key only. The workflow ran an older commit, but `git diff`
  verified the importer, website-check script, and workflow files are
  unchanged between that commit and reviewed `22e33b8`.
- Media after sync: 14,646 rows across 5,382 apps; 8,987 screenshots across
  3,434 apps; 454 videos across 454 apps; 5,205 thumbnails across 5,192 apps.
  Live Tallpine and Whisperit profiles displayed sourced screenshots. Tallpine
  exposes its sourced YouTube video as a link, which is the reviewed source's
  current presentation; this is **not** an embedded player.
- Live signed-out smoke passed homepage, Discover, search for Whisperit,
  Rankings, New, Categories, two app profiles, media, and submit preview of an
  existing Launch URL. The preview resolved Tallpine without creating a new
  app or requiring auth before preview. `rocket-apps` rejected a missing JWT
  for `my_apps` (401) and a private URL preview (400).
- `contact-request` rejected invalid input (400) and accepted one marked
  internal message sent to `alex@tryrocket.ai` (200). No mass mail.
- `rocket-app-view` rejected invalid Origin (403), counted one valid view and
  deduplicated an immediate repeat. Subsequent browser QA visits added a few
  ordinary view events; retain these as production evidence. The design is
  still vulnerable to deliberate spoofed Origin/User-Agent combinations; it
  is a popularity signal, not fraud-proof unique-user analytics.
- The reviews backend passed a rollback-only SQL transaction using two
  designated test-account identities: create/read, aggregate, own edit/delete,
  cross-user update/delete denial, and report insertion. The first report
  attempt exposed a targeted `ON CONFLICT` privilege error, fixed in the last
  migration without granting read access to reports. After rollback there
  were **0** reviews and **0** reports. Anonymous RPC execute is denied.
- The GA4 scheduled workflow `36707258475` attempt 2 completed after the
  function read the already-configured `ROCKET_GA4_SYNC_SECRET`. Production has
  zero GA4 connections, so this proves scheduled authorization/no-op behavior,
  not a real owner traffic sync. The next unattended run remains unobserved.
- `npm test`: 42/42 pass. `npm run build`: success. These do not replace the
  missing signed-in or multi-user browser E2E tests.

### Remaining gates and known findings

- No deterministic mapping from the current frontend deployment to GitHub
  commit or verified previous-deployment rollback control was available.
  Therefore no new frontend publish was performed. Visible live behavior is
  consistent with much of reviewed source, but exact parity is unproven.
- Supabase MCP assigned new production migration versions rather than the
  local filenames for the three previously missing source files and later
  hardening migrations. The SQL objects are present, but the CLI migration
  ledger is not aligned with repository filenames. **Do not run an automatic
  `supabase db push`** until migration-history repair is planned and verified;
  it could attempt to replay already-live DDL. The existing Launch-vote view
  source migration likewise remains unrecorded under its original filename
  because it was previously represented by the manual restore.
- Auth Send Email hook is enabled at `/functions/v1/auth-email-hook`. Invalid
  production signature returns 403. Local tests cover invalid signature,
  retryable Resend failure, and valid signed success with a mocked provider.
  A real signed production delivery to a safe existing test recipient was not
  completed. Do not claim email delivery E2E.
- No domain-verified app owner exists. Signed-in Google login, Saved, claims,
  Your Apps owner controls, Create, Settings, Billing, and two-user browser E2E
  remain unverified. Do not synthesize an owner to pass these gates.
- Supabase Security Advisor remains at 1 ERROR (`ymh_bids_public`, an intentional
  security-definer view now **SELECT-only** for anon/auth), 15 anonymous and
  18 authenticated executable security-definer functions (down from 25 each
  for anonymous/initial privileged set), 2 mutable search paths, 1 extension
  in public, 43 RLS-with-no-policy informational findings (primarily private
  service-only tables), and leaked-password protection disabled. These are
  not a clean security-advisor sign-off. The read-only bid view and remaining
  capability functions need a separate scoped design review before they can
  be declared fully safe. A suspected `get_shared_project` password bypass
  was ruled out: the existing `(uuid, text default null)` overload checks its
  password hash. The temporary one-argument overload introduced during this
  review was immediately removed. A genuine forward leak in
  `get_public_designs` was fixed by excluding password-protected assets;
  a rollback-only test verified it. There are currently 2 shared projects,
  12 shared assets and no password-protected shares.
- The last five blog scheduled runs failed in `npm ci` during build validation
  because `package-lock.json` did not satisfy package dependencies. The
  current source schedule is Mondays 09:15 UTC; older daily runs predate it.
  Blog is non-blocking here and was not broadened into a publishing fix.
- No real GA4 owner OAuth, Stripe revenue external, independent-app Rocket ID,
  fresh Rocket Payments, or payment/paid-asset E2E was performed.

### Latest preserved counts (after two Launch runs and QA)

5,506 apps; 5,718 app sources; 5,500 discoverable; 14,646 media; 28 app
intelligence; 16 category intelligence; 160 bounded website-health records;
9 import jobs; 0 reviews/reports; 2 apps with 4 counted QA views; 2 OAuth
clients; 3 historical Connect transactions; 2 entitlements; 0 owners;
0 saved apps. Historical payment, OAuth, and import evidence was not deleted.

### Privileged-object review detail

All functions below are `SECURITY DEFINER` and owned by `postgres`; callers
enter that owner's SQL context, so the argument checks and grants are the
security boundary. `A` means anonymous and authenticated can execute;
`U` means authenticated only. The 15 remaining anonymous and 18 remaining
authenticated findings are all listed here. A warning is not proof of an
exploit, and a narrow purpose is not a full penetration test.

| Object(s) | Grant | Purpose / argument boundary | Conclusion |
| --- | --- | --- | --- |
| `app_revenue_is_currently_public` | A | Boolean public revenue projection; supplied app/currency/visibility must match current verified owner, active live connection and fresh sync | Intended policy helper; no write or private amount returned. |
| `app_traction_is_currently_public` | A | Boolean GA4 projection; supplied app/metric/visibility must match verified owner and fresh active sync | Intended policy helper; no write or private metric returned. |
| `get_public_designs` | A | Public design list, bounded 1–500; originally returned all shared-token assets including password-protected ones | Fixed: protected assets excluded. Public unprotected designs intentionally remain discoverable. |
| `get_share_meta` | A | Possession-token lookup returns title and password-required bit | Intended capability preview; random UUID token is required; no asset body returned. |
| `get_shared_asset` | A | Possession token and optional password checked against hash before asset return | Intended share capability; returns full row after access, including internal fields; data minimization remains P2. |
| `get_shared_project` | A | Existing `(uuid, text default null)` checks token and password hash before returning project and assets | Password boundary verified. Full-row JSON merits P2 minimization review. |
| `has_pro_plan` | A | Boolean plan status for supplied user UUID | Read-only helper; cross-user plan existence is low-sensitivity but should be minimized in a later security pass. |
| `has_workspace_role`, `is_workspace_member`, `workspace_role_of` | A | Workspace membership/role helpers with caller-supplied workspace and user UUIDs | Read-only RLS helpers; caller can probe a known UUID pair. No direct role assignment, but membership disclosure merits P2 review. |
| `ymh_creative_context` | A | Auction creative context gated by bid payment-token UUID | Intended capability read; possession of token is the boundary. |
| `ymh_current_auction` | A | Returns current open auction; if none, invokes rollover as owner | Intended public endpoint but read can trigger a privileged write. Separate P2 abuse/rate review. |
| `ymh_increment_page_view` | A | Increments a public page-view counter without identity or rate control | Deliberately public but trivially spoofable; do not treat count as trustworthy. P2. |
| `ymh_submit_creative` | A | Payment-token-gated billboard mutation with caller-supplied URLs/headline | Capability write; token check exists, but auto-approval and URL validation need separate P1 review. |
| `ymh_subscribe_email` | A | Validated email subscription | Fixed opt-out bypass: existing opt-outs are no longer removed/re-subscribed. Rate/spam control remains P2. |
| `accept_workspace_invite` | U | Invite token, current JWT email, expiry, seat checks before joining | Anonymous execution revoked; authenticated capability flow retained. |
| `create_workspace` | U | Current JWT user and Pro-plan check before workspace creation | Anonymous execution revoked; authenticated flow retained. |
| `set_asset_share_password` | U | Asset ID constrained to `auth.uid()` before password hash update | Anonymous execution revoked; authenticated owner flow retained. |

Anonymous and authenticated execution was revoked for trigger-only
`bump_like_count`, `create_personal_workspace`, `create_referral_code`, and
`handle_new_user`, and maintenance/direct-auction mutations `purge_old_trash`,
`ymh_recalc_current_bid`, and `ymh_rollover_auctions`. Service-role/trigger
execution remains. The `ymh_bids_public` view stays owner-context for reading
the public bid board but was changed from `ALL` to `SELECT` for anon/auth;
transactional privilege checks confirmed anonymous INSERT/UPDATE/DELETE are
denied. Its remaining Advisor ERROR is intentionally not called resolved.
