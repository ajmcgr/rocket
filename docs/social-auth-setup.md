# X and GitHub sign-in setup

The login and signup pages support Google, X (OAuth 2.0), and GitHub through Supabase Auth. X and GitHub buttons stay disabled until the corresponding provider is enabled in Supabase's public Auth settings.

## Production provider setup

1. Create a GitHub OAuth App with homepage `https://tryrocket.ai` and authorization callback `https://lcujmvdgczkjxdstzhnr.supabase.co/auth/v1/callback`.
2. Create an X developer app with OAuth 2.0 user authentication. Set its callback to the same Supabase URL, website to `https://tryrocket.ai`, and the site's `/terms` and `/privacy` URLs in the corresponding fields. Enable **Request email from users**; Rocket's account/profile flows expect an email address.
3. In the [Supabase Auth providers dashboard](https://supabase.com/dashboard/project/lcujmvdgczkjxdstzhnr/auth/providers), enter each provider's client ID and client secret and enable **GitHub** and **X / Twitter (OAuth 2.0)**. Store secrets only in the provider dashboard, never in the repository or browser code. The legacy Twitter OAuth 1.0a provider is not used.
4. Ensure `https://tryrocket.ai/auth/callback` is allowed under Supabase Auth redirect URLs. Add the specific local development origin's `/auth/callback` only when testing locally.

## Verification

- `GET /auth/v1/settings` with the public publishable key should report `external.github: true` and `external.x: true` after configuration.
- Test both **Log in** and **Sign up** with a new account and with an existing email. Confirm the callback returns to a safe `next` path and creates/loads the user's profile.
- Test denial/cancellation, missing email from X, and account-linking behavior before advertising these methods as generally available.

Provider instructions: [Supabase GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github), [Supabase X / Twitter](https://supabase.com/docs/guides/auth/social-login/auth-twitter).
