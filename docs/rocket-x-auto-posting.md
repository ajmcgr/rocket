# Automatic Rocket app posts on X

The GitHub Actions workflow `.github/workflows/post-new-apps-to-x.yml` runs daily
at 15:17 UTC and posts at most one newly submitted app to `@tryrocketai`.
An app must be public, pass Rocket's discoverability checks, have an active
owner, and be at least one hour old. The migration deployment time is the
starting point; earlier apps are not posted from a backlog.

## Activation

1. Use an X developer app with **Read and write** permission for the Rocket
   `@tryrocketai` account. X sign-in for Rocket users does not supply a posting
   credential.
2. Add these four repository Actions secrets in `ajmcgr/rocket`. Use the X
   app's own consumer key and secret plus a user access token and secret issued
   for `@tryrocketai`; do not place them in the repository or workflow file:
   `ROCKET_X_API_KEY`, `ROCKET_X_API_SECRET`, `ROCKET_X_ACCESS_TOKEN`, and
   `ROCKET_X_ACCESS_TOKEN_SECRET`. The existing
   `ROCKET_SUPABASE_SERVICE_ROLE_KEY` secret is also required.
3. Apply only `20261030120000_rocket_x_app_posting.sql` to Rocket's Supabase
   project, using the established migration process. Do not run a blanket
   `supabase db push` against this project's divergent migration history.
4. Run the workflow manually with `dry_run: true`. It must confirm the X
   account and ledger without reserving or publishing. The next scheduled run
   posts an eligible app. A manual run with `dry_run: false` also consumes that
   UTC day's single posting slot.

The script calls X's `/2/users/me` before reserving an app and stops if the
credential is not for `@tryrocketai`. The posting ledger is private to the
service role. A reservation is durable and unique per app and UTC day. An X
request with an uncertain result is **not** retried automatically; inspect the
X account and the `rocket_x_app_posts` ledger before any manual correction.
The workflow never logs X tokens or the Rocket service key.
