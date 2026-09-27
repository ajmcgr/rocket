import { getAdmin, getConnectToken, json } from "../_shared/rocketConnect.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const token = await getConnectToken(req);
  if (!token) return json({ error: "invalid_token" }, 401, { "WWW-Authenticate": "Bearer" });
  if (!token.scopes.includes("entitlements:read")) return json({ error: "insufficient_scope" }, 403, { "WWW-Authenticate": "Bearer scope=entitlements:read" });
  const requested = new URL(req.url).searchParams.get("product_key");
  const admin = getAdmin();
  let query = admin.from("connect_entitlements").select("status,valid_from,valid_until,updated_at,connect_products!inner(product_key,name)")
    .eq("user_id", token.user_id).eq("client_id", token.client_id);
  if (requested) query = query.eq("connect_products.product_key", requested);
  const { data, error } = await query;
  if (error) return json({ error: "entitlements_unavailable" }, 500);
  const now = Date.now();
  const entitlements = (data || []).map((row: any) => ({ product_key: row.connect_products.product_key, product_name: row.connect_products.name, status: row.status, valid_until: row.valid_until, active: ["active", "canceling"].includes(row.status) && (!row.valid_until || new Date(row.valid_until).getTime() > now) }));
  return json({ sub: token.user_id, client_id: token.client_id, entitlements });
});
