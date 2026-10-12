type Values = Record<string, unknown>;
const row = (value: unknown): Values => value && typeof value === "object" && !Array.isArray(value) ? value as Values : {};
const integer = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const money = (cents: unknown, currency = "usd") => new Intl.NumberFormat("en-US", {
  style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2,
}).format(integer(cents) / 100);
const growth = (current: unknown, previous: unknown) => {
  const prior = integer(previous);
  return prior > 0 ? `${((integer(current) - prior) / prior * 100).toFixed(1)}%` : "N/A";
};
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value))
  ? new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "Unavailable";

function Card({ title, value, quality, children, limitation }: {
  title: string; value: string; quality: string; children: React.ReactNode; limitation?: string;
}) {
  return <article className="rocket-investor-card">
    <div className="rocket-investor-card-heading"><h3>{title}</h3><span className={`rocket-investor-quality quality-${quality.toLowerCase()}`}>{quality}</span></div>
    <strong className="rocket-investor-value">{value}</strong>
    <div className="rocket-investor-details">{children}</div>
    {limitation && <p className="rocket-admin-muted">{limitation}</p>}
  </article>;
}

export default function AdminInvestorMetrics({ data }: { data: Values | null }) {
  if (!data) return <section className="rocket-admin-panel"><h2>Investor metrics</h2><p className="rocket-admin-muted">Investor snapshot unavailable.</p></section>;
  const connected = row(data.connected_apps);
  const cross = row(data.cross_app_users);
  const gmv = row(data.marketplace_gmv);
  const revenue = row(data.net_retained_revenue);
  const sources = row(revenue.source_breakdown);
  const currencies = Array.isArray(gmv.currencies) ? gmv.currencies.map(row) : [];
  const usd = currencies.find((item) => item.currency === "usd") || {};
  const quality = (item: Values) => String(item.quality || "UNVERIFIED");
  return <section className="rocket-admin-panel" aria-labelledby="investor-metrics-title">
    <h2 id="investor-metrics-title">Investor metrics</h2>
    <p className="rocket-admin-muted">Rolling 30-day UTC windows [{date(data.window_start)}, {date(data.as_of)}). Previous window begins {date(data.previous_window_start)}. Calculated {date(data.calculated_at)}{data.stale ? " · Snapshot stale" : ""}.</p>
    <div className="rocket-investor-grid">
      <Card title="Connected Apps" value={String(integer(connected.total))} quality={quality(connected)} limitation={String(connected.limitations || "")}>
        <span>Active last 30 days <b>{integer(connected.active_30d)}</b></span>
        <span>New last 30 days <b>{integer(connected.new_30d)}</b></span>
        <span>Previous active 30 days <b>{integer(connected.previous_active_30d)}</b></span>
        <span>Active growth <b>{growth(connected.active_30d, connected.previous_active_30d)}</b></span>
      </Card>
      <Card title="Cross-App Users" value={String(integer(cross.total))} quality={quality(cross)} limitation={String(cross.limitations || "")}>
        <span>Active last 30 days <b>{integer(cross.active_30d)}</b></span>
        <span>New last 30 days <b>{integer(cross.new_30d)}</b></span>
        <span>Previous active 30 days <b>{integer(cross.previous_active_30d)}</b></span>
        <span>Active growth <b>{growth(cross.active_30d, cross.previous_active_30d)}</b></span>
      </Card>
      <Card title="Marketplace GMV" value={money(usd.gross_cents)} quality={quality(gmv)} limitation={String(gmv.limitations || "")}>
        <span>Gross last 30 days <b>{money(usd.gross_cents)}</b></span>
        <span>Net after refunds <b>{money(usd.net_cents)}</b></span>
        <span>Previous 30 days gross / net <b>{money(usd.previous_gross_cents)} / {money(usd.previous_net_cents)}</b></span>
        <span>Gross growth <b>{growth(usd.gross_cents, usd.previous_gross_cents)}</b></span>
        <span>Completed payments <b>{integer(usd.completed_payments)}</b></span>
        <span>Revenue-generating apps <b>{integer(usd.revenue_apps)}</b></span>
        <span>Rocket marketplace / external / unknown <b>{integer(usd.rocket_origin_payments)} / {integer(usd.external_origin_payments)} / {integer(usd.unknown_origin_payments)}</b></span>
        <span>Independent / related-party gross <b>{money(usd.independent_customer_gross_cents)} / {money(usd.related_party_gross_cents)}</b></span>
        {currencies.filter((item) => item.currency !== "usd").map((item) => <span key={String(item.currency)}>{String(item.currency).toUpperCase()} gross / net <b>{money(item.gross_cents, String(item.currency))} / {money(item.net_cents, String(item.currency))}</b></span>)}
      </Card>
      <Card title="Net Retained Revenue" value={typeof revenue.amount_cents === "number" ? money(revenue.amount_cents) : "Unverified"} quality={quality(revenue)} limitation={String(revenue.limitations || "")}>
        <span>Previous 30 days <b>{typeof revenue.previous_30d_cents === "number" ? money(revenue.previous_30d_cents) : "Unverified"}</b></span>
        <span>Growth <b>{typeof revenue.amount_cents === "number" && typeof revenue.previous_30d_cents === "number" ? growth(revenue.amount_cents,revenue.previous_30d_cents) : "N/A"}</b></span>
        <span>Developer / Buy with Rocket fees <b>{money(sources.developer)} / {money(sources.marketplace_fees)}</b></span>
        <span>Advertising retained <b>{money(sources.advertising)}</b></span>
        <span>Related party / independent customer <b>{money(revenue.related_party_cents)} / {money(revenue.independent_customer_cents)}</b></span>
        <span>Advertising gross, not retained <b>{money(revenue.current_30d_gross_advertising_cents)}</b></span>
        <span>Related-party advertising gross <b>{money(revenue.related_party_gross_advertising_cents)}</b></span>
      </Card>
    </div>
  </section>;
}
