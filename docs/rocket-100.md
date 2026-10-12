# Rocket 100

Rocket 100 is an opt-in, automatically qualified founding cohort. No editor chooses participants. A confirmed Rocket account with a complete public profile (name, handle, avatar, and at least 10 characters of bio) and an active, discoverable, domain-verified owned app can call `rocket100_join`. The database rechecks every condition and serializes the award with an advisory transaction lock. Each user can receive one number. Numbers 001–100 are permanent, including after a documented abuse revocation; a revoked number is never recycled. Admins cannot award a place or edit a score.

The public leaderboard shows only active cohort members. A daily 04:05 UTC database job recomputes eligible apps and stores scores and daily history. Qualification uses the existing ownership, claim, public discovery, and app visibility rules. Internal Rocket admin accounts and `test` seed listings cannot enter through the self-service path. No existing account is enrolled by the migration.

## Score v1

For each eligible app, popularity points are `3 × ln(1 + current bookmarks) + 5 × ln(1 + published reviews in the past 30 days) + 8 × ln(1 + distinct eligible production paid buyers in the past 30 days)`. Bookmarks and reviews from the app owner are excluded. Bookmarks and reviews require a confirmed account. Purchases exclude the owner, test-mode clients, pending, failed, refunded, and disputed transactions and require the existing webhook-backed paid-evidence function. They are counted once per buyer and app. No private purchase totals are exposed by the public RPC.

The builder's app points are ordered descending. Contributions are weighted 100%, 60%, 35%, and 20% for the first four apps, then 10% for apps five through ten. Apps beyond ten affect the portfolio count but not the popularity sum. Portfolio points are `ln(1 + eligible app count)`. Both components normalize against the cohort's 90th percentile (with a positive floor), capped at 100. The displayed integer score is `round(0.70 × normalized popularity + 0.30 × normalized portfolio)`. Ties resolve by normalized popularity, eligible app count, earlier award, founding number, then user ID. Changing this formula requires a separate reviewed migration.

App-profile views are excluded. Rocket's view counter started October 1, 2026 and cannot yet distinguish sponsored-origin visits from organic visits. Advertising impressions and clicks, Rocket Picks, Developer membership, external traffic, and external revenue never appear as direct scoring inputs. Current bookmarks are an all-time **current state**; reviews and purchases use the last 30 days. The public page explains this mixed period. A rank is shown only when a stored calculation exists.

## Privacy and operations

All membership and score tables live in a private schema with RLS and no browser table grants. The public RPC returns only published profile fields, permanent number, rank, eligible app count, and normalized score. The admin RPC requires Rocket admin authentication and includes current verified-app evidence. A documented abuse revocation removes the builder from the public leaderboard and sharing cards without reusing the number.

The award creates one idempotent in-app notification. No new Resend email is enabled until the existing transactional email system has a controlled production acceptance for this template. No founder outreach is used.

Release checks: migration applies atomically; no rows are seeded; anonymous calls to join/admin RPCs are denied; 100th/101st and concurrent awards are constrained by the database lock and unique number/check constraints; `/100`, profile badges, and share cards read only the public RPC; daily cron appears in `cron.job`; security advisors show no new exposed table/RLS findings. If the job fails, keep the last calculation and investigate before claiming a fresh rank.
