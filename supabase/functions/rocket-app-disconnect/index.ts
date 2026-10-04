import { CORS_HEADERS, getAdmin, getRocketUser, json } from "../_shared/rocketConnect.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const user = await getRocketUser(req);
  if (!user) return json({ error: "Sign in to continue" }, 401);
  try {
    const body = await req.json();
    if (typeof body.app_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.app_id) ||
      !["status", "app", "posthog", "stripe_payments"].includes(body.action)) return json({ error: "Invalid request" }, 400);
    const { data, error } = await getAdmin().rpc("manage_app_disconnection", {
      p_app_id: body.app_id, p_user_id: user.id, p_action: body.action,
    });
    if (error) return json({ error: error.message }, 409);
    return json(data);
  } catch { return json({ error: "Could not process this request. Please retry." }, 400); }
});
