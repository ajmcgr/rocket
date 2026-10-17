import { track } from "./analytics";

type Kind = "analytics" | "revenue";
// Called only after an authenticated provider handler returned without error.
// Deliberately never forward the response, app/owner IDs, provider, credentials,
// values, connection status or sync timestamps to a third-party tracker.
export function trackVerificationResult(
  kind: Kind,
  provider: string,
  action: string,
  result: any,
  appId = "current-app",
) {
  if (!result || result.error) return;
  const completeSync =
    result.sync && !result.sync.error && result.sync.complete !== false;
  const mapped =
    kind === "revenue" && action === "save_mapping" && result.saved === true;
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
    (["select_property", "retry_sync", "sync"].includes(action) &&
      completeSync) ||
    mapped
  ) {
    track(
      kind === "analytics"
        ? "analytics_sync_succeeded"
        : "revenue_sync_succeeded",
      { source: "verified_provider_response" },
    );
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
      if (
        params.get(provider) === "connected" &&
        !sessionStorage.getItem(key)
      ) {
        sessionStorage.setItem(key, "1");
        connectionConfirmed("verified_oauth_response");
      }
    } catch {
      /* telemetry never affects the provider flow */
    }
  }
}
