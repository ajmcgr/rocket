import type Stripe from "npm:stripe@16.12.0";
import { retrieveStripeConnectV2Merchant, stripeConnectV2Ready } from "./stripeConnectV2.ts";

export type BuyMerchantRecord = {
  stripe_account_id: string;
  stripe_api_version: string;
  account_configuration?: { connection_method?: string } | null;
};

// Historical v1 proof accounts are never accepted for production checkout.
// Only an owner-selected Standard OAuth account or Rocket's existing v2
// merchant onboarding can become a live Buy with Rocket merchant.
export async function buyMerchantReadiness(account: BuyMerchantRecord, stripe: Stripe) {
  if (account.stripe_api_version === "v2") {
    const remote = await retrieveStripeConnectV2Merchant(account.stripe_account_id, "production");
    const ready = stripeConnectV2Ready(remote);
    return {
      ready,
      chargesEnabled: ready,
      payoutsEnabled: ready,
      configuration: { dashboard: remote.dashboard || null, defaults: remote.defaults || {}, requirements: remote.requirements || null },
    };
  }
  if (account.stripe_api_version === "v1" && account.account_configuration?.connection_method === "oauth") {
    const remote = await stripe.accounts.retrieve(account.stripe_account_id);
    if (remote.id !== account.stripe_account_id || remote.type !== "standard") return { ready: false, chargesEnabled: false, payoutsEnabled: false, configuration: account.account_configuration };
    const chargesEnabled = remote.charges_enabled === true && remote.capabilities?.card_payments === "active";
    const payoutsEnabled = remote.payouts_enabled === true;
    return { ready: chargesEnabled && payoutsEnabled, chargesEnabled, payoutsEnabled, configuration: account.account_configuration };
  }
  return { ready: false, chargesEnabled: false, payoutsEnabled: false, configuration: account.account_configuration || {} };
}
