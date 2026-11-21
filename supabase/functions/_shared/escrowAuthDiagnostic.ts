import { EscrowApiError } from "./escrowCom.ts";

export type AuthDiagnosticCategory =
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "not_configured"
  | "credentials_rejected"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_rejected"
  | "timeout_or_invalid_response"
  | "internal_error";

export type AuthDiagnosticResult = {
  authenticated: boolean;
  category: AuthDiagnosticCategory | null;
  timestamp: string;
};

export function diagnosticResult(
  authenticated: boolean,
  category: AuthDiagnosticCategory | null,
  now: () => Date = () => new Date(),
): AuthDiagnosticResult {
  return { authenticated, category, timestamp: now().toISOString() };
}

export function diagnosticErrorCategory(error: unknown): AuthDiagnosticCategory {
  if (error instanceof EscrowApiError) {
    if (error.status === 401 || error.status === 403) return "credentials_rejected";
    if (error.status === 429) return "provider_rate_limited";
    if (error.status >= 500) return "provider_unavailable";
    return "provider_rejected";
  }
  return "timeout_or_invalid_response";
}
