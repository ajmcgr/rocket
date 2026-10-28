import { track, type AnalyticsEvent } from "./analytics";

type Kind = "analytics" | "revenue";
type Journey = { appId: string; kind: Kind; provider: string };

/** Identifiers and event time only; never send provider responses or metric values. */
export function trackVerificationJourney(event: AnalyticsEvent, journey: Journey, details: Record<string, string> = {}) {
  track(event, {
    app_id: journey.appId,
    provider_category: journey.kind,
    verification_type: journey.kind,
    provider: journey.provider,
    occurred_at: new Date().toISOString(),
    ...details,
  });
}

export function trackVerificationEntry(appId: string, kind: Kind) {
  const key = `rocket:verification-entry:${kind}:${appId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch { /* telemetry is optional */ }
  trackVerificationJourney("verification_entry_viewed", { appId, kind, provider: "all" });
}
// Called only after an authenticated provider handler returned without error.
// Deliberately never forward the response, app/owner IDs, provider, credentials,
// values, connection status or sync timestamps to a third-party tracker.
export function trackVerificationResult(
  kind: Kind,
  provider: string,
  action: string,
  result: any,
  appId = "current-app",
  details: Record<string, unknown> = {},
) {
  if (!result || result.error) return;
  const journey = { appId, kind, provider };
  if (action === "start" && typeof result.authorization_url === "string") {
    trackVerificationJourney("verification_connection_started", journey);
    try { sessionStorage.setItem(`rocket:verification-oauth-start:${provider}:${appId}`, "1"); } catch { /* optional */ }
  }
  const completeSync = Boolean(result.sync && !result.sync.error && result.sync.complete !== false);
  const mapped = kind === "revenue" && action === "save_mapping" && result.saved === true && completeSync;
  const connected =
    (["connect", "connect_api_key"].includes(action) &&
      result.connected === true) ||
    (action === "select_property" && completeSync) ||
    mapped;
  const connectionKey = `rocket:verified-connection:${provider}:${appId}`;
  const connectionConfirmed = (source: string) => {
    try {
      if (sessionStorage.getItem(connectionKey)) return;
      sessionStorage.setItem(connectionKey, "1");
    } catch {
      /* storage is optional */
    }
    track(kind === "analytics" ? "analytics_connected" : "revenue_connected", {
      source,
    });
    trackVerificationJourney("verification_connection_authorized", journey);
  };
  if (action === "disconnect" && result.disconnected === true) {
    try {
      sessionStorage.removeItem(connectionKey);
    } catch {
      /* optional */
    }
  }
  if (connected) connectionConfirmed("verified_provider_response");
  if (
    ["select_property", "retry_sync", "sync", "save_mapping"].includes(action) && completeSync
  ) {
    track(
      kind === "analytics"
        ? "analytics_sync_succeeded"
        : "revenue_sync_succeeded",
      { source: "verified_provider_response" },
    );
  }
  if (["select_property", "select_project", "retry_sync", "sync", "save_mapping"].includes(action)
      && ((provider === "ga4" && result.sync && !result.sync.error && typeof result.sync.points === "number")
        || (provider === "posthog" && result.sync?.complete === true)
        || (["revenuecat", "polar", "dodo"].includes(provider) &&
          completeSync && ["save_mapping", "sync"].includes(action))
        || (provider === "stripe" && action === "sync" && result.sync?.source_livemode === true
          && Array.isArray(result.sync.currencies)
          && result.sync.currencies.length > 0
          && result.sync.currencies.every((point: { verification_status?: string }) => point.verification_status === "verified")))) {
    trackVerificationJourney("verification_sync_completed", journey);
  }
  if (action === "set_visibility" && typeof details.visibility === "string") {
    trackVerificationJourney("verification_visibility_changed", journey, { visibility: details.visibility });
  }
  // OAuth success parameters alone are not proof: require an authorized status
  // response as well, and don't count refreshes of the callback twice.
  if (
    action === "status" &&
    ["active", "select_property", "select_project"].includes(
      result.connection?.status,
    )
  ) {
    try {
      const params = new URLSearchParams(window.location.search);
      const key = `rocket:verified-callback:${provider}:${window.location.pathname}`;
      const pendingKey = `rocket:verification-oauth-start:${provider}:${appId}`;
      if (
        (params.get(provider) === "connected" || sessionStorage.getItem(pendingKey)) &&
        !sessionStorage.getItem(key)
      ) {
        sessionStorage.setItem(key, "1");
        sessionStorage.removeItem(pendingKey);
        connectionConfirmed("verified_oauth_response");
      }
    } catch {
      /* telemetry never affects the provider flow */
    }
  }
}
