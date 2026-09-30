import { createClient } from "npm:@supabase/supabase-js@2.101.1";

const allowedOrigins = new Set(["https://tryrocket.ai", "https://www.tryrocket.ai"]);
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

function response(status: number, origin: string | null, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://tryrocket.ai",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  });
}

async function dailyVisitorHash(day: string, ip: string, userAgent: string) {
  // Rotating the input each UTC day prevents linking the stored hashes over time.
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(serviceKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${day}|${ip}|${userAgent}`)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (!origin || !allowedOrigins.has(origin)) return response(403, origin, { error: "Forbidden" });
  if (req.method === "OPTIONS") return response(200, origin, { ok: true });
  if (req.method !== "POST") return response(405, origin, { error: "Method not allowed" });
  if (!req.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
    return response(415, origin, { error: "Invalid content type" });

  let appId: string;
  try {
    const raw = await req.text();
    if (raw.length > 200) return response(413, origin, { error: "Invalid request" });
    appId = JSON.parse(raw)?.app_id;
  } catch {
    return response(400, origin, { error: "Invalid request" });
  }
  if (typeof appId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId))
    return response(400, origin, { error: "Invalid app" });

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return response(202, origin, { ok: true, counted: false });

  try {
    const day = new Date().toISOString().slice(0, 10);
    const hash = await dailyVisitorHash(day, ip, (req.headers.get("user-agent") || "").slice(0, 256));
    const { data, error } = await admin.rpc("record_app_profile_view", {
      p_app_id: appId, p_view_day: day, p_viewer_hash: hash,
    });
    if (error) throw error;
    return response(200, origin, { ok: true, counted: Boolean(data) });
  } catch {
    return response(503, origin, { error: "View tracking unavailable" });
  }
});
