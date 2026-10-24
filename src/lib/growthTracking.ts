import { supabase } from "@/integrations/supabase/client";

const key = "rocket:growth-referral";
const ttl = 7 * 86400000;
export function growthTrackingAllowed() {
  return typeof window !== "undefined" && ["https://tryrocket.ai", "https://www.tryrocket.ai"].includes(window.location.origin)
    && navigator.doNotTrack !== "1" && !(navigator as Navigator & {globalPrivacyControl?: boolean}).globalPrivacyControl;
}
type Target = {kind: "app" | "profile"; identifier: string};
export function referralTarget(path: string, search: string): Target | null {
  if (new URLSearchParams(search).get("utm_source") !== "rocket_share") return null;
  const app = path.match(/^\/apps\/([a-z0-9-]{1,120})\/?$/);
  if (app) return {kind: "app", identifier: app[1]};
  const profile = path.match(/^\/@([a-z0-9_]{2,30})\/?$/);
  return profile ? {kind: "profile", identifier: profile[1]} : null;
}
async function record(body: Record<string, unknown>) {
  const {data, error} = await supabase.functions.invoke("rocket-app-view", {body});
  return !error && data?.ok === true;
}
export async function recordGrowthShare(kind: string, identifier: string, method: string) {
  if (!growthTrackingAllowed() || !["app", "profile", "rocket100"].includes(kind)) return;
  try { await record({kind: "share_action", event_id: crypto.randomUUID(), target_kind: kind === "app" ? "app" : "profile", identifier, method}); } catch { /* optional telemetry */ }
}
export async function syncGrowthAttribution(path: string, search: string, confirmedUser = false, accountReferral?: unknown) {
  try {
    if (!growthTrackingAllowed()) { sessionStorage.removeItem(key); return; }
    let saved = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!saved || typeof saved.id !== "string" || !Number.isFinite(saved.at) || Date.now()-saved.at > ttl || saved.at > Date.now()) saved = null;
    if (!saved && confirmedUser && typeof accountReferral === "string" && /^[0-9a-f-]{36}$/i.test(accountReferral)) saved={id:accountReferral,at:Date.now(),remote:true};
    const target = referralTarget(path,search);
    // First touch within this tab only; refreshes reuse the same idempotency key.
    if (target && !saved) {
      saved = {id: crypto.randomUUID(), at: Date.now(), ...target};
      sessionStorage.setItem(key,JSON.stringify(saved));
    }
    if (!saved) return;
    if (target && !saved.remote && !await record({kind:"referral_visit",event_id:saved.id,target_kind:saved.kind,identifier:saved.identifier})) return;
    if (confirmedUser && !saved.bound && await record({kind:"referral_signup",event_id:crypto.randomUUID(),referral_id:saved.id})) {
      sessionStorage.setItem(key,JSON.stringify({...saved,bound:true}));
    }
  } catch { /* Storage, network or telemetry failures never affect auth/navigation. */ }
}

// Attribution metadata is an untrusted receipt, never an authorization claim.
// The server independently checks the visit, account creation time and email.
export function pendingGrowthReferral(): string | undefined {
  try {
    if (!growthTrackingAllowed()) return;
    const saved=JSON.parse(sessionStorage.getItem(key) || "null");
    if (saved && !saved.bound && typeof saved.id==='string' && /^[0-9a-f-]{36}$/i.test(saved.id)
      && Number.isFinite(saved.at) && saved.at<=Date.now() && Date.now()-saved.at<=ttl) return saved.id;
  } catch { /* optional */ }
  return undefined;
}
