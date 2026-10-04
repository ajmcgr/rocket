# Rocket Developer external-developer proof client

This is an independently runnable local web application for the Phase 3 proof.
It intentionally requires a client ID and product key created through Rocket's
Developer UI; it cannot fall back to the Phase 1/2 provisioned test client.

```bash
PORT=3002 \
ROCKET_CLIENT_ID=rocket-dev-... \
ROCKET_PRODUCT_KEY=your-product-key \
ROCKET_REDIRECT_URI=http://127.0.0.1:3002/callback \
npm start
```

The registered OAuth callback must exactly equal `ROCKET_REDIRECT_URI`. The
registered checkout-return URI must be `http://127.0.0.1:3002/`.

The current minimal reference server is shared with the Phase 1 test harness
for its PKCE, state, nonce, JWKS/ID-token validation, local-session and code-
replay checks. It is launched as a separate process and runs under the new
developer-created client ID. Before final proof, set its product key in the
server configuration; no Rocket credentials, Stripe secret, or service key is
needed by this app.
