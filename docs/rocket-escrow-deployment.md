# Rocket Deals Escrow.com sandbox deployment

This integration extends the existing Deal Room and its locked 3% closing fee. **Production transaction creation is not implemented or enabled.** The Edge Function has a fixed sandbox endpoint, and creation requires a server flag plus two allowlisted Rocket test users. It never calls Stripe for acquisition funds.

## Provider contract

- [Escrow API basics](https://www.escrow.com/api/docs/basics): separate sandbox and production accounts; HTTP Basic authentication with account email and API key.
- [Create transaction](https://www.escrow.com/api/docs/create-transaction): a broker can be a party, with separate buyer-paid and seller-paid `broker_fee` items. Rocket sends the accepted purchase price and two locked Rocket fee amounts in USD, with a no-shipping general merchandise item and a whole-day inspection period.
- [Fetch transaction](https://www.escrow.com/api/docs/fetch-transaction): transactions can be fetched by ID or external reference. Rocket's reference is a reconciliation aid, **not** a documented provider idempotency guarantee.
- [Webhooks](https://www.escrow.com/api/docs/webhooks): provider events are hints only. Escrow.com documents no signature in this guide, so Rocket requires a private webhook URL token and fetches the full transaction before applying state.
- [Fund transaction](https://www.escrow.com/api/docs/fund-transaction): eligible card and PayPal payments use Escrow.com's hosted transaction payment URL; availability depends on the transaction. Other methods, including wire, are handled by Escrow.com, and Rocket never displays or stores bank instructions.
- [API reference](https://www.escrow.com/api/docs/reference): the reference currently says new transaction currencies are USD and euro, while the guide lists more. Rocket supports only USD in this first integration.

Escrow.com fees are separate from Rocket's broker fee. Rocket reports its fee as collected only when both broker fee schedules show disbursement to the broker. Purchase funds are displayed as secured only when the purchase schedule's `status.secured` is true in a freshly fetched provider transaction. Completion requires a close date and purchase disbursement to seller.

## Safe deployment order

1. Review `20261120143639_rocket_escrow_sandbox.sql` after confirming the existing Deals and closing-fee migrations are present. It has already been applied to Rocket's production Supabase project with transaction creation disabled. Back up the database before any recovery changes.
2. Deploy `rocket-escrow` with `verify_jwt = false`. The function independently verifies user JWTs. The webhook endpoint requires a secret URL token and verifies each event by fetching Escrow.com.
3. Set **server-only** secrets through Supabase secret management. Do not use `VITE_` variables or commit values:
   - `ESCROW_SANDBOX_EMAIL`: sandbox broker account email.
   - `ESCROW_SANDBOX_API_KEY`: API key for that same sandbox account.
   - `ROCKET_ESCROW_SANDBOX_TEST_USERS`: comma-separated Rocket UUIDs for the controlled buyer and seller.
   - `ROCKET_ESCROW_WEBHOOK_TOKEN`: long random token for the private webhook URL.
   - `ROCKET_ESCROW_SANDBOX_ENABLED`: leave unset/false until sandbox broker fee capability and controlled users are verified; set to `true` only for the test.
4. Register one sandbox webhook URL with Escrow.com: `https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-escrow?webhook=<private token>`. Do not paste or log the token. Register using the [documented webhook endpoint](https://www.escrow.com/api/docs/webhooks). The function never trusts incoming status fields.
5. Deploy the frontend only after the migration and function are live. Confirm two allowlisted accounts can load the Deal Room and all other users see no sandbox initiation action.
6. Run a full controlled sandbox lifecycle: accepted offer; two current agreement approvals; two current checklist approvals; Escrow.com creation; provider acceptance; funding; shipping/handover; receipt/inspection; completion; broker-fee disbursement. Test cancellation, refund, duplicate create clicks, timeout reconciliation, webhook replay, wrong-transaction webhook, and admin access.
7. Keep the sandbox flag off for ordinary production users. A separate production credential path and an explicit future enablement change are required after provider approval, legal disclosures, backup/recovery review, and sandbox evidence.

## Recovery and limitations

Creation is claimed once in the database. If Escrow.com times out after a POST, Rocket will not POST again. Investigate the reference in Escrow.com's dashboard/API and reconcile it before any manual recovery. An unmatched claimed attempt remains `reconciliation_required`; never reset it without provider evidence.

The provider account's broker commission permissions, supported software-asset category, payment methods, customer countries, and full disbursement lifecycle have not been verified against Rocket's actual account. No sandbox credentials or controlled buyer/seller accounts were available in this implementation session. Do not infer readiness from a passing mocked test or from a deployed function.

Provider status is refreshed by an allowlisted participant/admin or a webhook; no scheduled polling is configured. Provider-hosted acceptance and payment are used. Rocket does not submit acceptance, shipping, inspection, cancellation, or dispute actions on behalf of a participant. Escrow.com controls those actions.
