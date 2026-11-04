# Rocket one-week follow-up

Added 4 November 2026. A daily GitHub Action queues one optional Resend email per verified Rocket account approximately seven days after signup or email confirmation. The queue uses a stable per-account key, the existing Resend delivery path, and the existing global mail gate. It only includes accounts created around or after this campaign's launch, and allows a bounded catch-up period for scheduler delays. It does not backfill older members.

The message points an eligible domain-verified app owner to analytics settings, another app owner to My Apps, and an explorer to Discover. Verification is described as optional; no private metrics or connection states are included. A signed-out unsubscribe link and a Settings switch can disable this follow-up. Delivery checks suppression, verification, ownership and preferences again before sending.

The GitHub workflow is dry-run on pushes and by default on manual dispatch. The daily schedule queues live mail using the existing `ROCKET_SUPABASE_SERVICE_ROLE_KEY` GitHub Actions secret. The campaign can be stopped without a new deployment by setting `sharing_private.week_one_email_control.enabled` to false.
