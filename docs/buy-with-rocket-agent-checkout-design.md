# Buy with Rocket: connected-catalog checkout

## Desired merchant experience

The merchant connects its existing Stripe account once. Its coding agent integrates a Buy with Rocket button and verified entitlement handling in the merchant app. Rocket reads Stripe prices on the connected account and creates the payment when a buyer selects a product. There is no Rocket-side product creation, price import, access-key form, or per-product activation UI. Rocket collects 5% only on payments it creates through Buy with Rocket.

The same checkout endpoint must serve the Rocket app page and a merchant site's server-side button handler. A browser must never supply an authoritative amount, merchant account, fee, or entitlement. The merchant's existing Stripe checkouts continue unchanged and do not acquire a Rocket fee.

## Implemented contract and release gate

The owner-authenticated `rocket-buy-developer` `register_offer` action records a
stable `product_key` for each offer. For a reusable Stripe Price, the agent
provides its exact ID and Rocket retrieves it on the current connected account.
For a fixed inline one-time offer, the agent provides the existing app's name
and USD amount; Rocket records those terms and creates Stripe Checkout with
`price_data`. Monthly and annual subscriptions use verified recurring Stripe
Prices. Registration does not activate checkout. An active offer's amount,
currency, billing type, merchant, Stripe identity, fee, key and approved return
URI cannot be edited; a commercial change requires a new offer row.

The public `rocket-buy` catalog returns `offers[]`. Checkout requires the
selected `product_key`, rechecks the current merchant and fixed Stripe Price
when present, and uses the stored terms and 500 basis-point fee. It reserves a
buyer/offer/merchant attempt before creating the Stripe session. Every checkout
requires an approved return URI and a stable purchase-request UUID so retries
reuse the same Stripe session across one-time and subscription offers. The signed
webhook remains the only source of paid state. `connect-entitlements` returns
each offer's Rocket and Stripe identifiers to support precise fulfilment.

**Do not deploy this draft as a complete payment launch.** The current Launch
production client has no test-environment counterpart, the current merchant's
Pro/Grow/Pass offers are not registered and verified, and Launch's existing
fulfilment handles only one configured Pro offer. No natural test-mode or live
purchase has been demonstrated for this contract. Keep the global live switch
off until those gates pass. A safe rollback after schema deployment is to turn
off the global switch, restore the prior Edge Functions, and retire any new
offers; financial history and the additive nullable/`price_source` columns
remain intact. Reinstating the old one-active index requires retiring extra
active offers first.

## Current blockers in source and production

- `rocket-buy` accepts a single active `connect_products` row for the app. Production has the `connect_products_one_active_client_idx` unique index.
- `rocket-buy-developer` requires an explicit `import_price` or `create_plan`, followed by an integration confirmation and activation. The screenshot shows this legacy path.
- `AppProfileBuyAction` renders one plan. `rocket-buy` status and cancellation choose an app-level purchase rather than a selected price.
- One-time checkout and webhook verification use a recorded `connect_products` row and checkout attempt. That binding must remain durable even if a Stripe price changes or is archived after purchase.
- Launch's existing Pro and Grow checkout creates inline Stripe `price_data`; these are not discoverable as reusable catalog prices. Launch Pass has a reusable annual price. Connected Stripe access alone cannot infer which Launch access rule each price or inline quote fulfils.
- Production `rocket_buy_configuration.live_checkout_enabled` is false and `platform_fee_bps` is 500. Do not turn on public checkout as part of a UI change.

## Target API and ledger behavior

1. **Catalog:** On each request, resolve the verified Rocket app and its current connected Stripe merchant. Read eligible active Stripe products/prices in that account, paginate, and expose only supported saleable price types. An exact Stripe price ID identifies a fixed offer. Do not treat a similar name or amount as identity. Restrict any public list to products deliberately approved for public sale; Stripe's `active` flag alone is not a publication signal.
2. **Merchant-site checkout:** The merchant's server handles the Rocket Button event and calls Rocket with its authenticated Rocket user/client context, app ID, exact price ID or a server-authorized inline quote, approved HTTPS return URI, and stable purchase-request ID. Rocket re-fetches or verifies the quote server-side, checks account/client ownership and checkout readiness, calculates the 5% fee, and creates a direct-charge Stripe Checkout Session under the connected account. It never accepts a fee or final amount from browser input.
3. **Rocket-site checkout:** The app page shows eligible offers and sends the selected price ID to the same endpoint. A buyer must see the product, amount, billing cadence and terms before being sent to Stripe. No silent purchase or automatic checkout from account connection.
4. **Durable payment binding:** Before session creation, atomically record a snapshot of connected account, client, Stripe product/price (or validated inline quote), amount, currency, billing type and 500-basis-point fee in the Connect ledger. Keep the verified snapshot and Stripe session/attempt unique. Multiple offers per app require replacing the one-active-plan index without rewriting historical transactions.
5. **Webhook and access:** Only signed Stripe events and freshly retrieved payment objects can create paid transactions, purchases, subscriptions and entitlements. Extend `connect-entitlements` with the Stripe price/product identity so the merchant's agent can connect each verified purchase to existing access rules. Keep purchase ID as the one-time fulfilment idempotency key. Refunds, disputes, expiration and revocation continue to remove access. Return URLs never grant access.
6. **Inline prices:** A connected Stripe catalog cannot find the Pro/Grow inline prices Launch currently creates at checkout. Support them through a merchant-server-authorized quote path, or first let the merchant's agent introduce reusable Stripe prices in its own app. Do not guess from the current `Launch · $39` catalog entry or create duplicate prices automatically.
7. **Readiness:** Replace per-price manual activation with an app-level integration gate established through verified agent tests. Keep the global live-checkout switch separate. Account connection alone does not prove that the merchant app can fulfil or revoke access.

## Required verification before live rollout

Test multi-offer isolation, price/account/client substitution, stale and archived prices, inline-quote authorization, duplicate checkout requests, exact 5% fee for one-time and recurring charges, webhook replay/out-of-order delivery, refund/dispute/cancellation, buyer Library, and merchant fulfilment for each access model. Preserve current Stripe and Rocket financial records. Complete a controlled real purchase only with separate authorization; do not infer success from a redirect. Roll out behind a disabled feature gate, then verify source, migration, Edge Functions and frontend in that order.

This design removes Rocket-site mapping work, not the necessary agent work inside a merchant's app: it must still link a verified Stripe product/price or quote to the app's existing fulfilment semantics. Rocket cannot determine those semantics from Stripe access alone.
