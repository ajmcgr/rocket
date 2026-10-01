# Rocket system audit — continuation

Read-only delta captured 2026-10-01 04:06 UTC. This supplements, rather than
replaces, the accepted production reconciliation record in
`docs/production-reconciliation-2026-10-01.md`. No feature, schema, provider,
workflow, or production deployment was changed during this check. A successful
redirect to an OAuth provider is **not** a successful user login.

## Source and deployment identity

| Surface | Observed state | Confidence / limitation |
| --- | --- | --- |
| GitHub `main` | `c829b7b07ec3f16b38b4f66fae0f5d89a5256126` | Direct remote-ref check; local review checkout matches. |
| Local checkout | `marketplace-v1-local` at `c829b7b`; only untracked `.tanstack/` and `supabase/.temp/` | Generated caches were not included in the reviewed commit. |
| Public frontend | `https://tryrocket.ai/login` HTTP 200; `x-deployment-id` `psr2.57fcf4e8-42ec-4a0d-a3a4-9f91d1238504.1791432296.pOdxnZqSN9XY3Z-A2lnyjVFXOl9limmobSBKSCqEJYQ` | No available platform record maps this ID to a Git commit. `pushed` is not evidence of exact deployment parity. |
| Supabase | Project `lcujmvdgczkjxdstzhnr` ACTIVE_HEALTHY, PostgreSQL 17.6.1.084 | Direct project query; this does not imply application readiness. |

The production migration ledger still contains the reconciliation migrations
under Supabase-assigned `20261001...` versions, rather than the original source
filenames. The prior warning remains: do **not** blindly run `supabase db push`
or replay the four earlier source migrations. The production Rocket Edge
Functions remain `rocket-apps` v9, `rocket-app-view` v1,
`contact-request` v1, `rocket-ga4` v2, and `auth-email-hook` v19.

## New P1 finding: X login is blocked by the production UI

The production `/login` page renders **Continue with X** disabled after its
provider check finishes. **Continue with GitHub** becomes enabled. The same
public Supabase Auth settings endpoint used by the page reports
`external.github: true` but no `external.x` key (it reports legacy
`external.twitter: false`). Source `src/pages/Login.tsx` checks
`settings.external?.x === true` and disables X if false or absent. Meanwhile,
direct starts at `/auth/v1/authorize?provider=x` and
`?provider=github` both return 302 to the corresponding provider's real OAuth
authorization host (`x.com` and `github.com`). This proves provider starts are
configured, **not** that callbacks, account creation, email retrieval, linking,
or session persistence work. Production has 12 email and 20 Google identity
records, and **zero X/GitHub identity records** as of this check.

Do not resolve this by enabling the legacy Twitter 1.0a provider. Current
Supabase guidance uses provider `x` for OAuth 2.0; the mismatch is the
availability gate's assumption about the public settings response. Investigate
and fix only after the audit gate, then test the complete X flow with a safe
account. GitHub is visible but also lacks full E2E verification.

## Production data and automation delta

Exact count queries show 5,506 apps, 5,718 sources, 14,646 media, 9 import
jobs, 160 website-health rows, 5 view events across 2 count rows, 1 claim,
0 owners, 0 saved apps, 0 reviews/reports, 0 GA4 connections, 0 Stripe
revenue-verification connections, 2 Rocket OAuth clients, 3 historical
Connect transactions, and 2 entitlements. These counts are materially stable
against the prior reconciliation record. Historical OAuth and commerce rows
remain evidence, **not** fresh independent-app or payment E2E acceptance.

Current source schedules are Launch daily 02:20 UTC, GA4 daily 05:23 UTC,
and blog Monday 09:15 Asia/Bangkok. The latest Launch run is marked success
but is attempt **3** of a scheduled run: attempts 2 and 3 were manually
rerun during reconciliation. The latest GA4 success is attempt **2** of a
scheduled run, also manually rerun. Thus neither proves the next unattended
execution. No newer unattended scheduled run was present at this capture.
The last five visible blog runs are failures from older commits; current
weekly source uses `bun ci`, but it has not yet demonstrated an unattended
weekly publish. Blog remains non-blocking for core reconciliation.

## Security and acceptance status

The Supabase Security Advisor is not clean: one `security_definer_view` ERROR
(`public.ymh_bids_public`), 15 anonymously executable and 18 authenticated
executable SECURITY DEFINER functions, two mutable search paths, `pg_net`
in `public`, 43 RLS-without-policy information notices, and leaked-password
protection disabled. The prior record explains why several are deliberate
service-only or capability boundaries; an advisor warning is not itself an
exploit, but none of these has a final security sign-off.

| Capability | Implemented / deployed | Configured or tested evidence | Real E2E / readiness |
| --- | --- | --- | --- |
| Marketplace catalog, Launch import, media | Yes | Prior controlled import twice, stable counts, signed-out live smoke | Core public path partially verified; next unattended sync pending. |
| Google/email auth | Yes | Production settings enabled; 20 Google / 12 email identities | Fresh-session, callback, logout, return-path matrix not retested here. |
| GitHub auth | Login UI and provider start live | UI enabled; provider redirects to GitHub | No GitHub identity or complete login E2E. |
| X auth | Login UI and provider start live | Provider redirects to X, but UI remains disabled | P1 UI blocker; no complete login E2E. |
| Saved, reviews, claims, owner editing | Backend and pages present | Prior rollback-only review authorization test and signed-out smoke | Two-user browser/API tests and real owner path pending. |
| GA4 / Stripe read-only verification | Backend deployed | GA4 scheduled-auth no-op succeeded on manual rerun; zero live connections | Real owner OAuth/data E2E pending; Stripe external E2E pending. |
| Rocket ID / third-party payments | Infrastructure and historical rows present | 2 clients, 3 historical transactions, 2 entitlements | Independent-app and fresh natural payment E2E pending. |
| Admin OS, PostHog, editorial, outreach, consumer Library | Not signed off by prior audit | Do not infer readiness from adjacent infrastructure | Not built or not E2E-verified; outside core recovery. |

Two dedicated safe Rocket test accounts are unavailable, per user reply.
Therefore cross-user Saved/review/claim/owner tests, signed-in browser smoke,
and real X/GitHub account flows remain **E2E PENDING**. Do not create accounts,
claim apps, send founder email, or exercise real payments merely to turn a
status green. The appropriate next acceptance pass needs two purpose-built
accounts, a controlled app/domain, and a safe independent OAuth client.

## Current verdict

**COMPLETE SYSTEM AUDIT / PRODUCTION READINESS: INCOMPLETE.** The public
catalog reconciliation has strong evidence, but exact frontend commit
provenance, X UI usability, unattended automation, signed-in and two-user
security, and fresh external integration E2E remain open. No production-ready
claim is warranted from this continuation.

Relevant advisor remediations:
[security-definer view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
[anonymous SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
