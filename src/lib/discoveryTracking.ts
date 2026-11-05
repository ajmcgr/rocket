import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import type { MouseEvent } from "react";

type Surface = "homepage" | "catalogue" | "search" | "categories" | "collections" | "rankings" | "related" | "direct" | "mcp";
type JourneyKind = "surface_view" | "search" | "search_results" | "app_card_click" | "app_profile_view" | "outbound_click";
type Acquisition = "organic" | "direct" | "social" | "referral" | "mcp";
type Context = { appId: string; surface: Surface; section?: string; searchId?: string; at?: number };
const production = ["https://tryrocket.ai", "https://www.tryrocket.ai"];
const contextKey = "rocket_discovery_context_v1";
const searchKey = "rocket_discovery_search_v1";
const sessionKey = "rocket_discovery_session_v1";
const acquisitionKey = "rocket_discovery_acquisition_v1";

function storage() {
  try { return window.sessionStorage; } catch { return null; }
}

function sessionId() {
  const store = storage();
  const current = store?.getItem(sessionKey);
  if (current && /^[0-9a-f-]{36}$/i.test(current)) return current;
  const id = crypto.randomUUID();
  store?.setItem(sessionKey, id);
  return id;
}

function acquisitionSource(): Acquisition {
  const store = storage();
  const saved = store?.getItem(acquisitionKey);
  if (saved && ["organic", "direct", "social", "referral", "mcp"].includes(saved)) return saved as Acquisition;
  const params = new URLSearchParams(window.location.search);
  const source = params.get("utm_source")?.toLowerCase() || "";
  const medium = params.get("utm_medium")?.toLowerCase() || "";
  const referrer = (() => { try { return new URL(document.referrer).hostname.toLowerCase(); } catch { return ""; } })();
  const value: Acquisition = source === "rocket_mcp" ? "mcp"
    : medium === "organic" || /(^|\.)(google|bing|duckduckgo|yahoo|ecosia)\./.test(referrer) ? "organic"
    : medium === "social" || /(^|\.)(x|twitter|facebook|instagram|linkedin|reddit|tiktok)\.com$/.test(referrer) ? "social"
    : source || (referrer && !["tryrocket.ai", "www.tryrocket.ai"].includes(referrer)) ? "referral" : "direct";
  store?.setItem(acquisitionKey, value);
  return value;
}

function sendJourney(eventKind: JourneyKind, surface: Surface, options: {
  appId?: string; section?: string; searchId?: string; resultCount?: number;
} = {}) {
  if (typeof window === "undefined" || !production.includes(window.location.origin) ||
    navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  const width = window.innerWidth;
  void supabase.functions.invoke("rocket-app-view", { body: {
    kind: "journey", event_id: crypto.randomUUID(), session_id: sessionId(),
    event_kind: eventKind, surface, section: options.section,
    app_id: options.appId, search_id: options.searchId, result_count: options.resultCount,
    acquisition_source: acquisitionSource(),
    device: width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop",
  } }).catch(() => undefined);
}

function currentSurface(): { surface: Surface; section?: string } {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path === "/") return { surface: "homepage" };
  if (path.startsWith("/collections")) return { surface: "collections" };
  if (path.startsWith("/categories") || params.has("category") || params.get("view") === "categories") return { surface: "categories" };
  if (path.startsWith("/rankings") || params.get("view") === "rankings") return { surface: "rankings" };
  if (path.startsWith("/apps/")) return { surface: "related" };
  if (params.has("q")) return { surface: "search" };
  if (path === "/discover") return { surface: "catalogue" };
  return { surface: "direct" };
}

/** Call only from an app card's capture handler; other card actions are ignored. */
export function recordAppCardClick(event: MouseEvent<HTMLElement>, appId: string) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a[href]");
  if (!anchor) return;
  const destination = new URL(anchor.getAttribute("href") || "", window.location.origin);
  if (destination.origin !== window.location.origin || !destination.pathname.startsWith("/apps/")) return;
  const source = currentSurface();
  const sectionId = anchor.closest("section[aria-labelledby]")?.getAttribute("aria-labelledby") || "";
  const section = /^[a-z0-9_-]{1,48}$/.test(sectionId) ? sectionId : undefined;
  const searchId = source.surface === "search" ? storage()?.getItem(searchKey) || undefined : undefined;
  const context: Context = { appId, ...source, section, searchId, at: Date.now() };
  storage()?.setItem(contextKey, JSON.stringify(context));
  sendJourney("app_card_click", context.surface, { appId, section, searchId });
}

function profileContext(appId: string): Context {
  const source = new URLSearchParams(window.location.search).get("utm_source") === "rocket_mcp" ? "mcp" : "direct";
  try {
    const stored = JSON.parse(storage()?.getItem(contextKey) || "null") as Context | null;
    if (stored?.appId === appId && stored.at && Date.now() - stored.at < 5 * 60_000 && source !== "mcp") return stored;
  } catch { /* Ignore stale tab context. */ }
  return { appId, surface: source };
}

export function recordDiscoveryProfileView(appId: string) {
  if (new URLSearchParams(window.location.search).has("sponsor")) return;
  const context = profileContext(appId);
  sendJourney("app_profile_view", context.surface, context);
}

export function recordDiscoveryOutbound(appId: string) {
  if (new URLSearchParams(window.location.search).has("sponsor")) return;
  const context = profileContext(appId);
  sendJourney("outbound_click", context.surface, context);
}

export function recordDiscoverySurfaceView(surface: Surface, section?: string) {
  sendJourney("surface_view", surface, { section });
}

export function recordSearchResults(resultCount: number) {
  const store = storage();
  const searchId = store?.getItem(searchKey);
  if (!searchId || store?.getItem(`${searchKey}_results`) === searchId) return;
  store?.setItem(`${searchKey}_results`, searchId);
  sendJourney("search_results", "search", { searchId, resultCount });
}

/** Count explicit non-empty searches, never keystrokes, page loads or filters. */
export async function recordDiscoverySearch(query: string, source: "header" | "homepage" | "discover") {
  const hasQuery = /[\p{L}\p{N}]/u.test(query);
  track("discovery_search", { source, has_query: hasQuery });
  if (!hasQuery || typeof window === "undefined" || !production.includes(window.location.origin)) return;
  const eventId = crypto.randomUUID();
  storage()?.setItem(searchKey, eventId);
  sendJourney("search", "search", { searchId: eventId, section: source });
  try {
    // No query text, account ID or persistent visitor ID leaves the browser.
    await supabase.functions.invoke("rocket-app-view", {
      body: { kind: "search", event_id: eventId, source },
    });
  } catch {
    // Telemetry must never block search/navigation.
  }
}
