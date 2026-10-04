import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const origins = ["https://tryrocket.ai", "http://localhost:5173", "http://localhost:3000", "http://localhost:4174"];
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : origins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json", Vary: "Origin",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return new Response(JSON.stringify({ error: "Workspace name must be 1–100 characters" }), { status: 400, headers });
    // Same atomic entitlement-checked database path as the app. No service-role fallback.
    const { data, error } = await client.rpc(body.is_personal === true ? "ensure_personal_workspace" : "create_workspace", { _name: name });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: error.code === "42501" ? 403 : 400, headers });
    return new Response(JSON.stringify(data), { headers });
  } catch {
    return new Response(JSON.stringify({ error: "Workspace creation unavailable. Please retry." }), { status: 500, headers });
  }
});
