// Presentation of existing, authenticated ledger records; not an ownership store.
type Entry = {
  id?: string;
  purchase_id?: string;
  transaction_id?: string | null;
  client_id: string;
  product_id: string;
  status: string;
  one_time?: boolean;
  valid_until?: string | null;
};
type Client = {
  client_id: string;
  app_id: string;
  environment: string;
  is_active?: boolean;
};
type Product = {
  id: string;
  client_id: string;
  name: string;
  amount_cents: number;
  currency: string;
  interval?: string | null;
};
type App = { id: string; name: string; website_url: string };
type Order = {
  id: string;
  client_id: string;
  product_id: string;
  amount_cents: number;
  currency: string;
  created_at: string;
  status: string;
};
type Detail = { app_id: string; support_url: string | null };
export function libraryPurchases(
  entries: Entry[],
  clients: Client[],
  products: Product[],
  apps: App[],
  orders: Order[],
  details: Detail[],
  now = Date.now(),
) {
  const clientMap = new Map(
    clients
      .filter((c) => c.environment === "production")
      .map((c) => [c.client_id, c]),
  );
  const productMap = new Map(products.map((p) => [p.id, p]));
  const appMap = new Map(apps.map((a) => [a.id, a]));
  const detailsMap = new Map(details.map((d) => [d.app_id, d]));
  return entries.flatMap((entry) => {
    const client = clientMap.get(entry.client_id),
      product = productMap.get(entry.product_id);
    if (!client || !product || product.client_id !== client.client_id)
      return [];
    const app = appMap.get(client.app_id);
    const order = orders.find(
      (o) =>
        o.client_id === entry.client_id &&
        o.product_id === entry.product_id &&
        (entry.purchase_id
          ? o.id === entry.purchase_id
          : !!entry.transaction_id && o.id === entry.transaction_id),
    );
    const active =
      client.is_active !== false &&
      (entry.one_time
        ? entry.status === "granted"
        : ["active", "canceling"].includes(entry.status) &&
          (!entry.valid_until || new Date(entry.valid_until).getTime() > now));
    return [
      {
        purchase_id: entry.purchase_id || entry.id,
        app_id: client.app_id,
        // Do not leak hidden listing metadata or a disabled outbound URL.
        app_name: app?.name || "Unavailable listing",
        listing_available: !!app,
        website_url: app?.website_url || null,
        plan: {
          name: product.name,
          amount_cents: order?.amount_cents ?? product.amount_cents,
          currency: order?.currency || product.currency,
          interval: product.interval,
          billing_type: entry.one_time ? "one_time" : "subscription",
        },
        status: entry.status,
        valid_until: entry.valid_until,
        active,
        order: order
          ? {
              id: order.id,
              date: order.created_at,
              status: order.status,
              amount_cents: order.amount_cents,
              currency: order.currency,
            }
          : null,
        support_url: app
          ? detailsMap.get(client.app_id)?.support_url || null
          : null,
        receipt_url: null, // No stored receipt exists. Never fabricate a Stripe URL.
      },
    ];
  });
}
