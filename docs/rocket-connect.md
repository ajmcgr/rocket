# Rocket Developer — OAuth integration guide

Rocket Developer is a minimal OAuth 2.1 / OpenID Connect identity provider. It deliberately does **not** expose a Rocket Supabase Auth access token, refresh token, or product data to third parties.

## Endpoints

- Authorization endpoint: `https://tryrocket.ai/connect/authorize`
- Token endpoint: `https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-connect-token`
- UserInfo endpoint: `https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-connect-userinfo`
- Discovery: `https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-connect-discovery`
- JWKS: `https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-connect-jwks`

## Supported Phase 1 flow

Use authorization code with `S256` PKCE. `openid` is mandatory; `profile` and `email` are optional. The authorization request requires `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, and `code_challenge_method=S256`. `nonce` is supported for OIDC.

Redirect URIs are exact string matches against the registered client. They must be HTTPS, except an explicitly registered `localhost` or `127.0.0.1` loopback URI. Fragments, credentials, wildcard hosts, and arbitrary ports are rejected.

At the token endpoint send form-urlencoded `grant_type=authorization_code`, `client_id`, `code`, `redirect_uri`, and `code_verifier`. Authorization codes are one-time, SHA-256 stored values with a five-minute lifetime. Access tokens are opaque, SHA-256 stored values with a one-hour lifetime. Validate ID tokens against the JWKS (ES256); never treat an unverified ID token as identity.

## Local independent proof client

The separate example app is in `examples/rocket-connect-test-client`; it does not import Rocket frontend code or use Rocket’s session.

```sh
cd examples/rocket-connect-test-client
npm start
```

Open `http://localhost:3001`, select **Continue with Rocket**, authenticate with an existing Rocket user, review consent, and return to the example app. Its own HTTP-only local session displays the `/userinfo` identity. Revoke the connection in Rocket at **Settings → Account → Connected applications**, then repeat the authorization flow to demonstrate reauthorization. Existing test registration allows only `http://localhost:3001/callback` and `http://127.0.0.1:3001/callback`.

## Required deployment secret

Before issuing real ID tokens, set `ROCKET_CONNECT_OIDC_PRIVATE_JWK` as a Supabase Edge Function secret to one ES256/P-256 private JWK. Example safe local generation:

```sh
node --input-type=module -e 'import { webcrypto } from "node:crypto"; const k=await webcrypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]); console.log(JSON.stringify(await webcrypto.subtle.exportKey("jwk",k.privateKey)))'
```

Assign a stable `kid` before setting the secret. Keep the private JWK only in Supabase secrets; clients use the public JWKS endpoint. Rotate by publishing both public keys during a transition—do not replace a live signing key without a rotation plan.

## Registering another app

Rocket’s invitation-only Developer portal can register a public test client. Each invited developer can manage their own app name, icon, exact OAuth callback URI, exact Checkout return URI, and enabled state. Browser clients never write `rocket_oauth_clients` directly.

Callback and Checkout return URIs are stored as exact values: no wildcard host, URI prefix, credentials, fragment, or arbitrary HTTP host is accepted. Disabling an app immediately revokes its existing Rocket Developer access tokens and unused authorization codes; it can no longer start authorizations, exchange codes, or read entitlements. Re-enabling an app does not restore old tokens—authenticate again.

This proof accepts **public PKCE clients only**. The schema reserves `confidential` clients for a later phase, but both authorization and token endpoints reject them until server-side client authentication is implemented.

## Stripe Connect test payments

Developers use Stripe-hosted onboarding for Accounts v2 merchant accounts, with Stripe’s full Dashboard. The approved live platform uses direct charges: the developer is the seller, Stripe collects processing fees from that seller, and Stripe is responsible for connected-account negative balances. New plans use a 5% Rocket application fee, separate from Stripe processing fees. Historical sandbox plans and transactions retain their recorded 10% rate and amounts; never rewrite that evidence. Live approval alone does not activate public buying: membership, verified app ownership, merchant readiness, registered live pricing, and verified entitlement integration are still required.

The existing checkout contract, authorization-code PKCE flow, server-side product validation, connected-account webhooks, and entitlement endpoint are unchanged. Rocket never grants access from a checkout return URL: the independent app must wait for a webhook-backed active entitlement. Legacy Connect account/product rows remain historical evidence and cannot be made current by browser input.

## Revocation and rollback

The account surface marks the user’s authorization revoked and invalidates active opaque access tokens and unused codes for that authorization. Reauthorization creates a fresh grant and code. Roll back the frontend/functions first if needed; do not delete OAuth audit, code, or token records during an incident.

Run `npm run test:rocket-connect` after deployment for public security smoke checks: discovery/JWKS availability, secret-free JWKS, strict redirects, invalid clients/scopes, and PKCE `S256` enforcement.

## Official Rocket Buttons

Use the versioned hosted kit at `https://tryrocket.ai/buttons/v1/rocket-buttons.js` for both fixed labels: **Continue with Rocket** and **Buy with Rocket**. The same implementation powers Rocket’s own controls. Preview the primary blue, dark, light, loading and disabled states at [Buy with Rocket](https://tryrocket.ai/buy-with-rocket#rocket-buttons). Follow the [brand usage spec](https://tryrocket.ai/buttons/v1/brand-usage.html).

Attach your existing sign-in or purchase handler to `rocket-activate`. The kit owns presentation only, makes no OAuth/payment requests, and accepts no custom mark or wording. Keep existing OAuth and payment eligibility/entitlement checks. Set the boolean `loading` attribute during the existing handler and remove it when complete; set `disabled` when ineligible.
