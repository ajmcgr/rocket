import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import DealFeeBreakdown from "@/components/DealFeeBreakdown";
import { centsFromInput, dealsDb as db, money, nextAction, statusLabel, type Approval, type ChecklistItem, type Deal, type DealCurrency, type FeeQuote, type Offer, type Version } from "@/lib/rocketDeals";

type App = { id: string; name: string; logo_url: string | null; slug: string | null };
type Peer = { user_id: string; full_name: string | null; username: string | null };
type Row = Deal & { app?: App; peer?: Peer; amount_cents?: number; currency?: string; action?: string };

export default function Deals() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const offerAppId = params.get("offer");
  const [rows, setRows] = useState<Row[]>([]);
  const [app, setApp] = useState<App | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [message, setMessage] = useState("");
  const [conditions, setConditions] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [quote, setQuote] = useState<FeeQuote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const result = await db.from("rocket_deals").select("*").order("updated_at", { ascending: false }).limit(100);
    if (result.error) { setError("Deals could not be loaded."); setLoading(false); return; }
    const deals = result.data as Deal[];
    if (!deals.length) { setRows([]); setLoading(false); return; }
    const [apps, people, offers, agreements, checklists, approvals] = await Promise.all([
      db.from("public_discoverable_apps").select("id,name,logo_url,slug").in("id", [...new Set(deals.map((d) => d.app_id))]),
      db.from("member_public_profiles").select("user_id,full_name,username").in("user_id", [...new Set(deals.flatMap((d) => [d.buyer_id,d.seller_id]))]),
      db.from("rocket_deal_offers").select("deal_id,actor_id,amount_cents,currency,sequence").in("deal_id", deals.map((d) => d.id)).order("sequence", { ascending: true }),
      db.from("rocket_deal_agreements").select("deal_id,version").in("deal_id", deals.map((d) => d.id)).order("version", { ascending: true }),
      db.from("rocket_deal_checklists").select("deal_id,version").in("deal_id", deals.map((d) => d.id)).order("version", { ascending: true }),
      db.from("rocket_deal_approvals").select("deal_id,kind,version,user_id,approved_at").in("deal_id", deals.map((d) => d.id)),
    ]);
    setRows(deals.map((d) => ({ ...d,
      app: (apps.data || []).find((a: App) => a.id === d.app_id),
      peer: (people.data || []).find((p: Peer) => p.user_id === (d.buyer_id === user.id ? d.seller_id : d.buyer_id)),
      amount_cents: (offers.data || []).filter((o: {deal_id:string}) => o.deal_id === d.id).at(-1)?.amount_cents,
      currency: (offers.data || []).filter((o: {deal_id:string}) => o.deal_id === d.id).at(-1)?.currency,
      action: nextAction(d,user.id,
        (offers.data || []).filter((o: {deal_id:string}) => o.deal_id === d.id) as Offer[],
        (agreements.data || []).filter((a: {deal_id:string}) => a.deal_id === d.id) as Version<{terms:Record<string,string>}>[],
        (checklists.data || []).filter((c: {deal_id:string}) => c.deal_id === d.id) as Version<{items:ChecklistItem[]}>[],
        (approvals.data || []).filter((a: {deal_id:string}) => a.deal_id === d.id) as Approval[]),
    })));
    setLoading(false);
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!offerAppId) return;
    void db.from("public_discoverable_apps").select("id,name,logo_url,slug").eq("id",offerAppId).maybeSingle()
      .then(({data}: {data: App|null}) => setApp(data));
  }, [offerAppId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cents = centsFromInput(amount, currency as DealCurrency);
    if (!offerAppId || cents === null || quote?.acquisition_price_minor !== cents || quote.currency !== currency || !confirmed) {
      setError("Review the fee estimate and confirm the funds notice before submitting."); return;
    }
    setBusy(true); setError("");
    const { data, error: issue } = await db.rpc("rocket_deal_make_offer", {
      p_app_id: offerAppId, p_amount_cents: cents, p_currency: currency, p_message: message,
      p_conditions: conditions, p_timeframe: timeframe, p_request_id: crypto.randomUUID(), p_no_funds_confirmed: true,
    });
    setBusy(false);
    if (issue) { setError(issue.message || "Offer could not be submitted."); return; }
    window.location.assign(`/deals/${data}`);
  }
  const card = (row: Row) => <Link key={row.id} to={`/deals/${row.id}`} className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm hover:border-sky-400">
    <div className="flex items-start gap-3">{row.app?.logo_url && <img src={row.app.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />}
      <div className="min-w-0"><h3 className="font-semibold">{row.app?.name || "App"}</h3><p className="text-sm text-neutral-600">{row.peer?.username ? `@${row.peer.username}` : row.peer?.full_name || "Rocket member"}</p></div></div>
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm"><span>{row.amount_cents ? money(row.amount_cents,row.currency) : "Offer"}</span><span>{statusLabel(row.status)}</span><span>{new Date(row.updated_at).toLocaleDateString()}</span></div>
    <p className="mt-3 text-sm font-medium text-sky-700">{row.action || "Open deal room"} →</p>
  </Link>;
  return <main className="mx-auto max-w-5xl px-4 py-8 text-neutral-900 sm:px-6">
    <h1 className="text-3xl font-bold">My Deals</h1><p className="mt-2 text-neutral-600">Private software acquisition offers and preparation.</p>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {offerAppId && app && <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4 rounded-2xl border border-sky-200 bg-white p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Make Offer for {app.name}</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_150px]"><label className="block text-sm font-medium">Offer amount<input required value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="10000.00" className="mt-1 block min-h-11 w-full rounded-xl border px-3" /></label>
        <label className="block text-sm font-medium">Currency<select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border px-3">{["USD","EUR","GBP","AUD","CAD","JPY","KWD"].map((code) => <option key={code}>{code}</option>)}</select></label></div>
      <DealFeeBreakdown priceMinor={centsFromInput(amount,currency as DealCurrency)} currency={currency as DealCurrency} role="buyer" onQuote={setQuote} />
      <label className="block text-sm font-medium">Optional message<textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} className="mt-1 block min-h-20 w-full rounded-xl border p-3" /></label>
      <label className="block text-sm font-medium">Proposed conditions<textarea value={conditions} onChange={(e) => setConditions(e.target.value)} maxLength={2000} className="mt-1 block min-h-20 w-full rounded-xl border p-3" /></label>
      <label className="block text-sm font-medium">Preferred handover timeframe<input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} maxLength={200} className="mt-1 block min-h-11 w-full rounded-xl border px-3" /></label>
      <label className="flex items-start gap-3 text-sm"><input required type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" /><span>I understand that submitting an offer does not transfer funds or create escrow protection.</span></label>
      <p className="text-xs text-neutral-500">Do not include passwords, API keys, or customer data.</p>
      <button disabled={busy || !quote || !confirmed} className="min-h-11 rounded-xl bg-[#167ac6] px-6 font-semibold text-white disabled:opacity-50">{busy ? "Submitting…" : "Submit offer"}</button>
    </form>}
    {offerAppId && !app && <p className="mt-6 text-sm text-neutral-600">Loading app…</p>}
    <section className="mt-8"><h2 className="mb-4 text-xl font-semibold">Buying</h2>{loading ? <p>Loading…</p> : rows.filter((d) => d.buyer_id === user?.id).length ? <div className="grid gap-4 sm:grid-cols-2">{rows.filter((d) => d.buyer_id === user?.id).map(card)}</div> : <p className="text-sm text-neutral-600">No buying deals yet.</p>}</section>
    <section className="mt-8"><h2 className="mb-4 text-xl font-semibold">Selling</h2>{loading ? <p>Loading…</p> : rows.filter((d) => d.seller_id === user?.id).length ? <div className="grid gap-4 sm:grid-cols-2">{rows.filter((d) => d.seller_id === user?.id).map(card)}</div> : <p className="text-sm text-neutral-600">No selling deals yet.</p>}</section>
  </main>;
}
