import { createClient } from "npm:@supabase/supabase-js@2.101.1";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(url, key);
const origin = Deno.env.get("GA4_FRONTEND_ORIGIN") || "https://tryrocket.ai";
const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS" };
const allowed = new Set(["valuation_page_viewed","valuation_started","valuation_completed","valuation_signup_started",
  "valuation_signup_completed","valuation_draft_restored","valuation_app_submitted","valuation_ownership_verified",
  "valuation_app_selected","valuation_stripe_connected","valuation_ga4_connected","valuation_saved",
  "valuation_shared","valuation_listing_started","valuation_listing_published"]);
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const reply = (status: number) => new Response(null, { status, headers: { ...cors, "Cache-Control": "no-store" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return reply(204);
  if (request.method !== "POST") return reply(405);
  if (Number(request.headers.get("content-length") || 0) > 1000) return reply(413);
  try {
    const body = await request.json();
    if (!uuid(body?.event_id) || !uuid(body?.session_id) || !allowed.has(body?.event)) return reply(400);
    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64);
    const material = `${new Date().toISOString().slice(0, 10)}|${ip}|${(request.headers.get("user-agent") || "").slice(0, 256)}`;
    const hmacKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(material)));
    const hash = Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const { error } = await service.rpc("record_rocket_valuation_event", {
      p_event_id: body.event_id, p_session_id: body.session_id, p_visitor_hash: hash, p_event_kind: body.event });
    return reply(error ? 503 : 204);
  } catch { return reply(400); }
});
