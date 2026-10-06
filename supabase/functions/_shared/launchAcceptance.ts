export const LAUNCH_APP_ID = "b202d75a-02ae-46e6-8419-5b3410cbaac8";
export const LAUNCH_CLIENT_ID = "rocket-dev-fZfbAEjB3Kp_eroMLQ_y4_fn";
export const LAUNCH_ACCESS_URL = "https://gzpypxgdkxdynovploxn.supabase.co/functions/v1/launch-rocket-access";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function pilotBuyer(userId: string | undefined, ownerId: string | undefined, configuredBuyer: string | undefined) {
  return !!configuredBuyer && uuid.test(configuredBuyer) && !!ownerId && userId === configuredBuyer && userId !== ownerId;
}
export function acceptancePlan(plan: any, planId: string | undefined, accountId: string, ownerId: string) {
  return !!planId && uuid.test(planId) && !!plan && plan.id === planId && plan.client_id === LAUNCH_CLIENT_ID &&
    plan.developer_account_id === accountId && plan.developer_user_id === ownerId && plan.amount_cents === 100 &&
    plan.currency === "usd" && plan.interval === "month" && plan.platform_fee_bps === 500;
}
export function paidAcceptanceProof(transaction: any, entitlement: any, buyer: string, plan: any, merchant: string, now = Date.now()) {
  return !!transaction && transaction.user_id === buyer && transaction.client_id === LAUNCH_CLIENT_ID &&
    transaction.product_id === plan.id && transaction.developer_account_id === plan.developer_account_id &&
    transaction.stripe_account_id === merchant && transaction.status === "paid" && transaction.amount_cents === 100 &&
    transaction.application_fee_cents === 5 && transaction.currency === "usd" &&
    typeof transaction.stripe_checkout_session_id === "string" && transaction.stripe_checkout_session_id.startsWith("cs_live_") &&
    typeof transaction.stripe_invoice_id === "string" && typeof transaction.stripe_subscription_id === "string" &&
    !!entitlement && entitlement.user_id === buyer && entitlement.client_id === LAUNCH_CLIENT_ID &&
    entitlement.product_id === plan.id && entitlement.transaction_id === transaction.id && entitlement.status === "active" &&
    !entitlement.revoked_at && typeof entitlement.valid_until === "string" && Number.isFinite(Date.parse(entitlement.valid_until)) && Date.parse(entitlement.valid_until) > now;
}
