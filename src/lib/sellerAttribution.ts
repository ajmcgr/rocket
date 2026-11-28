// Seller attribution is deliberately limited to campaign labels. Never persist
// a referrer URL, query string, email address, or financial inputs in telemetry.
export type SellerSource = "direct" | "organic_search" | "x" | "linkedin" |
  "developer_outreach" | "backlink_campaign" | "distribution_partner" |
  "reddit" | "other_referral";
export type SellerCampaign = "none" | "seller_claim_a" | "seller_valuation_b" | "valuation_card";
export type SellerAttribution = { source: SellerSource; campaign: SellerCampaign };
export type SellerAnalyticsHandoff = SellerAttribution & { sessionId: string };

const KEY = "rocket:seller-attribution-v1";
const SESSION_KEY = "rocket_valuation_session";
const sources = new Set<SellerSource>(["direct", "organic_search", "x", "linkedin",
  "developer_outreach", "backlink_campaign", "distribution_partner", "reddit", "other_referral"]);
const campaigns = new Set<SellerCampaign>(["none", "seller_claim_a", "seller_valuation_b", "valuation_card"]);
const uuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function classifySellerVisit(url: URL, referrer = ""): SellerAttribution {
  const params = url.searchParams;
  const source = (params.get("utm_source") || "").toLowerCase();
  const campaign = (params.get("utm_campaign") || "").toLowerCase();
  const medium = (params.get("utm_medium") || "").toLowerCase();
  let host = "";
  try { host = new URL(referrer).hostname.toLowerCase(); } catch { /* No referrer. */ }
  const sellerCampaign: SellerCampaign = campaign === "rocket_seller_claim_a" ? "seller_claim_a"
    : campaign === "rocket_seller_valuation_b" ? "seller_valuation_b"
      : campaign === "rocket_valuation_card" ? "valuation_card" : "none";
  let sellerSource: SellerSource = "direct";
  if (source === "rocket_developer_outreach" || sellerCampaign === "seller_claim_a" || sellerCampaign === "seller_valuation_b") sellerSource = "developer_outreach";
  else if (source === "x" || source === "twitter" || /(^|\.)(x|twitter)\.com$/.test(host)) sellerSource = "x";
  else if (source === "linkedin" || /(^|\.)linkedin\.com$/.test(host)) sellerSource = "linkedin";
  else if (source === "reddit" || /(^|\.)reddit\.com$/.test(host)) sellerSource = "reddit";
  else if (source === "organic" || medium === "organic" || /(^|\.)(google|bing|duckduckgo|yahoo|ecosia)\./.test(host)) sellerSource = "organic_search";
  else if (source === "rocket_backlink" || campaign.startsWith("rocket_backlink_")) sellerSource = "backlink_campaign";
  else if (source === "rocket_partner" || campaign.startsWith("rocket_partner_")) sellerSource = "distribution_partner";
  else if (source || host && host !== "tryrocket.ai" && host !== "www.tryrocket.ai") sellerSource = "other_referral";
  return { source: sellerSource, campaign: sellerCampaign };
}

export function sellerTrackingAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl !== true && nav.doNotTrack !== "1";
}

export function sellerSessionId(): string | null {
  if (!sellerTrackingAllowed()) return null;
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!uuid(id)) { id = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, id); }
    return id;
  } catch { return null; }
}

export function sellerAttribution(): SellerAttribution | null {
  if (!sellerTrackingAllowed()) return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (sources.has(saved?.source) && campaigns.has(saved?.campaign)) return saved;
    const classified = classifySellerVisit(new URL(window.location.href), document.referrer);
    sessionStorage.setItem(KEY, JSON.stringify(classified));
    return classified;
  } catch { return null; }
}

export function sellerAnalyticsHandoff(): SellerAnalyticsHandoff | null {
  const attribution = sellerAttribution();
  const sessionId = sellerSessionId();
  return attribution && sessionId ? { ...attribution, sessionId } : null;
}

export function adoptSellerAnalyticsHandoff(value: unknown): void {
  if (!sellerTrackingAllowed() || !value || typeof value !== "object") return;
  const saved = value as Partial<SellerAnalyticsHandoff>;
  if (!sources.has(saved.source as SellerSource) || !campaigns.has(saved.campaign as SellerCampaign) || !uuid(saved.sessionId)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ source: saved.source, campaign: saved.campaign }));
    sessionStorage.setItem(SESSION_KEY, saved.sessionId);
    sessionStorage.setItem("rocket:sell-journey", "1");
  } catch { /* Analytics may be unavailable. */ }
}

export function sellerShareUrl(platform: "x" | "reddit" | "linkedin" | "native"): string {
  const url = new URL("https://tryrocket.ai/sell");
  url.searchParams.set("utm_source", platform);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "rocket_valuation_card");
  return url.toString();
}
