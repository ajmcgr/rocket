export type VerificationPhase = "unconnected" | "pending" | "failed" | "stale" | "inactive" | "ineligible" | "private" | "verified_only" | "public";

export function verificationPhase(input: {
  connected: boolean;
  status?: string | null;
  lastError?: string | null;
  successfulSync?: string | null;
  eligibleLive?: boolean;
  selected: boolean;
  visibility: string | string[];
}): VerificationPhase {
  if (!input.connected || input.status === "disconnected") return "unconnected";
  if (input.lastError || input.status === "error") return "failed";
  if (!input.successfulSync) return "pending";
  const verifiedAt = Date.parse(input.successfulSync);
  if (!Number.isFinite(verifiedAt) || Date.now() - verifiedAt >= 72 * 60 * 60 * 1000) return "stale";
  if (input.eligibleLive === false) return "ineligible";
  if (!input.selected) return "inactive";
  const modes = Array.isArray(input.visibility) ? input.visibility : [input.visibility];
  if (modes.some((mode) => mode === "range" || mode === "exact")) return "public";
  if (modes.includes("verified_only")) return "verified_only";
  return "private";
}
