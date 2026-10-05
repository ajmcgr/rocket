import { describe, expect, it } from "vitest";
import { googleAnalyticsApiError, googleAnalyticsAuthorizationError } from "../../supabase/functions/_shared/ga4Errors";

describe("safe Google Analytics diagnostics", () => {
  it("identifies the actual API consumer without exposing raw provider content", () => {
    const error = googleAnalyticsApiError(403, { error: { message: "secret-token", details: [{ reason: "SERVICE_DISABLED", metadata: { service: "analyticsadmin.googleapis.com", consumer: "projects/123", token: "secret-token" } }] } });
    expect(error.diagnostics).toEqual({ upstream_status: 403, google_reason: "SERVICE_DISABLED", google_service: "analyticsadmin.googleapis.com", google_consumer: "projects/123" });
    expect(error.message).toContain("OAuth client's Google Cloud project");
    expect(JSON.stringify(error)).not.toContain("secret-token");
  });
  it("distinguishes insufficient OAuth scopes", () => {
    expect(googleAnalyticsApiError(403, { error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }).message).toContain("read-only permission");
  });
  it("discards arbitrary metadata and unknown reasons", () => {
    expect(googleAnalyticsApiError(403, { error: { details: [{ reason: "secret-token", metadata: { service: "evil.example", consumer: "secret-token" } }] } }).diagnostics).toEqual({ upstream_status: 403, google_reason: "UNKNOWN", google_service: null, google_consumer: null });
  });
  it("handles malformed or non-JSON provider errors safely", () => {
    expect(googleAnalyticsApiError(403, null).diagnostics.google_reason).toBe("UNKNOWN");
    expect(googleAnalyticsApiError(403, { error: { details: [null] } }).diagnostics.google_reason).toBe("UNKNOWN");
  });
  it("identifies revoked refresh grants without keeping descriptions or tokens", () => {
    const error = googleAnalyticsAuthorizationError(400, { error: "invalid_grant", error_description: "secret-token" }, "refresh_token");
    expect(error.message).toContain("expired or was revoked");
    expect(error.diagnostics).toEqual({ upstream_status: 400, oauth_reason: "invalid_grant", stage: "refresh_token" });
    expect(JSON.stringify(error)).not.toContain("secret-token");
  });
  it("distinguishes client configuration errors and discards unknown OAuth text", () => {
    expect(googleAnalyticsAuthorizationError(401, { error: "invalid_client" }, "refresh_token").message).toContain("client configuration");
    expect(googleAnalyticsAuthorizationError(400, { error: "secret-token" }, "refresh_token").diagnostics.oauth_reason).toBe("UNKNOWN");
  });
});
