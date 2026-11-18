/** Future server-only integration contract. No implementation exists in V1. */
export type EscrowTransactionRef = { provider: string; externalId: string };
export type EscrowProviderStatus = "not_initiated" | "setup_pending" | "funding_pending" | "funded" | "cancelled";
export interface EscrowProvider {
  createTransaction(dealId: string): Promise<EscrowTransactionRef>;
  linkTransaction(dealId: string, ref: EscrowTransactionRef): Promise<void>;
  getStatus(ref: EscrowTransactionRef): Promise<EscrowProviderStatus>;
  verifyFunding(ref: EscrowTransactionRef): Promise<boolean>;
  authenticateNotification(headers: Headers, body: Uint8Array): Promise<boolean>;
  reconcile(dealId: string, ref: EscrowTransactionRef): Promise<EscrowProviderStatus>;
}
