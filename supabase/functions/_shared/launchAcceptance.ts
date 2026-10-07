export const LAUNCH_APP_ID = "b202d75a-02ae-46e6-8419-5b3410cbaac8";
export const LAUNCH_CLIENT_ID = "rocket-dev-fZfbAEjB3Kp_eroMLQ_y4_fn";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function pilotBuyer(userId: string | undefined, ownerId: string | undefined, configuredBuyer: string | undefined) {
  return !!configuredBuyer && uuid.test(configuredBuyer) && !!ownerId && userId === configuredBuyer && userId !== ownerId;
}
export function acceptancePlan(plan: any, planId: string | undefined, accountId: string, ownerId: string) {
  return !!planId && uuid.test(planId) && !!plan && plan.id === planId && plan.client_id === LAUNCH_CLIENT_ID &&
    plan.developer_account_id === accountId && plan.developer_user_id === ownerId && plan.amount_cents === 3900 &&
    plan.currency === "usd" && plan.billing_type === "one_time" && plan.interval === null && plan.platform_fee_bps === 500 &&
    Array.isArray(plan.checkout_return_uris) && plan.checkout_return_uris.includes("https://trylaunch.ai/my-products?success=true");
}
export function paidProProof(t: any, g: any, userId: string, p: any, merchant: string) {
  return !!t && !!g && t.user_id === userId && t.client_id === LAUNCH_CLIENT_ID && t.product_id === p.id &&
    t.developer_account_id === p.developer_account_id && t.stripe_account_id === merchant && t.status === 'paid' &&
    t.amount_cents === 3900 && t.application_fee_cents === 195 && t.currency === 'usd' && t.stripe_subscription_id === null &&
    typeof t.stripe_checkout_session_id === 'string' && t.stripe_checkout_session_id.startsWith('cs_live_') &&
    typeof t.stripe_payment_intent_id === 'string' && t.stripe_payment_intent_id.startsWith('pi_') &&
    g.purchase_id === t.id && g.user_id === userId && g.client_id === LAUNCH_CLIENT_ID && g.product_id === p.id && g.quantity === 1 && g.status === 'granted';
}
