import { BUSINESS_MODELS, type ValuationInputs } from "@/lib/rocketValuation";

export type SellListingDraft = {
  appName: string;
  appUrl: string;
  contactEmail: string;
  status: "for_sale" | "open_to_offers";
  price: string;
  description: string;
  reason: string;
  buyer: string;
  valuationInputs: ValuationInputs | null;
};

export const SELL_LISTING_DRAFT_KEY = "rocket:sell-listing-draft-v1";
const PENDING_SIGNUP_DRAFT_KEY = "rocket:sell-pending-signup-draft-v1";
const GUEST_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const scopedKey = (userId: string) => `rocket:sell-account-draft-v1:${userId}`;

export const emptySellListingDraft: SellListingDraft = {
  appName: "", appUrl: "", contactEmail: "", status: "for_sale", price: "",
  description: "", reason: "", buyer: "", valuationInputs: null,
};

export function normalizeSellListingDraft(saved: unknown): SellListingDraft {
  if (!saved || typeof saved !== "object") return emptySellListingDraft;
  const value = saved as Record<string, unknown>;
  const text = (key: keyof SellListingDraft, max: number) =>
    typeof value[key] === "string" ? (value[key] as string).slice(0, max) : "";
  const raw = value.valuationInputs && typeof value.valuationInputs === "object"
    ? value.valuationInputs as Record<string, unknown> : null;
  const numeric = (key: string, fallback = 0) => typeof raw?.[key] === "number" && Number.isFinite(raw[key])
    ? raw[key] as number : fallback;
  const valuationInputs: ValuationInputs | null = raw ? {
    currency: raw.currency === "EUR" || raw.currency === "GBP" ? raw.currency : "USD",
    businessModel: BUSINESS_MODELS.find((model) => model === raw.businessModel) || "saas",
    mrr: numeric("mrr"), monthlyTraffic: numeric("monthlyTraffic"),
    monthlyRevenueGrowthPct: numeric("monthlyRevenueGrowthPct"), ageMonths: numeric("ageMonths"),
    appName: typeof raw.appName === "string" ? raw.appName.slice(0, 120) : text("appName", 120),
    appUrl: typeof raw.appUrl === "string" ? raw.appUrl.slice(0, 500) : text("appUrl", 500),
  } : null;
  if (valuationInputs && raw) {
    for (const key of ["monthlyProfit", "grossMarginPct", "monthlyChurnPct", "revenueConcentrationPct",
      "organicTrafficPct", "annualRecurringRevenue", "payingCustomers", "monthlyOperatingExpenses", "trafficGrowthPct"] as const) {
      if (typeof raw[key] === "number" && Number.isFinite(raw[key]))
        (valuationInputs as unknown as Record<string, unknown>)[key] = raw[key];
    }
    for (const key of ["platformDependence", "operationalComplexity"] as const) {
      if (["low", "medium", "high"].includes(String(raw[key])))
        (valuationInputs as unknown as Record<string, unknown>)[key] = raw[key];
    }
  }
  return {
    appName: text("appName", 120), appUrl: text("appUrl", 500),
    contactEmail: text("contactEmail", 254),
    status: value.status === "open_to_offers" ? "open_to_offers" : "for_sale",
    price: text("price", 12), description: text("description", 1000),
    reason: text("reason", 500), buyer: text("buyer", 500), valuationInputs,
  };
}

function readEnvelope(raw: string | null): { draft: SellListingDraft; savedAt: number } | null {
  try {
    const saved = JSON.parse(raw || "null");
    if (!saved || typeof saved.savedAt !== "number" || saved.savedAt > Date.now()
      || Date.now() - saved.savedAt > GUEST_DRAFT_TTL_MS) return null;
    return { draft: normalizeSellListingDraft(saved.draft), savedAt: saved.savedAt };
  } catch { return null; }
}

export function readSellListingDraft(): SellListingDraft {
  if (typeof window === "undefined") return emptySellListingDraft;
  try { return readEnvelope(sessionStorage.getItem(SELL_LISTING_DRAFT_KEY))?.draft || emptySellListingDraft; }
  catch { return emptySellListingDraft; }
}

export function readSellListingDraftForEmail(email: string | undefined): { draft: SellListingDraft; savedAt: number } | null {
  if (!email) return null;
  try {
    const saved = readEnvelope(sessionStorage.getItem(SELL_LISTING_DRAFT_KEY));
    return saved && draftBelongsToUser(saved.draft, email) ? saved : null;
  } catch { return null; }
}

export function saveSellListingDraft(draft: SellListingDraft): void {
  try { sessionStorage.setItem(SELL_LISTING_DRAFT_KEY, JSON.stringify({ draft, savedAt: Date.now() })); }
  catch { /* The form remains available when browser storage is blocked. */ }
}

export function clearSellListingDraft(): void {
  try { sessionStorage.removeItem(SELL_LISTING_DRAFT_KEY); } catch { /* Storage may be unavailable. */ }
}

export function savePendingSignupDraft(draft: SellListingDraft, signupStarted = true): void {
  if (!validContactEmail(draft.contactEmail)) return;
  // Cross-tab signup handoff carries listing fields, never private revenue inputs.
  try { localStorage.setItem(PENDING_SIGNUP_DRAFT_KEY, JSON.stringify({ draft: { ...draft, valuationInputs: null }, savedAt: Date.now(), signupStarted })); }
  catch { /* Same-tab storage remains available. */ }
}

export function readPendingSignupDraftForEmail(email: string | undefined): { draft: SellListingDraft; savedAt: number; signupStarted: boolean } | null {
  if (!email) return null;
  try {
    const raw = localStorage.getItem(PENDING_SIGNUP_DRAFT_KEY);
    const saved = readEnvelope(raw);
    return saved && draftBelongsToUser(saved.draft, email)
      ? { ...saved, signupStarted: JSON.parse(raw || "null")?.signupStarted === true } : null;
  } catch { return null; }
}

export function clearPendingSignupDraft(): void {
  try { localStorage.removeItem(PENDING_SIGNUP_DRAFT_KEY); } catch { /* Storage may be unavailable. */ }
}

export function readAccountSellListingDraft(userId: string): { draft: SellListingDraft; savedAt: number } | null {
  try { return readEnvelope(sessionStorage.getItem(scopedKey(userId))); } catch { return null; }
}

export function saveAccountSellListingDraft(userId: string, draft: SellListingDraft): void {
  try { sessionStorage.setItem(scopedKey(userId), JSON.stringify({ draft, savedAt: Date.now() })); }
  catch { /* The server-side draft remains the durable copy. */ }
}

export function clearAccountSellListingDraft(userId: string): void {
  try { sessionStorage.removeItem(scopedKey(userId)); } catch { /* Storage may be unavailable. */ }
}

export function clearLocalSellListingDrafts(): void {
  try {
    Object.keys(sessionStorage).filter((key) => key.startsWith("rocket:sell-account-draft-v1:"))
      .forEach((key) => sessionStorage.removeItem(key));
    sessionStorage.removeItem(SELL_LISTING_DRAFT_KEY);
  } catch { /* Storage may be unavailable. */ }
  clearPendingSignupDraft();
}

export function draftBelongsToUser(draft: SellListingDraft, email: string | undefined): boolean {
  return Boolean(draft.contactEmail.trim() && email
    && draft.contactEmail.trim().toLowerCase() === email.trim().toLowerCase());
}

export function validContactEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 254;
}

export function validSellListingIdentity(draft: SellListingDraft): boolean {
  if (!draft.appName.trim() || !draft.appUrl.trim()) return false;
  try {
    const url = new URL(draft.appUrl);
    return url.protocol === "https:" && Boolean(url.hostname.includes(".")) && !url.username && !url.password;
  } catch { return false; }
}

export function sameAppWebsite(first: string, second: string): boolean {
  try {
    const a = new URL(first);
    const b = new URL(second);
    const host = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, "");
    const path = (url: URL) => url.pathname.replace(/\/$/, "");
    return host(a) === host(b) && path(a) === path(b);
  } catch { return false; }
}
