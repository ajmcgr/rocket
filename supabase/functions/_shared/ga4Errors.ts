// Only allowlisted diagnostic fields are retained. Never forward Google's raw
// message/metadata, request URLs, authorization headers, or token responses.
export class GoogleAnalyticsApiError extends Error {
  constructor(public readonly diagnostics: { upstream_status: number; google_reason: string; google_service: string | null; google_consumer: string | null }) {
    const reason = diagnostics.google_reason;
    super(reason === "SERVICE_DISABLED"
      ? "Google Analytics API is disabled in the OAuth client's Google Cloud project"
      : reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT"
        ? "Google Analytics read-only permission is missing; reconnect and grant Analytics access"
        : "Google Analytics denied the request; check the connected account's Analytics access");
  }
}

export function googleAnalyticsApiError(status: number, body: unknown) {
  const root = body as { error?: { details?: Array<{ reason?: unknown; metadata?: Record<string, unknown> }> } } | null;
  const details = Array.isArray(root?.error?.details) ? root.error.details : [];
  const allowed = ["SERVICE_DISABLED", "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "PERMISSION_DENIED", "CONSUMER_INVALID", "BILLING_DISABLED", "RATE_LIMIT_EXCEEDED"];
  const info = details.find((detail) => detail && typeof detail.reason === "string" && allowed.includes(detail.reason));
  const service = info?.metadata?.service;
  const consumer = info?.metadata?.consumer;
  return new GoogleAnalyticsApiError({
    upstream_status: status,
    google_reason: typeof info?.reason === "string" ? info.reason : "UNKNOWN",
    google_service: service === "analyticsadmin.googleapis.com" || service === "analyticsdata.googleapis.com" ? service : null,
    google_consumer: typeof consumer === "string" && /^projects\/\d+$/.test(consumer) ? consumer : null,
  });
}
