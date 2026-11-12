# Rocket Inbox and Apps for Sale implementation plan

## Existing architecture

- Supabase Auth provides the existing user identity. `profiles` and `member_public_profiles` contain display names and public avatars; private email addresses stay in Auth/profiles.
- `app_graph.apps` is the canonical app record. `app_owners` is the ownership source; `domain_verified` with no revocation is the strongest automated proof. Submissions and pending claims do not confer ownership.
- `public_apps` and `public_discoverable_apps` serve app profile and discovery surfaces. My Apps uses the `rocket-apps` Edge Function. The protected route shell already handles sign-in redirects.
- `account_notifications` is a one-way activity feed, not a participant messaging system. Resend is already used by Supabase Edge Functions. No existing conversation schema was found; the existing Realtime publication can carry the new message table.

## Design

1. Add acquisition listings keyed to canonical app ID and domain-verified owner. A database constraint and server checks enforce status and USD price bounds. Delisting preserves historical conversations. A public read projection includes only current, verified, public listings and public app fields.
2. Add app-linked buyer/seller conversations, participant state, messages, blocks, reports and email delivery receipts. A unique `(app_id,buyer_id,seller_id)` key prevents duplicate conversations. Conversation and message writes go through authenticated, narrow database RPCs that validate every action server-side; RLS allows participants to read their own messages and state. No arbitrary user-to-user conversation creation.
3. Publish message inserts to Supabase Realtime with participant RLS. The UI also polls the unread badge as a fallback. Paginate history by a monotonic message sequence and deduplicate optimistic sends by a client-generated request ID.
4. Send throttled, content-free Resend notifications using a durable email outbox. Message acceptance is independent of email delivery; retries use an idempotency key. Add an inbox email preference in Settings.
5. Build `/inbox`, acquisition settings in My Apps, a public profile acquisition card and `/for-sale` within existing components and routes. Public acquisition links use canonical app URLs and only published verified metrics.
6. Add aggregate marketplace counts and reported-message review entry points to the existing admin surface without default administrator access to private message content.

## Rollout gates

- Validate migration, RLS denial paths, concurrency, email throttling and moderation locally. Validate live Realtime and email delivery with two controlled users before enabling routes in production.
- Keep all existing apps `not_for_sale` by default. No acquisition payment or ownership transfer is introduced.
