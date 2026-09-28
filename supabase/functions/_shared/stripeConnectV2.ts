// Accounts v2 is a separate Stripe API surface. Keep its preview version
// explicit and isolated from Rocket's existing Stripe billing integration.
export const STRIPE_ACCOUNTS_V2_VERSION = "2026-08-26.dahlia";

type StripeErrorBody = { error?: { code?: string; message?: string; type?: string } };

export class StripeConnectV2Error extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string, readonly requestId: string | null) {
    super(message);
  }
}

function key() {
  const value = Deno.env.get("STRIPE_CONNECT_TEST_SECRET_KEY");
  return value?.startsWith("sk_test_") ? value : null;
}

async function request(path: string, init: RequestInit = {}, idempotencyKey?: string) {
  const secret = key();
  if (!secret) throw new StripeConnectV2Error(503, "connect_test_mode_not_configured", "Rocket Connect test mode is not configured", null);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  headers.set("Stripe-Version", STRIPE_ACCOUNTS_V2_VERSION);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const response = await fetch(`https://api.stripe.com${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({})) as StripeErrorBody & Record<string, unknown>;
  if (!response.ok) throw new StripeConnectV2Error(response.status, body.error?.code, body.error?.message || "Stripe Accounts v2 request failed", response.headers.get("request-id"));
  return body;
}

export type StripeConnectV2Account = {
  id: string;
  configuration?: { merchant?: { capabilities?: { card_payments?: { status?: string }; stripe_balance?: { payouts?: { status?: string } } } } };
  defaults?: { responsibilities?: { fees_collector?: string; losses_collector?: string; requirements_collector?: string } };
  requirements?: unknown;
  dashboard?: string;
};

const accountInclude = "?include=configuration.merchant&include=defaults&include=requirements";

export async function createStripeConnectV2Merchant(input: { email?: string; displayName: string; clientId: string; userId: string; country: string }) {
  return await request("/v2/core/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contact_email: input.email,
      display_name: input.displayName,
      // Stripe requires the connected merchant's country before it will add
      // a Merchant configuration. This is explicitly selected by the invited
      // developer; never infer it from an email address, IP, or workspace.
      identity: { country: input.country.toLowerCase() },
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
      defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
      // Stripe's current v2 rules require the full hosted Dashboard with both
      // responsibilities assigned to Stripe; Express is not a valid pairing.
      dashboard: "full",
      metadata: { rocket_client_id: input.clientId, rocket_developer_user_id: input.userId, rocket_environment: "test", rocket_accounts_api: "v2" },
      include: ["configuration.merchant", "defaults", "requirements"],
    }),
  }, `rocket-connect-v2-account-${input.clientId}-${input.userId}`) as StripeConnectV2Account;
}

export async function retrieveStripeConnectV2Merchant(accountId: string) {
  return await request(`/v2/core/accounts/${encodeURIComponent(accountId)}${accountInclude}`) as StripeConnectV2Account;
}

export function stripeConnectV2Ready(account: StripeConnectV2Account) {
  const capabilities = account.configuration?.merchant?.capabilities;
  return capabilities?.card_payments?.status === "active" && capabilities?.stripe_balance?.payouts?.status === "active";
}

// Account Links remain the Stripe-hosted onboarding mechanism. Their v1
// endpoint accepts the connected account ID returned by Accounts v2.
export async function createStripeHostedOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string) {
  const secret = key();
  if (!secret) throw new StripeConnectV2Error(503, "connect_test_mode_not_configured", "Rocket Connect test mode is not configured", null);
  const form = new URLSearchParams({ account: accountId, refresh_url: refreshUrl, return_url: returnUrl, type: "account_onboarding" });
  const response = await fetch("https://api.stripe.com/v1/account_links", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": STRIPE_ACCOUNTS_V2_VERSION, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = await response.json().catch(() => ({})) as StripeErrorBody & { url?: string };
  if (!response.ok || !body.url) throw new StripeConnectV2Error(response.status, body.error?.code, body.error?.message || "Stripe onboarding link could not be created", response.headers.get("request-id"));
  return body.url;
}
