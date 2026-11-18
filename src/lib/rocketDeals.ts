import { supabase } from "@/integrations/supabase/client";

export const dealsDb = supabase as any;
export type DealStatus = "offer_pending" | "negotiating" | "offer_accepted" | "preparing_terms" | "awaiting_approvals" | "terms_agreed" | "awaiting_escrow" | "cancelled" | "expired";
export type Deal = { id: string; app_id: string; buyer_id: string; seller_id: string; conversation_id: string; status: DealStatus; updated_at: string; offer_expires_at?: string };
export type Offer = { id: string; deal_id: string; actor_id: string; amount_cents: number; currency: string; message: string; conditions: string; handover_timeframe: string; created_at: string };
export type Version<T> = { id: string; version: number; editor_id: string; created_at: string } & T;
export type Approval = { deal_id: string; kind: "agreement" | "checklist"; version: number; user_id: string; approved_at: string };
export const money = (cents: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
export const centsFromInput = (value: string): number | null => {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 100 && cents <= 100000000000 ? cents : null;
};
export const statusLabel = (status: DealStatus) => ({
  offer_pending: "Offer pending", negotiating: "Negotiating", offer_accepted: "Offer accepted",
  preparing_terms: "Preparing terms", awaiting_approvals: "Awaiting approvals", terms_agreed: "Terms agreed",
  awaiting_escrow: "Awaiting escrow setup", cancelled: "Cancelled", expired: "Expired",
})[status];
export const nextAction = (deal: Deal, userId: string, offers: Offer[], agreements: Version<{terms: Record<string,string>}>[], checklists: Version<{items: ChecklistItem[]}>[], approvals: Approval[]) => {
  const last = offers.at(-1);
  if (deal.status === "offer_pending" || deal.status === "negotiating") return last?.actor_id === userId ? "Await response" : "Review offer";
  if (deal.status === "offer_accepted" || deal.status === "preparing_terms") return "Prepare transaction terms";
  if (deal.status === "awaiting_approvals" || deal.status === "terms_agreed") {
    const agreement = agreements.at(-1), checklist = checklists.at(-1);
    if (!agreement || !checklist) return "Complete terms and checklist";
    if (!approvals.some((a) => a.kind === "agreement" && a.version === agreement.version && a.user_id === userId)) return "Approve transaction terms";
    if (!approvals.some((a) => a.kind === "checklist" && a.version === checklist.version && a.user_id === userId)) return "Review handover checklist";
    return deal.status === "terms_agreed" ? "Proceed to escrow preparation" : "Await other party approval";
  }
  return deal.status === "awaiting_escrow" ? "Awaiting escrow integration" : "No action required";
};
export type ChecklistItem = { name: string; description: string; responsible_party: "buyer" | "seller"; required: boolean; delivery_method: "ownership_transfer" | "project_migration" | "account_recreation" | "provider_approval" | "other" | "document" | "not_applicable"; acceptance_criteria: string; notes: string };
export const checklistTemplate: ChecklistItem[] = [
  "GitHub repository", "Other code repositories", "Build instructions", "Technical documentation",
  "Hosting", "Database", "Storage", "Server infrastructure", "Environment configuration",
  "Domain name", "Logo and brand assets", "Website content", "IP assignment documentation",
  "Payment processing", "Email infrastructure", "Analytics", "Authentication", "API integrations", "External subscriptions",
  "Customer records (legal and privacy review required)", "Revenue documentation", "Analytics reports", "Customer support documentation", "Business agreements",
].map((name) => ({ name, description: "", responsible_party: "seller", required: true,
  delivery_method: name.includes("repository") || name === "Domain name" ? "ownership_transfer" : "other",
  acceptance_criteria: "", notes: "" }));
export const agreementFields = [
  ["assets_included", "Assets included"], ["assets_excluded", "Assets excluded"],
  ["seller_responsibilities", "Seller responsibilities"], ["buyer_responsibilities", "Buyer responsibilities"],
  ["handover_deadline", "Proposed handover deadline"], ["inspection_period", "Proposed inspection period"],
  ["conditions", "Conditions or contingencies"], ["escrow_fee_responsibility", "Escrow fee responsibility"],
  ["cancellation_conditions", "Proposed cancellation conditions"],
] as const;
