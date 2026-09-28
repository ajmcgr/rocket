import { getAdmin, getConnectToken, json } from "../_shared/rocketConnect.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const token = await getConnectToken(req);
  if (!token) return json({ error: "invalid_token" }, 401, { "WWW-Authenticate": "Bearer" });
  const admin = getAdmin();
  const { data: userData } = await admin.auth.admin.getUserById(token.user_id);
  if (!userData.user) return json({ error: "invalid_token" }, 401);
  const { data: profile } = await admin.from("profiles").select("full_name,avatar_url").eq("user_id", token.user_id).maybeSingle();
  const response: Record<string, unknown> = { sub: token.user_id };
  if (token.scopes.includes("profile")) Object.assign(response, { name: profile?.full_name || userData.user.user_metadata?.full_name || userData.user.user_metadata?.name || null, picture: profile?.avatar_url || userData.user.user_metadata?.avatar_url || null });
  if (token.scopes.includes("email")) Object.assign(response, { email: userData.user.email || null, email_verified: Boolean(userData.user.email_confirmed_at) });
  return json(response, 200, { "Cache-Control": "no-store" });
});
