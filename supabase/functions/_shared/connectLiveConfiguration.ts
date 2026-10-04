// Keep Create billing's webhook secret and handler independent. A copied
// secret is not evidence of a connected-account event destination.
export function isolatedLiveWebhookSecret(connectSecret?: string, billingSecret?: string): string | null {
  return connectSecret?.startsWith("whsec_") && connectSecret !== billingSecret ? connectSecret : null;
}
export function liveWebhookConfigured(connectSecret?: string, billingSecret?: string) {
  return !!isolatedLiveWebhookSecret(connectSecret, billingSecret);
}
