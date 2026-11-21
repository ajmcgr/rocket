import { describe, expect, it } from "vitest";
import { diagnosticErrorCategory, diagnosticResult } from "../../supabase/functions/_shared/escrowAuthDiagnostic";
import { EscrowApiError } from "../../supabase/functions/_shared/escrowCom";

describe("Escrow.com authentication diagnostic", () => {
  it("returns only a safe status, category and timestamp", () => {
    expect(diagnosticResult(true, null, () => new Date("2026-11-21T00:00:00Z"))).toEqual({
      authenticated: true, category: null, timestamp: "2026-11-21T00:00:00.000Z",
    });
    expect(Object.keys(diagnosticResult(false, "forbidden"))).toEqual(["authenticated", "category", "timestamp"]);
  });

  it("classifies provider failures without exposing response or credentials", () => {
    expect(diagnosticErrorCategory(new EscrowApiError(401))).toBe("credentials_rejected");
    expect(diagnosticErrorCategory(new EscrowApiError(403))).toBe("credentials_rejected");
    expect(diagnosticErrorCategory(new EscrowApiError(429))).toBe("provider_rate_limited");
    expect(diagnosticErrorCategory(new EscrowApiError(503))).toBe("provider_unavailable");
    expect(diagnosticErrorCategory(new Error("secret-bearing transport error"))).toBe("timeout_or_invalid_response");
  });
});
