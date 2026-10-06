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
  let purchasesQuery = admin.from("connect_purchase_grants")
    .select("purchase_id,client_id,product_id,quantity,status,created_at,connect_products!inner(product_key,name,billing_type)")
    .eq("user_id", token.user_id).eq("client_id", token.client_id);
  if (requested) purchasesQuery = purchasesQuery.eq("connect_products.product_key", requested);
  const { data: grants, error: grantsError } = await purchasesQuery;
  if (grantsError) return json({ error: "purchases_unavailable" }, 500);
  const purchases = (grants || []).map((row: any) => ({
    purchase_id: row.purchase_id, client_id: row.client_id, product_id: row.product_id,
    product_key: row.connect_products.product_key, product_name: row.connect_products.name,
    billing_type: "one_time", quantity: row.quantity, status: row.status,
    verified_paid: row.status === "granted", purchased_at: row.created_at,
  }));
  return json({ sub: token.user_id, client_id: token.client_id, entitlements, purchases });
});
