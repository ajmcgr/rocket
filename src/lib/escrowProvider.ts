/** Future server-only integration contract. No implementation exists in V1. */
export type EscrowTransactionRef = { provider: string; externalId: string };
export type EscrowProviderStatus = "not_initiated" | "setup_pending" | "funding_pending" | "funded" | "cancelled";
export interface EscrowProvider {
  createTransaction(dealId: string): Promise<EscrowTransactionRef>;
  linkTransaction(dealId: string, ref: EscrowTransactionRef): Promise<void>;
  getStatus(ref: EscrowTransactionRef): Promise<EscrowProviderStatus>;
  verifyFunding(ref: EscrowTransactionRef): Promise<boolean>;
  verifyCompletion(ref: EscrowTransactionRef): Promise<boolean>;
  getProviderFees(ref: EscrowTransactionRef): Promise<{ escrowFeeMinor: bigint | null; processingFeeMinor: bigint | null }>;
  getRefundStatus(ref: EscrowTransactionRef): Promise<"none" | "pending" | "refunded">;
  getRocketFeeCollectionStatus(ref: EscrowTransactionRef): Promise<"unavailable" | "pending" | "collected" | "refunded">;
  authenticateNotification(headers: Headers, body: Uint8Array): Promise<boolean>;
  reconcile(dealId: string, ref: EscrowTransactionRef): Promise<EscrowProviderStatus>;
}
