import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { useAuth } from "@/contexts/AuthContext";
import SiteHeader from "@/components/SiteHeader";
import type { MyApp } from "@/components/AppJourney";
import { loadMyApps } from "@/lib/myApps";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import { BUSINESS_MODELS, calculateValuation, type ValuationInputs, type ValuationResult } from "@/lib/rocketValuation";

type Saved = { id: string; app_id: string | null; inputs: ValuationInputs; result: ValuationResult; calculated_at: string };
const initial: ValuationInputs = { currency: "USD", mrr: 0, monthlyTraffic: 0, monthlyRevenueGrowthPct: 0, ageMonths: 0, businessModel: "saas" };
const models: Record<string, string> = { saas: "SaaS", ai: "AI application", mobile: "Mobile application", subscription: "Subscription software", one_time: "One-time purchase software", marketplace: "Marketplace", other: "Other" };
const format = (amount: number, currency: ValuationInputs["currency"]) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
const numberFields: Array<{ key: keyof ValuationInputs; label: string; required?: boolean; min?: number; max?: number; step?: number }> = [
  { key: "mrr", label: "Monthly recurring revenue", required: true, min: 0 },
  { key: "monthlyTraffic", label: "Monthly website visits", required: true, min: 0 },
  { key: "monthlyRevenueGrowthPct", label: "Monthly revenue growth (%)", required: true, min: -100, max: 500, step: 0.1 },
  { key: "ageMonths", label: "Business age (months)", required: true, min: 0 },
  { key: "monthlyProfit", label: "Monthly profit", min: -10000000 },
  { key: "grossMarginPct", label: "Gross margin (%)", min: 0, max: 100 },
  { key: "monthlyChurnPct", label: "Monthly customer churn (%)", min: 0, max: 100, step: 0.1 },
  { key: "revenueConcentrationPct", label: "Revenue from largest customer (%)", min: 0, max: 100 },
  { key: "organicTrafficPct", label: "Organic traffic share (%)", min: 0, max: 100 },
  { key: "annualRecurringRevenue", label: "Annual recurring revenue (optional override)", min: 0 },
  { key: "payingCustomers", label: "Paying customers", min: 0 },
  { key: "monthlyOperatingExpenses", label: "Monthly operating expenses", min: 0 },
  { key: "trafficGrowthPct", label: "Monthly traffic growth (%)", min: -100, max: 500, step: 0.1 },
];

export default function SellMyApp() {
  const { user } = useAuth();
  const [inputs, setInputs] = useState<ValuationInputs>(initial);
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [apps, setApps] = useState<MyApp[]>([]);
  const [appId, setAppId] = useState("");
  const [history, setHistory] = useState<Saved[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareAmount, setShareAmount] = useState(false);
  const [shareName, setShareName] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const startedRef = useRef(false);
  const db = supabase as any;

  useEffect(() => { track("valuation_page_viewed", { route: "/sellmyapp" }); }, []);
  useEffect(() => {
    if (!user) { setApps([]); setHistory([]); setAppId(""); return; }
    let active = true;
    void loadMyApps().then((items) => { if (active) setApps(items.filter((item) => item.owned)); }).catch(() => { if (active) setError("Your Rocket apps could not be loaded right now."); });
    void db.from("rocket_valuations").select("id,app_id,inputs,result,calculated_at").order("calculated_at", { ascending: false }).limit(30)
      .then(({ data, error: queryError }: { data: Saved[] | null; error: { message: string } | null }) => {
        if (!active) return;
        if (queryError) setNotice("Private valuation history is temporarily unavailable.");
        else setHistory(data || []);
      });
    return () => { active = false; };
  }, [user?.id]);

  const selectApp = (id: string) => {
    setAppId(id);
    const item = apps.find((app) => app.app_id === id);
    if (item?.app) {
      setInputs((current) => ({ ...current, appName: item.app?.name || "", appUrl: item.app?.website_url || "" }));
      track("valuation_app_selected", { app_id: id });
    }
    setResult(null);
  };
  const setNumber = (key: keyof ValuationInputs, value: string) => {
    setInputs((current) => {
      const next = { ...current } as Record<string, unknown>;
      if (value === "" && !numberFields.find((field) => field.key === key)?.required) delete next[key];
      else next[key] = value === "" ? Number.NaN : Number(value);
      return next as ValuationInputs;
    });
  };
  const calculate = (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    try {
      const next = calculateValuation(inputs);
      setResult(next); track("valuation_completed", { basis: next.basis, confidence: next.confidence, has_rocket_app: Boolean(appId) });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please check your inputs."); }
  };
  const save = async () => {
    if (!user || !result) return;
    setBusy(true); setError(""); setNotice("");
    const row = { user_id: user.id, app_id: appId || null, inputs, result, currency: inputs.currency,
      low_amount: result.low, central_amount: result.central, high_amount: result.high,
      confidence: result.confidence, model_version: result.modelVersion,
      data_sources: ["manual"], verification_status: "manual" };
    const { data, error: saveError } = await db.from("rocket_valuations").insert(row)
      .select("id,app_id,inputs,result,calculated_at").single();
    setBusy(false);
    if (saveError) { setError("Could not save this private valuation. Please try again."); return; }
    setHistory((current) => [data as Saved, ...current].slice(0, 30));
    setNotice("Saved privately to your Rocket account."); track("valuation_saved", { has_rocket_app: Boolean(appId) });
  };
  const remove = async (id: string) => {
    const { error: deleteError } = await db.from("rocket_valuations").delete().eq("id", id);
    if (deleteError) { setError("Could not delete this valuation."); return; }
    setHistory((current) => current.filter((entry) => entry.id !== id));
  };
  const share = (platform: "x" | "linkedin") => {
    if (!result) return;
    const url = "https://tryrocket.ai/sellmyapp";
    const value = shareAmount && result.central !== null ? `My app's illustrative value is ${format(result.central, result.currency)}. ` : "Find out what your app could be worth. ";
    const name = shareName && inputs.appName ? `${inputs.appName}: ` : "";
    const text = `${name}${value}Calculated with Rocket Sell My App.`;
    const target = platform === "x" ? `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
      : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(target, "_blank", "noopener,noreferrer");
    track("valuation_shared", { platform, included_amount: shareAmount, included_name: shareName });
  };
  const download = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
      const link = document.createElement("a"); link.download = "rocket-sell-my-app.png"; link.href = dataUrl; link.click();
      track("valuation_shared", { platform: "download", included_amount: shareAmount, included_name: shareName });
    } catch { setError("The share image could not be generated. Please try again."); }
  };
  const selected = apps.find((app) => app.app_id === appId);
  const canList = Boolean(user && selected?.owned && selected.owner_verification_level === "domain_verified" && result?.central != null && inputs.currency === "USD");
  const listingUrl = canList ? `/my-apps/${encodeURIComponent(appId)}?valuation_price=${Math.round(result!.central!)}#acquisition` : user ? appId ? `/my-apps/${encodeURIComponent(appId)}#acquisition` : "/your-apps" : "/login?next=%2Fsellmyapp";
  const required = numberFields.filter((field) => field.required);
  const optional = numberFields.filter((field) => !field.required);
  const field = ({ key, label, min, max, step }: typeof numberFields[number]) => <label key={key} className="block text-sm font-medium text-slate-700">{label}
    <input type="number" min={min} max={max} step={step || 1} value={(inputs[key] as number | undefined) ?? ""} onChange={(event) => setNumber(key, event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none focus:border-sky-500" />
  </label>;

  return <div className="min-h-screen bg-[#f5f8fc] text-slate-950"><SiteHeader />
    <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
      <section className="grid gap-10 py-14 lg:grid-cols-[1.2fr_.8fr] lg:items-center lg:py-20">
        <div><p className="text-xs font-bold uppercase tracking-[.25em] text-sky-700">Sell My App · by Rocket</p>
          <h1 className="mt-5 max-w-2xl text-5xl font-bold tracking-tight sm:text-6xl">What’s your app worth?</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Discover what your software could sell for. Get an instant estimate based on revenue, growth and traffic.</p>
          <div className="mt-8 flex flex-wrap gap-3"><button onClick={() => { if (!startedRef.current) { startedRef.current = true; track("valuation_started"); } formRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="min-h-12 rounded-xl bg-sky-700 px-6 font-semibold text-white hover:bg-sky-800">Calculate valuation</button>
            <button onClick={() => { if (!user) { track("valuation_signup_started"); window.location.href = "/login?next=%2Fsellmyapp"; } else formRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="min-h-12 rounded-xl border border-slate-300 bg-white px-6 font-semibold text-slate-900">Connect my Rocket app</button></div>
          <p className="mt-5 text-sm text-slate-500">Free to use · No account required · No financial data made public</p>
        </div>
        <div className="grid gap-3 rounded-3xl border border-sky-100 bg-white p-6 shadow-lg shadow-sky-100/60">
          {["Enter your metrics|Tell us about your app, revenue and traffic.", "Get your valuation|See a transparent estimated range and its assumptions.", "Sell your app|Ready to exit? Start a listing on Rocket Marketplace."].map((item, index) => { const [title, description] = item.split("|"); return <div key={title} className="flex gap-4 rounded-2xl bg-slate-50 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 font-bold text-sky-700">{index + 1}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div></div>; })}
        </div>
      </section>
      <section ref={formRef} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="calculator-title">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-sky-700">Sell My App calculator</p><h2 id="calculator-title" className="mt-2 text-3xl font-bold">Calculate your estimate</h2><p className="mt-2 text-slate-600">Use zero where you have no revenue yet. Optional fields improve context.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Model v1.0.0</span></div>
        {user && <label className="mt-7 block max-w-xl text-sm font-medium text-slate-700">Your Rocket app (optional)<select value={appId} onChange={(event) => selectApp(event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"><option value="">An app not on Rocket</option>{apps.map((item) => <option key={item.app_id} value={item.app_id}>{item.app?.name || "Untitled app"} · {item.owner_verification_level === "domain_verified" ? "verified" : "claimed"}</option>)}</select></label>}
        {appId && selected?.owner_verification_level === "domain_verified" && <div className="mt-4 flex flex-wrap gap-4 text-sm"><a className="font-semibold text-sky-700 underline" href={`/my-apps/${encodeURIComponent(appId)}/revenue`}>Connect Stripe on Rocket</a><a className="font-semibold text-sky-700 underline" href={`/my-apps/${encodeURIComponent(appId)}/analytics`}>Connect Google Analytics on Rocket</a><span className="text-slate-500">Connected metrics are managed on your private app pages; this calculator still uses the values you enter here.</span></div>}
        <form onFocus={() => { if (!startedRef.current) { startedRef.current = true; track("valuation_started"); } }} onSubmit={calculate} className="mt-7"><div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">App name (optional)<input maxLength={120} value={inputs.appName || ""} onChange={(event) => setInputs({ ...inputs, appName: event.target.value })} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base" /></label>
          <label className="text-sm font-medium text-slate-700">App URL (optional)<input type="url" maxLength={500} value={inputs.appUrl || ""} onChange={(event) => setInputs({ ...inputs, appUrl: event.target.value })} placeholder="https://example.com" className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base" /></label>
          <label className="text-sm font-medium text-slate-700">Currency<select value={inputs.currency} onChange={(event) => setInputs({ ...inputs, currency: event.target.value as ValuationInputs["currency"] })} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"><option>USD</option><option>EUR</option><option>GBP</option></select></label>
          <label className="text-sm font-medium text-slate-700">Business model<select value={inputs.businessModel} onChange={(event) => setInputs({ ...inputs, businessModel: event.target.value as ValuationInputs["businessModel"] })} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4">{BUSINESS_MODELS.map((model) => <option key={model} value={model}>{models[model]}</option>)}</select></label>
          {required.map(field)}
        </div><button type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} className="mt-7 text-sm font-semibold text-sky-700">{advanced ? "Hide" : "Show"} advanced inputs ↓</button>
          {advanced && <div className="mt-5 grid gap-5 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">{optional.map(field)}<label className="text-sm font-medium text-slate-700">Platform dependence<select value={inputs.platformDependence || ""} onChange={(event) => setInputs({ ...inputs, platformDependence: event.target.value as ValuationInputs["platformDependence"] || undefined })} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"><option value="">Not provided</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label className="text-sm font-medium text-slate-700">Operational complexity<select value={inputs.operationalComplexity || ""} onChange={(event) => setInputs({ ...inputs, operationalComplexity: event.target.value as ValuationInputs["operationalComplexity"] || undefined })} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"><option value="">Not provided</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div>}
          <div className="mt-8 flex flex-wrap items-center gap-4"><button type="submit" className="min-h-12 rounded-xl bg-sky-700 px-7 font-semibold text-white hover:bg-sky-800">Calculate my valuation</button><p className="text-sm text-slate-500">Manual inputs stay in your browser unless you choose Save.</p></div>
        </form>
      </section>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{notice && <p role="status" className="mt-5 rounded-xl bg-sky-50 p-4 text-sky-800">{notice}</p>}
      {result && <section ref={resultsRef} className="mt-10 space-y-6" aria-label="Valuation results">
        <div className="rounded-3xl bg-[#072743] p-6 text-white sm:p-10"><p className="text-sm font-bold uppercase tracking-widest text-sky-300">Your app’s estimated value</p>
          {result.central !== null ? <><h2 className="mt-4 text-4xl font-bold sm:text-6xl">{format(result.central, result.currency)}</h2><p className="mt-3 text-lg text-sky-100">Illustrative range: {format(result.low!, result.currency)} – {format(result.high!, result.currency)}</p><div className="mt-8 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-white/10 p-4">Low<br /><strong className="text-xl">{format(result.low!, result.currency)}</strong></div><div className="rounded-xl bg-white/10 p-4">Central<br /><strong className="text-xl">{format(result.central, result.currency)}</strong></div><div className="rounded-xl bg-white/10 p-4">High<br /><strong className="text-xl">{format(result.high!, result.currency)}</strong></div></div></> : <><h2 className="mt-4 text-3xl font-bold">More evidence needed</h2><p className="mt-3 max-w-2xl text-sky-100">A pre-revenue app can be valuable, but traffic alone cannot support a defensible sale-price estimate. Add profit or recurring revenue history as it develops.</p></>}
          <p className="mt-7 text-sm text-sky-100">Confidence: <strong className="capitalize">{result.confidence}</strong> · {result.basis === "annual_profit" ? "Annual profit" : result.basis === "annual_recurring_revenue" ? "Annual recurring revenue" : "Insufficient financial evidence"}{result.impliedMultiple !== null && ` · ${result.impliedMultiple.toFixed(2)}× basis`}</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border bg-white p-6"><h3 className="text-xl font-bold">Why this estimate?</h3><p className="mt-3 text-sm leading-6 text-slate-600">{result.methodology}</p><h4 className="mt-6 font-semibold">Key drivers</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">{(result.drivers.length ? result.drivers : ["No positive drivers were supplied yet."]).map((item) => <li key={item}>{item}</li>)}</ul><h4 className="mt-6 font-semibold">Principal risks</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">{result.risks.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div className="rounded-2xl border bg-white p-6"><h3 className="text-xl font-bold">Your inputs</h3><dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">MRR</dt><dd className="font-semibold">{format(inputs.mrr, inputs.currency)}</dd></div><div><dt className="text-slate-500">Monthly visits</dt><dd className="font-semibold">{inputs.monthlyTraffic.toLocaleString()}</dd></div><div><dt className="text-slate-500">Revenue growth</dt><dd className="font-semibold">{inputs.monthlyRevenueGrowthPct}%</dd></div><div><dt className="text-slate-500">Operating history</dt><dd className="font-semibold">{inputs.ageMonths} months</dd></div>{inputs.monthlyProfit !== undefined && <div><dt className="text-slate-500">Monthly profit</dt><dd className="font-semibold">{format(inputs.monthlyProfit, inputs.currency)}</dd></div>}</dl><p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Data status: manual and unverified. Connecting a provider in Rocket does not change this calculation unless its metrics are imported and validated.</p><h4 className="mt-6 font-semibold">How to strengthen the business</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">{result.suggestions.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
        <details className="rounded-2xl border bg-white p-6"><summary className="cursor-pointer font-semibold">Methodology and assumptions</summary><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">{result.assumptions.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-4 text-sm text-slate-600">This is an estimate, not a formal appraisal or guaranteed sale price. <a href="/valuation-methodology" className="text-sky-700 underline">Read the full methodology</a>.</p></details>
        {user ? <button disabled={busy} onClick={() => void save()} className="min-h-12 rounded-xl border border-sky-700 px-6 font-semibold text-sky-700 disabled:opacity-50">{busy ? "Saving…" : "Save privately to my account"}</button> : <a href="/login?next=%2Fsellmyapp" onClick={() => track("valuation_signup_started")} className="inline-flex min-h-12 items-center rounded-xl border border-sky-700 px-6 font-semibold text-sky-700">Sign in to save this valuation</a>}
        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-widest text-sky-700">Rocket Marketplace</p><h3 className="mt-2 text-2xl font-bold">Thinking about selling?</h3><p className="mt-2 text-slate-600">Rocket helps founders buy and sell software. Your estimated midpoint can be a starting asking price, which you can edit before submitting for review.</p><div className="mt-5 flex flex-wrap gap-3"><a href={listingUrl} onClick={() => track("valuation_listing_started", { has_rocket_app: Boolean(appId), can_prefill: canList })} className="inline-flex min-h-12 items-center rounded-xl bg-sky-700 px-6 font-semibold text-white">List my app for sale</a><a href="/marketplace" className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 bg-white px-6 font-semibold">Explore Rocket Marketplace</a></div>{!canList && <p className="mt-3 text-sm text-slate-600">To prefill a listing, select a domain-verified Rocket app and calculate in USD. The existing seller review still applies.</p>}</div>
        <div className="rounded-3xl border bg-white p-6 sm:p-8"><h3 className="text-xl font-bold">Share my valuation</h3><p className="mt-2 text-sm text-slate-600">Your result is private. Choose what to reveal; no revenue or traffic figures are included.</p><div className="mt-4 flex flex-wrap gap-5 text-sm"><label><input type="checkbox" checked={shareAmount} onChange={(event) => setShareAmount(event.target.checked)} /> Include estimated value</label><label><input type="checkbox" checked={shareName} onChange={(event) => setShareName(event.target.checked)} /> Include app name</label></div><div ref={cardRef} className="mt-5 max-w-xl rounded-2xl border border-slate-200 bg-white p-8"><p className="text-sm font-extrabold uppercase tracking-[.2em] text-sky-700">✿ Rocket · Sell My App</p><h4 className="mt-6 text-3xl font-bold">{shareName && inputs.appName ? inputs.appName : "What’s your app worth?"}</h4><p className="mt-3 text-xl text-slate-600">{shareAmount && result.central !== null ? `Illustrative value: ${format(result.central, result.currency)}` : "Discover an illustrative software valuation."}</p><p className="mt-8 text-sm font-semibold text-sky-700">tryrocket.ai/sellmyapp</p></div><div className="mt-5 flex flex-wrap gap-3"><button onClick={() => share("x")} className="min-h-11 rounded-xl bg-slate-900 px-5 font-semibold text-white">Share on X</button><button onClick={() => share("linkedin")} className="min-h-11 rounded-xl bg-[#0a66c2] px-5 font-semibold text-white">Share on LinkedIn</button><button onClick={() => void download()} className="min-h-11 rounded-xl border px-5 font-semibold">Download image</button></div></div>
      </section>}
      {user && history.length > 0 && <section className="mt-12"><h2 className="text-2xl font-bold">Your private history</h2><p className="mt-2 text-sm text-slate-600">Only you can see these saved estimates. Recalculate with current inputs to compare over time.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{history.map((entry) => <div key={entry.id} className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">{new Date(entry.calculated_at).toLocaleDateString()}</p><h3 className="mt-2 font-semibold">{entry.inputs.appName || "Unnamed app"}</h3><p className="mt-2 text-xl font-bold">{entry.result.central === null ? "Insufficient evidence" : format(entry.result.central, entry.result.currency)}</p><div className="mt-4 flex gap-4 text-sm"><button onClick={() => { setInputs(entry.inputs); setAppId(entry.app_id && apps.some((item) => item.app_id === entry.app_id) ? entry.app_id : ""); setResult(entry.result); resultsRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="font-semibold text-sky-700">View</button><button onClick={() => { setInputs(entry.inputs); setAppId(entry.app_id && apps.some((item) => item.app_id === entry.app_id) ? entry.app_id : ""); setResult(null); formRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="font-semibold text-sky-700">Recalculate</button><button onClick={() => void remove(entry.id)} className="font-semibold text-red-700">Delete</button></div></div>)}</div></section>}
      <section className="mt-16 max-w-3xl"><h2 className="text-2xl font-bold">Common questions</h2><div className="mt-5 space-y-3">{[
        ["How much is my app worth?", "A sale price depends on actual profit, recurring revenue, transferability and buyer diligence. This calculator gives an illustrative range where there is sufficient financial evidence."],
        ["How are SaaS businesses valued?", "Small SaaS transactions often use a multiple of annual profit. Where profit is unknown, this calculator uses a cautious annual recurring revenue approach and lowers confidence."],
        ["Can I value an app without revenue?", "You can enter a pre-revenue app. We explain why traffic alone cannot support a defensible dollar estimate."],
        ["How accurate is the calculator?", "It is an estimate based on self-reported inputs, not an appraisal or offer. The range can change substantially after verification and due diligence."],
        ["Can I sell my app on Rocket?", "Yes. Domain-verified owners can submit a Marketplace listing for review. No listing is published automatically."],
      ].map(([question, answer]) => <details key={question} className="rounded-xl border bg-white p-5"><summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3 text-sm leading-6 text-slate-600">{answer}</p></details>)}</div></section>
    </main></div>;
}
