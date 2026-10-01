import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const allowedOrigins = ["https://tryrocket.ai", "http://localhost:5173", "http://localhost:3000"];
function headers(request: Request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

Deno.serve(async (request) => {
  const responseHeaders = headers(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: responseHeaders });
  const authorization = request.headers.get("Authorization");
  if (!authorization) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: responseHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: responseHeaders });
  const admin = createClient(url, serviceKey);
  const [membership, owners] = await Promise.all([
    admin.from("rocket_developer_memberships")
      .select("status,current_period_end,cancel_at_period_end")
      .eq("user_id", userData.user.id).maybeSingle(),
    admin.from("app_owners")
      .select("app_id,verification_level")
      .eq("user_id", userData.user.id).is("revoked_at", null)
      .in("verification_level", ["claimed", "domain_verified"]),
  ]);
  if (membership.error || owners.error) {
    console.error("Rocket Developer status lookup failed", membership.error || owners.error);
    return new Response(JSON.stringify({ error: "status_unavailable" }), { status: 500, headers: responseHeaders });
  }
  const row = membership.data;
  const active = row?.status === "active" && new Date(row.current_period_end).getTime() > Date.now();
  return new Response(JSON.stringify({
    membership: row ? {
      status: active && row.cancel_at_period_end ? "canceling" : active ? "active" : row.status === "past_due" ? "past_due" : "expired",
      current_period_end: row.current_period_end,
      cancel_at_period_end: row.cancel_at_period_end,
    } : null,
    active,
    owned_apps: owners.data || [],
  }), { headers: responseHeaders });
});
