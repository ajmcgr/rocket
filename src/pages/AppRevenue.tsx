import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";

type Visibility = "private" | "verified_only" | "range" | "exact";
type Price = { id: string; product_id: string; product_name: string; currency: string;
  unit_amount_decimal: string | null; interval: string; interval_count: number };
type Mapping = { stripe_price_id: string; stripe_product_id: string; currency: string };
type Point = { currency: string; mrr_minor: string; observed_at: string;
  verification_status: "verified" | "unsupported"; source_livemode: boolean;
  unsupported_subscriptions: number };
type Status = { connect_available: boolean; connection: null | { status: string; external_account_id: string; livemode: boolean;
  last_attempted_sync: string | null; last_successful_sync: string | null; last_error: string | null };
  mapping_version: number; visibility: Visibility; mappings: Mapping[]; latest: Point[] };

const visibilityChoices: Array<{ value: Visibility; label: string }> = [
  { value: "private", label: "Private" },
  { value: "verified_only", label: "Verified only" },
  { value: "range", label: "Range" },
  { value: "exact", label: "Exact" },
];

function moneyFromMinor(value: string, currency: string) {
  try {
    const format = new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() });
    const exponent = format.resolvedOptions().maximumFractionDigits ?? 2;
    const amount = Number(value) / 10 ** exponent;
    return Number.isFinite(amount) ? format.format(amount) : `${value} ${currency.toUpperCase()} minor units`;
  } catch { return `${value} ${currency.toUpperCase()} minor units`; }
}

export default function AppRevenue() {
  const { id } = useParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: requestError } = await supabase.functions.invoke("rocket-stripe-revenue", {
      body: { action, app_id: id, ...extra },
    });
    if (requestError || data?.error) throw new Error(data?.error || requestError?.message || "Stripe revenue request failed");
    return data;
  }, [id]);
  const refresh = useCallback(async () => {
    const next = await request("status") as Status;
    setStatus(next);
    setSelected(next.mappings.map((mapping) => mapping.stripe_price_id));
  }, [request]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("stripe") === "error")
      setError("Stripe authorization could not be completed. No revenue was published.");
    refresh().catch((cause) => setError((cause as Error).message));
  }, [refresh]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const catalog = () => run(async () => {
    const result = await request("catalog");
    setPrices(result.prices || []);
  });
  return <main className="mx-auto max-w-3xl px-6 py-10 text-neutral-900">
    <Link to="/my-apps" className="text-sm text-sky-700">← My Apps</Link>
    <h1 className="mt-5 font-display text-3xl">Revenue verification</h1>
    <p className="mt-2 text-sm text-neutral-600">Connect this domain-verified app to its own Stripe account. Rocket reads subscriptions and selected prices only; it never handles payments here. Revenue is private by default.</p>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
    <section className="mt-6 rounded-2xl border bg-white p-6">
      <h2 className="font-semibold">Stripe account</h2>
      {!status && !error && <p className="mt-2 text-sm text-neutral-500">Loading connection…</p>}
      {status && <>
        <p className="mt-2 text-sm text-neutral-600">{status.connection
          ? `${status.connection.status} · ${status.connection.external_account_id} · ${status.connection.livemode ? "Live" : "Sandbox"}`
          : "Not connected"}</p>
        {status.connection?.last_successful_sync && <p className="mt-1 text-xs text-neutral-500">Last successful sync: {new Date(status.connection.last_successful_sync).toLocaleString()}</p>}
        {status.connection?.last_error && <p className="mt-2 text-sm text-amber-700">Sync needs attention: {status.connection.last_error}</p>}
        {!status.connection && !status.connect_available && <p className="mt-4 text-sm text-amber-700">Coming soon. Stripe revenue verification is not available until the read-only external integration has passed acceptance testing.</p>}
        {!status.connection && status.connect_available && <button disabled={busy} onClick={() => run(async () => {
          const result = await request("start"); window.location.assign(result.authorization_url);
        })} className="mt-4 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">Connect Stripe</button>}
        {status.connection?.status === "error" && status.connect_available && <button disabled={busy} onClick={() => run(async () => {
          const result = await request("start"); window.location.assign(result.authorization_url);
        })} className="mt-4 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">Reconnect Stripe</button>}
        {status.connection && <button disabled={busy} onClick={() => {
          if (!window.confirm("Disconnect this app from Stripe revenue verification? Private historical points remain, but public verification is removed. Uninstall the Stripe App separately in Stripe if you no longer want it installed.")) return;
          run(async () => { await request("disconnect"); setPrices([]); setSelected([]); await refresh(); setNotice("Disconnected. Public revenue verification has been removed."); });
        }} className="mt-4 rounded-xl border px-4 py-2 text-sm text-red-700 disabled:opacity-50">Disconnect</button>}
      </>}
    </section>
    {status?.connection && <section className="mt-6 rounded-2xl border bg-white p-6">
      <h2 className="font-semibold">Products and prices for this app</h2>
      <p className="mt-2 text-sm text-neutral-600">Select exact Stripe prices. A price can belong to only one Rocket app for this Stripe account. Changing the mapping clears public verification until the next successful sync.</p>
      <button disabled={busy} onClick={catalog} className="mt-4 rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Load Stripe prices</button>
      {prices.length > 0 && <div className="mt-4 max-h-80 space-y-2 overflow-y-auto border-t pt-4">{prices.map((price) => <label key={price.id} className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={selected.includes(price.id)} disabled={busy} onChange={(event) => setSelected((current) => event.target.checked
          ? [...current, price.id] : current.filter((id) => id !== price.id))} />
        <span>{price.product_name} · {moneyFromMinor(price.unit_amount_decimal || "0", price.currency)} / {price.interval_count > 1 ? `${price.interval_count} ` : ""}{price.interval}{price.interval_count > 1 ? "s" : ""}<span className="block text-xs text-neutral-500">{price.id}</span></span>
      </label>)}</div>}
      {status.mappings.length > 0 && <p className="mt-4 text-xs text-neutral-600">Currently mapped: {status.mappings.map((item) => item.stripe_price_id).join(", ")}</p>}
      {prices.length > 0 && <button disabled={busy} onClick={() => run(async () => {
        await request("save_mapping", { price_ids: selected }); await refresh();
        setNotice("Price mapping saved. Sync again before relying on a verified MRR point.");
      })} className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50">Save price mapping</button>}
      {status.mappings.length > 0 && <button disabled={busy} onClick={() => run(async () => {
        await request("sync"); await refresh(); setNotice("Subscription MRR was recalculated from Stripe. Sandbox figures remain private and cannot appear as production-verified revenue.");
      })} className="ml-2 mt-4 rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Sync MRR</button>}
      {status.latest.length > 0 && <div className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Latest private snapshot</h3>
        {status.latest.map((point) => <p key={point.currency} className="mt-2 text-sm">{point.currency.toUpperCase()}: {point.verification_status === "verified" ? moneyFromMinor(point.mrr_minor, point.currency) : "Unsupported configuration — not verified"}
          <span className="block text-xs text-neutral-500">{new Date(point.observed_at).toLocaleString()} · {point.source_livemode ? "Live" : "Sandbox"}{point.unsupported_subscriptions ? ` · ${point.unsupported_subscriptions} unsupported subscriptions` : ""}</span></p>)}
      </div>}
    </section>}
    {status?.connection && <section className="mt-6 rounded-2xl border bg-white p-6">
      <h2 className="font-semibold">Public visibility</h2>
      <p className="mt-2 text-sm text-neutral-600">Private by default. Only a fresh, fully supported live Stripe snapshot can appear on the public profile. Sandbox data never appears there.</p>
      <label className="mt-4 block text-sm">Subscription MRR
        <select value={status.visibility} disabled={busy} onChange={(event) => run(async () => {
          await request("set_visibility", { visibility: event.target.value }); await refresh();
          setNotice("Visibility updated. Check the public profile to see exactly what is shown.");
        })} className="mt-2 block rounded-lg border px-3 py-2">{visibilityChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
      </label>
      {!status.connection.livemode && <p className="mt-3 text-sm text-amber-700">This is a sandbox Stripe connection. Visibility settings are saved, but no test revenue will be published.</p>}
      <Link to={`/apps/${id}`} className="mt-4 inline-block text-sm text-sky-700">Preview public app profile →</Link>
    </section>}
  </main>;
}
