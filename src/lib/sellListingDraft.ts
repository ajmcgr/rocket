export type SellListingDraft = {
  appName: string;
  appUrl: string;
  status: "for_sale" | "open_to_offers";
  price: string;
  description: string;
  reason: string;
  buyer: string;
};

export const SELL_LISTING_DRAFT_KEY = "rocket:sell-listing-draft-v1";
export const emptySellListingDraft: SellListingDraft = {
  appName: "", appUrl: "", status: "for_sale", price: "", description: "", reason: "", buyer: "",
};

export function readSellListingDraft(): SellListingDraft {
  if (typeof window === "undefined") return emptySellListingDraft;
  try {
    const saved = JSON.parse(sessionStorage.getItem(SELL_LISTING_DRAFT_KEY) || "null");
    if (!saved || typeof saved !== "object") return emptySellListingDraft;
    const text = (key: keyof SellListingDraft, max: number) => typeof saved[key] === "string" ? saved[key].slice(0, max) : "";
    return {
      appName: text("appName", 120), appUrl: text("appUrl", 500),
      status: saved.status === "open_to_offers" ? "open_to_offers" : "for_sale",
      price: text("price", 12), description: text("description", 1000),
      reason: text("reason", 500), buyer: text("buyer", 500),
    };
  } catch { return emptySellListingDraft; }
}

export function saveSellListingDraft(draft: SellListingDraft): void {
  try { sessionStorage.setItem(SELL_LISTING_DRAFT_KEY, JSON.stringify(draft)); }
  catch { /* The form still works for this visit when browser storage is unavailable. */ }
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
