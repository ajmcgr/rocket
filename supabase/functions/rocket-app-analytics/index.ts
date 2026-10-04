import { CORS_HEADERS, getAdmin, getRocketUser, json } from "../_shared/rocketConnect.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const user = await getRocketUser(req);
  if (!user) return json({ error: "Sign in to see app analytics" }, 401);
  try {
    const body = await req.json();
    const days = body.days ?? 30, page = body.page ?? 1;
    if (typeof body.app_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.app_id) ||
      ![7,30,90].includes(days) || !Number.isInteger(page) || page<1 || page>10000) return json({ error: "Invalid app, range or page" }, 400);
    const { data, error } = await getAdmin().rpc("get_owned_app_rocket_analytics", {
      p_app_id: body.app_id, p_user_id: user.id, p_days: days, p_page: page,
    });
    if (error) return error.code === "42501" ? json({ error: "You must own this app to see its analytics." }, 403)
      : json({ error: "Analytics are temporarily unavailable. Please retry." }, 503);
    return json(data);
  } catch { return json({ error: "Invalid analytics request" }, 400); }
});
