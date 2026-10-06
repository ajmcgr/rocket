# Buy with Rocket: one-time purchases

Implementation extends production merchant registration, direct Stripe Checkout,
the signature-verified connected-account webhook, and the client-bound
`connect-entitlements` endpoint. Subscription records and cancellation are unchanged.
No public gate is opened by this change. Existing products default to `subscription`.

## Merchant registration

An authenticated app owner with Developer membership, the exact active production
OAuth client, and a ready current connected merchant account can POST to
`rocket-buy-developer`:

```json
{
  "action": "create_product",
  "app_id": "b202d75a-02ae-46e6-8419-5b3410cbaac8",
  "client_id": "rocket-dev-fZfbAEjB3Kp_eroMLQ_y4_fn",
  "name": "Launch Pro",
  "billing_type": "one_time",
  "amount_cents": 3900,
  "payment_return_uri": "https://trylaunch.ai/my-products?success=true"
}
```

Currency is USD. The return URI above was explicitly approved by the merchant.
Registration creates real connected-account Stripe Product/Price IDs and a new
canonical Rocket UUID and product key. It returns an inactive product, not a
claim of readiness. The inactive $39/month Pro product must remain untouched.
The existing activation, external integration confirmation and public gates remain.

## Checkout and fulfilment

POST `rocket-buy` with buyer authentication (Rocket session or the exact client's
OAuth access token), `action: checkout`, `app_id`, `client_id`, the returned
`product_key`, `return_uri`, and a fresh UUID `purchase_request_id` per intended
purchase. Retry the SAME UUID for that purchase; never replace it to retry a
completed payment. An open session is reused. A completed/expired request is not
recreated, including after Stripe's idempotency cache expires.

Checkout uses `mode: payment`, quantity one and a fixed 5% application fee ($1.95
for $39). It does not create a subscription. A return URL is navigation only and
is never proof of payment.

The existing isolated Connect endpoint must receive
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`charge.refunded` and `charge.dispute.created` events. Fulfilment retrieves the
canonical Checkout Session, PaymentIntent, captured Charge and line items in the
connected merchant context. Signature, environment, user/client/product, price,
quantity, amount, currency and application fee must match. No client-submitted
payment status or amount is accepted. Full refunds and disputes revoke units;
partial refunds do not revoke a complete purchase.

GET `connect-entitlements` using the buyer's client-bound token with
`entitlements:read`. Existing `entitlements` remain subscription-only. New
`purchases` contains `purchase_id`, `client_id`, `product_id`, `product_key`,
`quantity: 1`, `status`, `verified_paid`, and `purchased_at`.

Launch's SERVER must validate that response and atomically insert a fulfilment
record with UNIQUE(client_id, purchase_id) together with granting exactly one
Pro Launch for `status: granted` and `verified_paid: true`. Repeated responses,
webhooks and callbacks must be no-ops for that key. Rocket's ledger also uses a
unique purchase ID, connected-account PaymentIntent uniqueness and atomic,
row-locked settlement. Browser callbacks alone cannot grant units. Refunded or
disputed units cannot be restored by a stale successful Checkout event.

## Verification and remaining gates

Run `npx vitest run src/lib/oneTimePayments.test.ts src/lib/oneTimeHandlers.test.ts
src/lib/connectPaymentRules.test.ts src/lib/developerCheckout.test.ts`.
For an isolated PostgreSQL ledger test install @electric-sql/pglite temporarily
and run `PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node
scripts/test-one-time-ledger.mjs` from the repository root.

These are local regression tests, NOT a real Stripe payment verification. Stripe
dashboard access was denied by a saved browser permission; no CLI/API account
calls may circumvent it. Live product registration and an actual payment/refund
and Launch fulfilment test remain unverified. Do not set integration confirmation
or open public checkout on the strength of these mocks. Do not invent product
IDs or keys to complete registration.

References: https://docs.stripe.com/connect/direct-charges and
https://docs.stripe.com/checkout/fulfillment.
