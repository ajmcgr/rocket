import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import SiteHeader from "@/components/SiteHeader";
import type { MyApp } from "@/components/AppJourney";
import { loadMyApps } from "@/lib/myApps";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import { BUSINESS_MODELS, calculateValuation, type ValuationInputs, type ValuationResult } from "@/lib/rocketValuation";
import { verifiedGa4Metrics, verifiedStripeMrr } from "@/lib/valuationVerifiedMetrics";
import { valuationShareIconUrl } from "@/lib/valuationShareIcon";
import { acquisitionDb } from "@/lib/rocketAcquisition";
import AcquisitionSettings from "@/components/AcquisitionSettings";
import { emptySubmission } from "../../supabase/functions/_shared/appSubmission";
import { emptySellListingDraft, readSellListingDraft, sameAppWebsite, saveSellListingDraft, validSellListingIdentity, type SellListingDraft } from "@/lib/sellListingDraft";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./SellMyApp.css";

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
  { key: "organicTrafficPct", label: "Organic traffic share (%)", min: 0, max: 100, step: 0.1 },
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
  const [listingDraft, setListingDraft] = useState<SellListingDraft>(emptySellListingDraft);
  const [draftReady, setDraftReady] = useState(false);
  const [listingError, setListingError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState<"stripe" | "ga4" | null>(null);
  const [evidence, setEvidence] = useState({ stripe: false, ga4: false });
  const [ga4Period, setGa4Period] = useState("");
  const [monthlyActiveUsers, setMonthlyActiveUsers] = useState<number | null>(null);
  const [iconBroken, setIconBroken] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [listedForSale, setListedForSale] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const sellRef = useRef<HTMLElement>(null);
  const startedRef = useRef(false);
  const listingStartedRef = useRef(false);
  const appIconSource = valuationShareIconUrl(inputs.appUrl);
  const appDomain = appIconSource ? new URL(inputs.appUrl || "").hostname.replace(/^www\./i, "") : "";
  const shareDisplayName = inputs.appName?.trim() || appDomain || "Your app";
  const hasSharedAppIdentity = Boolean(inputs.appName?.trim() || appDomain);
  const selected = apps.find((app) => app.app_id === appId);
  const draftMatchesSelected = Boolean(selected?.app?.website_url && sameAppWebsite(selected.app.website_url, listingDraft.appUrl));
  const shareBadge = listedForSale && Boolean(selected?.app) && selected?.app?.name === inputs.appName && selected?.app?.website_url === inputs.appUrl
    ? "For Sale" : "Estimated Value";

  useEffect(() => { setIconBroken(false); }, [appIconSource]);
  useEffect(() => { setListingDraft(readSellListingDraft()); setDraftReady(true); }, []);
  useEffect(() => { if (draftReady) saveSellListingDraft(listingDraft); }, [draftReady, listingDraft]);
  useEffect(() => {
    setListedForSale(false);
    if (!appId) return;
    let active = true;
    void acquisitionDb.from("public_rocket_acquisition_listings").select("status").eq("app_id", appId).maybeSingle()
      .then(({ data }: { data: { status: string } | null }) => {
        if (active) setListedForSale(data?.status === "for_sale");
      }).catch(() => { if (active) setListedForSale(false); });
    return () => { active = false; };
  }, [appId]);

  useEffect(() => { track("valuation_page_viewed", { route: "/sell" }); }, []);
  useEffect(() => {
    if (!user) { setApps([]); setAppId(""); return; }
    let active = true;
    void loadMyApps().then((items) => {
      if (!active) return;
      const owned = items.filter((item) => item.owned);
      setApps(owned);
      const draftUrl = readSellListingDraft().appUrl;
      if (!draftUrl) return;
      const match = owned.find((item) => item.app?.website_url && sameAppWebsite(item.app.website_url, draftUrl));
      if (match) setAppId((current) => current || match.app_id);
    }).catch(() => { if (active) setError("Your Rocket apps could not be loaded right now."); });
    return () => { active = false; };
  }, [user?.id]);

  const selectApp = (id: string) => {
    setAppId(id);
    listingStartedRef.current = false;
    setEvidence({ stripe: false, ga4: false }); setGa4Period(""); setMonthlyActiveUsers(null);
    const item = apps.find((app) => app.app_id === id);
    if (item?.app) {
      setInputs((current) => ({ ...current, appName: item.app?.name || "", appUrl: item.app?.website_url || "" }));
      track("valuation_app_selected", { app_id: id });
    }
    setResult(null);
  };
  const updateListingDraft = (key: keyof SellListingDraft, value: string) => {
    setListingError("");
    setListingDraft((current) => ({ ...current, [key]: value }));
  };
  const validateListingDraft = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!validSellListingIdentity(listingDraft)) {
      event.preventDefault();
      setListingError("Enter your app name and a valid HTTPS website URL to continue.");
      return false;
    }
    if (listingDraft.status === "for_sale" && listingDraft.price.trim()) {
      const amount = Number(listingDraft.price);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 999_999_999) {
        event.preventDefault();
        setListingError("Enter a whole-dollar asking price of at least $1, or leave it blank.");
        return false;
      }
    }
    saveSellListingDraft(listingDraft);
    return true;
  };
  const prepareAppSubmission = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!validateListingDraft(event)) return;
    try {
      sessionStorage.setItem("rocket:app-submission-v2", JSON.stringify({
        url: listingDraft.appUrl, importUrl: listingDraft.appUrl,
        details: { ...emptySubmission(), name: listingDraft.appName.trim() }, step: 0, editing: false,
      }));
    } catch { /* The submission form can still be completed without browser storage. */ }
  };
  const setNumber = (key: keyof ValuationInputs, value: string) => {
    if (["mrr", "annualRecurringRevenue"].includes(key)) setEvidence((current) => ({ ...current, stripe: false }));
    if (["monthlyTraffic", "organicTrafficPct", "trafficGrowthPct"].includes(key)) setEvidence((current) => ({ ...current, ga4: false }));
    setResult(null);
    setInputs((current) => {
      const next = { ...current } as Record<string, unknown>;
      if (value === "" && !numberFields.find((field) => field.key === key)?.required) delete next[key];
      else next[key] = value === "" ? Number.NaN : Number(value);
      return next as ValuationInputs;
    });
  };
  const importMetrics = async (provider: "stripe" | "ga4") => {
    if (!appId || !selected || selected.owner_verification_level !== "domain_verified") return;
    setImporting(provider); setError(""); setNotice("");
    try {
      if (provider === "stripe") {
        const { data, error: providerError } = await supabase.functions.invoke("rocket-stripe-revenue", {
          body: { action: "status", app_id: appId, installation: "marketplace" } });
        if (providerError) throw providerError;
        const mrr = verifiedStripeMrr(data, inputs.currency);
        setInputs((current) => ({ ...current, mrr, annualRecurringRevenue: undefined }));
        setEvidence((current) => ({ ...current, stripe: true }));
        setNotice(`Imported ${format(mrr, inputs.currency)} monthly recurring revenue from verified live Stripe products.`);
        track("valuation_stripe_connected", { app_id: appId });
      } else {
        const { data, error: providerError } = await supabase.functions.invoke("rocket-ga4", {
          body: { action: "valuation_snapshot", app_id: appId } });
        if (providerError) throw providerError;
        const metrics = verifiedGa4Metrics(data);
        setInputs((current) => ({ ...current, monthlyTraffic: metrics.sessions,
          organicTrafficPct: metrics.organicSharePct, trafficGrowthPct: metrics.trafficGrowthPct ?? undefined }));
        setMonthlyActiveUsers(metrics.activeUsers); setGa4Period(metrics.period);
        setEvidence((current) => ({ ...current, ga4: true }));
        setAdvanced(true);
        setNotice(`Imported ${metrics.sessions.toLocaleString()} sessions from verified Google Analytics (${metrics.period}).`);
        track("valuation_ga4_connected", { app_id: appId });
      }
      setResult(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import verified metrics."); }
    finally { setImporting(null); }
  };
  const calculate = (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    try {
      const next = calculateValuation(inputs, evidence);
      setResult(next); setShareOpen(true);
      track("valuation_completed", { basis: next.basis, confidence: next.confidence, has_rocket_app: Boolean(appId) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please check your inputs."); }
  };
  const share = (platform: "x" | "reddit" | "linkedin") => {
    if (!result) return;
    const url = "https://tryrocket.ai/sell";
    const value = result.central !== null ? `My app's illustrative value is ${format(result.central, result.currency)}. ` : "Find out what your app could be worth. ";
    const name = hasSharedAppIdentity ? `${shareDisplayName}: ` : "";
    const text = `${name}${value}Calculated with Rocket Sell My App.`;
    const target = platform === "x" ? `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
      : platform === "reddit" ? `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`
      : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(target, "_blank", "noopener,noreferrer");
    track("valuation_shared", { platform, included_amount: result.central !== null, included_name: hasSharedAppIdentity });
  };
  const renderCard = async () => {
    if (!result) throw new Error("Share card is unavailable.");
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1200, 630);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 1198, 628);
    const logo = new Image();
    logo.src = "/rocket-email-logo.png";
    try { await logo.decode(); ctx.drawImage(logo, 60, 49, 240, 84); }
    catch { ctx.fillStyle = "#0284c7"; ctx.font = "bold 52px Arial, sans-serif"; ctx.fillText("rocket", 60, 108); }
    ctx.fillStyle = "#f0f9ff";
    ctx.beginPath(); ctx.roundRect(870, 60, 270, 50, 25); ctx.fill();
    ctx.fillStyle = "#0369a1";
    ctx.font = "bold 20px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(shareBadge, 1005, 92);
    ctx.textAlign = "left";
    let iconVisible = false;
    if (appIconSource && !iconBroken) {
      const icon = new Image();
      icon.crossOrigin = "anonymous";
      icon.referrerPolicy = "no-referrer";
      icon.src = appIconSource;
      try {
        await icon.decode();
        const size = Math.min(90 / icon.naturalWidth, 90 / icon.naturalHeight);
        const width = icon.naturalWidth * size;
        const height = icon.naturalHeight * size;
        ctx.fillStyle = "#f8fafc";
        ctx.strokeStyle = "#e2e8f0";
        ctx.beginPath(); ctx.roundRect(60, 225, 110, 110, 20); ctx.fill(); ctx.stroke();
        ctx.drawImage(icon, 115 - width / 2, 280 - height / 2, width, height);
        iconVisible = true;
      } catch { /* An unavailable icon leaves the Rocket-only card usable. */ }
    }
    const textLeft = iconVisible ? 195 : 60;
    ctx.fillStyle = "#0f172a";
    let appName = shareDisplayName;
    let nameSize = 58;
    do { ctx.font = `bold ${nameSize}px Arial, sans-serif`; nameSize -= 2; } while (ctx.measureText(appName).width > 1140 - textLeft && nameSize > 32);
    while (ctx.measureText(appName).width > 1140 - textLeft && appName.length > 1) appName = `${appName.slice(0, -2)}…`;
    ctx.fillText(appName, textLeft, 270);
    ctx.fillStyle = "#0369a1";
    ctx.font = "bold 23px Arial, sans-serif";
    ctx.fillText("YOUR APP’S ESTIMATED VALUE", textLeft, 320);
    const value = result.central !== null ? format(result.central, result.currency) : "Value unavailable";
    let fontSize = result.central !== null ? 94 : 72;
    do { ctx.font = `bold ${fontSize}px Arial, sans-serif`; fontSize -= 2; } while (ctx.measureText(value).width > 1140 - textLeft && fontSize > 32);
    ctx.fillStyle = "#0f172a";
    ctx.fillText(value, textLeft, 435);
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath(); ctx.moveTo(60, 540); ctx.lineTo(1140, 540); ctx.stroke();
    ctx.fillStyle = "#475569";
    ctx.font = "22px Arial, sans-serif";
    ctx.fillText("Illustrative estimate · Not an offer or appraisal", 60, 586);
    ctx.fillStyle = "#0369a1";
    ctx.font = "bold 22px Arial, sans-serif";
    ctx.fillText("tryrocket.ai/sell", 948, 586);
    return canvas.toDataURL("image/png");
  };
  const download = async () => {
    try {
      setError("");
      const dataUrl = await renderCard();
      const link = document.createElement("a"); link.download = "rocket-sell-my-app.png"; link.href = dataUrl; document.body.append(link); link.click(); link.remove();
      track("valuation_shared", { platform: "download", included_amount: result?.central != null, included_name: hasSharedAppIdentity });
    } catch { setError("The share image could not be generated. Please try again."); }
  };
  const shareCard = async () => {
    try {
      setError("");
      const dataUrl = await renderCard();
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "rocket-sell-my-app.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "My app's estimated value", url: "https://tryrocket.ai/sell" });
          track("valuation_shared", { platform: "native", included_amount: result?.central != null, included_name: hasSharedAppIdentity });
          return;
        } catch (cause) {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
        }
      }
      const link = document.createElement("a"); link.download = file.name; link.href = dataUrl; document.body.append(link); link.click(); link.remove();
      setNotice("Card downloaded. Attach the PNG to your post on X, Reddit or LinkedIn.");
      track("valuation_shared", { platform: "download", included_amount: result?.central != null, included_name: hasSharedAppIdentity });
    } catch (cause) {
      setError("The share image could not be generated. Please try again.");
    }
  };
  const canManageListing = Boolean(user && selected?.owned && selected.owner_verification_level === "domain_verified");
  const suggestedAskingPrice = inputs.currency === "USD" && result?.central != null ? Math.round(result.central) : null;
  const markListingStarted = () => {
    if (listingStartedRef.current) return;
    listingStartedRef.current = true;
    track("valuation_listing_started", { has_rocket_app: Boolean(appId), can_prefill: suggestedAskingPrice !== null });
  };
  const required = numberFields.filter((field) => field.required);
  const optional = numberFields.filter((field) => !field.required);
  const field = ({ key, label, min, max, step }: typeof numberFields[number]) => <label key={key} className="block text-sm font-medium text-slate-700">{label}
    <input type="number" min={min} max={max} step={step || 1} value={(inputs[key] as number | undefined) ?? ""} onChange={(event) => setNumber(key, event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none focus:border-sky-500" />
  </label>;

  return <div className="min-h-screen bg-[#f5f8fc] text-slate-950"><SiteHeader />
    <main className="rocket-sell-page mx-auto max-w-6xl px-5 pb-24 sm:px-8">
      <section className="grid gap-10 py-14 lg:grid-cols-[1.2fr_.8fr] lg:items-center lg:py-20">
        <div><h1 className="max-w-2xl text-5xl font-bold tracking-tight sm:text-6xl">Sell my app</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">List your app on Rocket Marketplace. You can also get an optional estimate based on revenue, growth and traffic.</p>
          <div className="mt-8 flex flex-wrap gap-3"><button onClick={() => sellRef.current?.scrollIntoView({ behavior: "smooth" })} className="min-h-12 rounded-xl bg-sky-700 px-6 font-semibold text-white hover:bg-sky-800">Sell my app</button>
            <button onClick={() => { if (!startedRef.current) { startedRef.current = true; track("valuation_started"); } formRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="min-h-12 rounded-xl border border-slate-300 bg-white px-6 font-semibold text-slate-900">Calculate valuation</button></div>
          <p className="mt-5 text-sm text-slate-500">Start without an account · Sign up to publish · Valuation inputs stay private</p>
        </div>
        <div className="grid gap-3 rounded-3xl border border-sky-100 bg-white p-6 shadow-lg shadow-sky-100/60">
          {["Enter your app|Add your website and sale details before signing up.", "Create your account|Your details stay in this browser while you sign up.", "Verify and publish|Verify your app’s domain to make the listing public. A price is optional."].map((item, index) => { const [title, description] = item.split("|"); return <div key={title} className="flex gap-4 rounded-2xl bg-slate-50 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 font-bold text-sky-700">{index + 1}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div></div>; })}
        </div>
      </section>
      <section ref={sellRef} aria-labelledby="sell-listing-title" className="mb-10 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 id="sell-listing-title" className="text-3xl font-bold">Sell my app</h2>
        <p className="mt-2 text-slate-600">Enter your app and sale details now. Sign up when you are ready to continue. An asking price is optional.</p>
        {user ? <>
          <label className="mt-6 block max-w-xl text-sm font-medium text-slate-700">Choose your Rocket app
            <select value={appId} onChange={(event) => selectApp(event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4">
              <option value="">Choose an app to sell</option>
              {apps.map((item) => <option key={item.app_id} value={item.app_id}>{item.app?.name || "Untitled app"} · {item.owner_verification_level === "domain_verified" ? "verified" : "claimed"}</option>)}
            </select>
          </label>
          <p className="mt-4 text-sm text-slate-600">App not here? <a href="/submit" className="font-semibold text-sky-700 hover:underline">Submit a new app</a> or <a href="/your-apps" className="font-semibold text-sky-700 hover:underline">claim an existing listing</a>.</p>
          {canManageListing ? <div onFocusCapture={markListingStarted}>
            {inputs.currency !== "USD" && <p className="mt-5 rounded-xl bg-sky-50 p-4 text-sm text-sky-900">Rocket Marketplace listings use USD. Enter a USD asking price below or leave it blank.</p>}
            <AcquisitionSettings key={`${appId}:${draftReady}`} appId={appId} suggestedPrice={suggestedAskingPrice} startForSale title="Listing details" initialDraft={draftMatchesSelected ? listingDraft : undefined} />
          </div> : appId ? <p className="mt-6 rounded-xl bg-sky-50 p-4 text-sm text-sky-900">Verify ownership of this app’s domain before publishing. <a href={`/my-apps/${encodeURIComponent(appId)}#verification`} className="font-semibold underline">Verify this app</a></p> : null}
        </> : null}
        {!canManageListing && <div className="mt-6 space-y-5" onFocusCapture={markListingStarted}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">App name<input maxLength={120} value={listingDraft.appName} onChange={(event) => updateListingDraft("appName", event.target.value)} placeholder="Your app name" className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base" /></label>
            <label className="text-sm font-medium text-slate-700">App website<input type="url" maxLength={500} value={listingDraft.appUrl} onChange={(event) => updateListingDraft("appUrl", event.target.value)} placeholder="https://example.com" className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base" /></label>
            <label className="text-sm font-medium text-slate-700">Acquisition status<select value={listingDraft.status} onChange={(event) => updateListingDraft("status", event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"><option value="for_sale">For sale</option><option value="open_to_offers">Open to offers</option></select></label>
            {listingDraft.status === "for_sale" && <label className="text-sm font-medium text-slate-700">Asking price (USD, optional)<input type="number" min="1" step="1" value={listingDraft.price} onChange={(event) => updateListingDraft("price", event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base" /></label>}
          </div>
          <label className="block text-sm font-medium text-slate-700">Short description<textarea maxLength={1000} rows={3} value={listingDraft.description} onChange={(event) => updateListingDraft("description", event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 p-4 text-base" /></label>
          <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Reason for selling (optional)<input maxLength={500} value={listingDraft.reason} onChange={(event) => updateListingDraft("reason", event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base" /></label><label className="text-sm font-medium text-slate-700">Preferred buyer (optional)<input maxLength={500} value={listingDraft.buyer} onChange={(event) => updateListingDraft("buyer", event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base" /></label></div>
          {listingError && <p role="alert" className="text-sm text-red-700">{listingError}</p>}
          <p className="text-sm text-slate-600">Your details stay in this browser until you sign up. Publishing requires domain verification.</p>
          <div className="flex flex-wrap gap-3">{user ? !appId && <a href="/submit" onClick={prepareAppSubmission} className="inline-flex min-h-12 items-center rounded-xl bg-sky-700 px-6 font-semibold text-white">Submit this app to Rocket</a> : <a href="/signup?next=%2Fsell" onClick={validateListingDraft} className="inline-flex min-h-12 items-center rounded-xl bg-sky-700 px-6 font-semibold text-white">Continue to sign up</a>}{!user && <a href="/login?next=%2Fsell" className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 bg-white px-6 font-semibold">Already have an account? Log in</a>}</div>
        </div>}
      </section>
      <section ref={formRef} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="calculator-title">
        <div><p className="text-xs font-bold uppercase tracking-widest text-sky-700">Sell My App calculator</p><h2 id="calculator-title" className="mt-2 text-3xl font-bold">Calculate your valuation</h2><p className="mt-2 text-slate-600">Use zero where you have no revenue yet. Optional fields improve context.</p></div>
        {appId && <p className="mt-5 text-sm text-slate-600">Calculating for {selected?.app?.name || "your selected app"}. <button type="button" onClick={() => sellRef.current?.scrollIntoView({ behavior: "smooth" })} className="font-semibold text-sky-700 hover:underline">Change app</button></p>}
        {appId && selected?.owner_verification_level === "domain_verified" && <div className="mt-4 space-y-3 text-sm"><div className="flex flex-wrap gap-3"><button type="button" disabled={!!importing} onClick={() => void importMetrics("stripe")} className="min-h-11 rounded-xl border border-sky-500 px-4 font-semibold text-sky-700 disabled:opacity-50">{importing === "stripe" ? "Importing…" : "Import verified Stripe revenue"}</button><button type="button" disabled={!!importing} onClick={() => void importMetrics("ga4")} className="min-h-11 rounded-xl border border-sky-500 px-4 font-semibold text-sky-700 disabled:opacity-50">{importing === "ga4" ? "Importing…" : "Import verified Google Analytics traffic"}</button></div><p className="text-slate-600">{evidence.stripe ? "Stripe revenue verified · " : ""}{evidence.ga4 ? `Google Analytics traffic verified for ${ga4Period} · ` : ""}Connected metrics stay private. Editing an imported metric removes its verified status until you import it again.</p></div>}
        <form onFocus={() => { if (!startedRef.current) { startedRef.current = true; track("valuation_started"); } }} onSubmit={calculate} className="mt-7"><div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">App name (optional)<input maxLength={120} value={inputs.appName || ""} onChange={(event) => setInputs({ ...inputs, appName: event.target.value })} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base" /></label>
          <label className="text-sm font-medium text-slate-700">App URL (optional)<input type="url" maxLength={500} value={inputs.appUrl || ""} onChange={(event) => setInputs({ ...inputs, appUrl: event.target.value })} placeholder="https://example.com" className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base" /></label>
          <label className="text-sm font-medium text-slate-700">Currency<select value={inputs.currency} onChange={(event) => { setInputs({ ...inputs, currency: event.target.value as ValuationInputs["currency"] }); setEvidence((current) => ({ ...current, stripe: false })); setResult(null); }} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"><option>USD</option><option>EUR</option><option>GBP</option></select></label>
          <label className="text-sm font-medium text-slate-700">Business model<select value={inputs.businessModel} onChange={(event) => { setInputs({ ...inputs, businessModel: event.target.value as ValuationInputs["businessModel"] }); setResult(null); }} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4">{BUSINESS_MODELS.map((model) => <option key={model} value={model}>{models[model]}</option>)}</select></label>
          {required.map(field)}
        </div><button type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} className="mt-7 text-sm font-semibold text-sky-700">{advanced ? "Hide" : "Show"} advanced inputs ↓</button>
          {advanced && <div className="mt-5 grid gap-5 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">{optional.map(field)}<label className="text-sm font-medium text-slate-700">Platform dependence<select value={inputs.platformDependence || ""} onChange={(event) => setInputs({ ...inputs, platformDependence: event.target.value as ValuationInputs["platformDependence"] || undefined })} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"><option value="">Not provided</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label className="text-sm font-medium text-slate-700">Operational complexity<select value={inputs.operationalComplexity || ""} onChange={(event) => setInputs({ ...inputs, operationalComplexity: event.target.value as ValuationInputs["operationalComplexity"] || undefined })} className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4"><option value="">Not provided</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div>}
          <div className="mt-8 flex flex-wrap items-center gap-4"><button type="submit" className="min-h-12 rounded-xl bg-sky-700 px-7 font-semibold text-white hover:bg-sky-800">Calculate my valuation</button><p className="text-sm text-slate-500">Calculator inputs stay in your browser. Submitting a sale listing is a separate step.</p></div>
        </form>
      </section>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{notice && <p role="status" className="mt-5 rounded-xl bg-sky-50 p-4 text-sky-800">{notice}</p>}
      {result && <section ref={resultsRef} className="mt-10 space-y-6" aria-label="Valuation results">
        <div className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-bold">Share your valuation</h2>
          <p className="mt-2 text-sm text-slate-600">Preview your Rocket card and share it with your network.</p>
          <button type="button" onClick={() => setShareOpen(true)} className="mt-5 min-h-11 rounded-xl bg-sky-700 px-5 font-semibold text-white">Open share card</button>
        </div>
        <Dialog open={shareOpen} onOpenChange={(open) => { setShareOpen(open); if (!open) setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 0); }}>
          <DialogContent motion="gentle" className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto bg-white p-5 text-slate-950 sm:p-8">
            <DialogHeader className="pr-8"><DialogTitle className="text-xl font-bold">Share your valuation</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">Preview a clean Rocket card. Your revenue and traffic inputs are never shown. Add an app name for the card, or enter an App URL to show its domain and public icon.</DialogDescription></DialogHeader>
          <div className="relative mt-6 flex aspect-[1200/630] w-full max-w-3xl flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-[5%]" style={{ containerType: "inline-size" }}>
            <div className="flex items-start justify-between gap-4"><img src="/rocket-email-logo.png" alt="Rocket" style={{ width: "21cqw" }} /><span className="rounded-full bg-sky-50 px-[2.2cqw] py-[1cqw] font-semibold text-sky-700" style={{ fontSize: "2cqw" }}>{shareBadge}</span></div>
            <div className="flex min-w-0 items-center gap-[2cqw]">{appIconSource && !iconBroken && <div className="flex h-[10cqw] w-[10cqw] shrink-0 items-center justify-center rounded-[2cqw] border border-slate-200 bg-slate-50 p-[1cqw]"><img crossOrigin="anonymous" referrerPolicy="no-referrer" src={appIconSource} alt={`${inputs.appName || "App"} icon`} onError={() => setIconBroken(true)} className="h-full w-full object-contain" /></div>}<div className="min-w-0"><h4 className="truncate font-bold leading-none tracking-tight text-slate-950" style={{ fontSize: "5cqw" }}>{shareDisplayName}</h4><p className="mt-[2cqw] font-semibold uppercase tracking-widest text-sky-700" style={{ fontSize: "2cqw" }}>Your app’s estimated value</p><p className="mt-[1cqw] truncate font-bold leading-none tracking-tight text-slate-950" style={{ fontSize: "7.3cqw" }}>{result.central !== null ? format(result.central, result.currency) : "Value unavailable"}</p></div></div>
            <div className="flex items-end justify-between gap-4 border-t border-slate-200 pt-[2cqw] text-slate-600" style={{ fontSize: "1.9cqw" }}><span>Illustrative estimate · Not an offer or appraisal</span><span className="shrink-0 font-semibold text-sky-700">tryrocket.ai/sell</span></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => void shareCard()} className="min-h-11 rounded-xl bg-sky-700 px-5 font-semibold text-white">Share image</button><button type="button" onClick={() => void download()} className="min-h-11 rounded-xl border border-slate-300 px-5 font-semibold text-slate-900">Download PNG</button><button type="button" onClick={() => share("x")} className="min-h-11 rounded-xl border border-slate-300 px-5 font-semibold text-slate-900">Post on X</button><button type="button" onClick={() => share("reddit")} className="min-h-11 rounded-xl border border-slate-300 px-5 font-semibold text-slate-900">Post on Reddit</button><button type="button" onClick={() => share("linkedin")} className="min-h-11 rounded-xl border border-slate-300 px-5 font-semibold text-slate-900">Post on LinkedIn</button></div>
          <p className="mt-3 text-xs text-slate-500">Social post buttons open a draft with the Rocket link. To include the card image, attach the downloaded PNG to your post.</p>
          </DialogContent>
        </Dialog>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm font-bold uppercase tracking-widest text-sky-700">Your app’s estimated value</p><img src="/rocket-email-logo.png" alt="Rocket" className="h-8 w-auto" /></div>
          {result.central !== null ? <><h2 className="mt-6 text-5xl font-bold tracking-tight text-slate-950 sm:text-7xl">{format(result.central, result.currency)}</h2><p className="mt-3 text-lg text-slate-600">Illustrative range: {format(result.low!, result.currency)} – {format(result.high!, result.currency)}</p><div className="mt-8 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-600">Low<br /><strong className="text-xl text-slate-950">{format(result.low!, result.currency)}</strong></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-600">Central<br /><strong className="text-xl text-slate-950">{format(result.central, result.currency)}</strong></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-600">High<br /><strong className="text-xl text-slate-950">{format(result.high!, result.currency)}</strong></div></div></> : <><h2 className="mt-6 text-3xl font-bold">More evidence needed</h2><p className="mt-3 max-w-2xl text-slate-600">A pre-revenue app can be valuable, but traffic alone cannot support a defensible sale-price estimate. Add profit or recurring revenue history as it develops.</p></>}
          <p className="mt-7 text-sm text-slate-600">Confidence: <strong className="capitalize">{result.confidence}</strong> · {result.basis === "annual_profit" ? "Annual profit" : result.basis === "annual_recurring_revenue" ? "Annual recurring revenue" : "Insufficient financial evidence"}{result.impliedMultiple !== null && ` · ${result.impliedMultiple.toFixed(2)}× basis`}</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border bg-white p-6"><h3 className="text-xl font-bold">Why this estimate?</h3><p className="mt-3 text-sm leading-6 text-slate-600">{result.methodology}</p><h4 className="mt-6 font-semibold">Key drivers</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">{(result.drivers.length ? result.drivers : ["No positive drivers were supplied yet."]).map((item) => <li key={item}>{item}</li>)}</ul><h4 className="mt-6 font-semibold">Principal risks</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">{result.risks.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div className="rounded-2xl border bg-white p-6"><h3 className="text-xl font-bold">Your inputs</h3><dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">MRR</dt><dd className="font-semibold">{format(inputs.mrr, inputs.currency)}</dd></div><div><dt className="text-slate-500">Monthly sessions</dt><dd className="font-semibold">{inputs.monthlyTraffic.toLocaleString()}</dd></div>{result.evidence.ga4 && monthlyActiveUsers !== null && <div><dt className="text-slate-500">Monthly active users</dt><dd className="font-semibold">{monthlyActiveUsers.toLocaleString()}</dd></div>}<div><dt className="text-slate-500">Revenue growth</dt><dd className="font-semibold">{inputs.monthlyRevenueGrowthPct}%</dd></div><div><dt className="text-slate-500">Operating history</dt><dd className="font-semibold">{inputs.ageMonths} months</dd></div>{inputs.monthlyProfit !== undefined && <div><dt className="text-slate-500">Monthly profit</dt><dd className="font-semibold">{format(inputs.monthlyProfit, inputs.currency)}</dd></div>}</dl><p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Data status: {result.evidence.stripe ? "MRR verified through Stripe. " : "Revenue manually entered. "}{result.evidence.ga4 ? `Sessions and traffic sources verified through Google Analytics${ga4Period ? ` (${ga4Period})` : ""}. ` : "Traffic manually entered. "}Other fields remain self-reported. This is an illustrative estimate.</p><h4 className="mt-6 font-semibold">How to strengthen the business</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">{result.suggestions.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
        <details className="rounded-2xl border bg-white p-6"><summary className="cursor-pointer font-semibold">Methodology and assumptions</summary><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">{result.assumptions.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-4 text-sm text-slate-600">This is an estimate, not a formal appraisal or guaranteed sale price. <a href="/valuation-methodology" className="text-sky-700 underline">Read the full methodology</a>.</p></details>
      </section>}
      <section className="mt-16 max-w-3xl"><h2 className="text-2xl font-bold">Common questions</h2><div className="mt-5 space-y-3">{[
        ["How much is my app worth?", "A sale price depends on actual profit, recurring revenue, transferability and buyer diligence. This calculator gives an illustrative range where there is sufficient financial evidence."],
        ["How are SaaS businesses valued?", "Small SaaS transactions often use a multiple of annual profit. Where profit is unknown, this calculator uses a cautious annual recurring revenue approach and lowers confidence."],
        ["Can I value an app without revenue?", "You can enter a pre-revenue app. We explain why traffic alone cannot support a defensible dollar estimate."],
        ["How accurate is the calculator?", "It is an estimate based on self-reported inputs, not an appraisal or offer. The range can change substantially after verification and due diligence."],
        ["Can I sell my app on Rocket?", "Yes. Domain-verified owners can publish a Marketplace listing. You can add an asking price or invite offers."],
      ].map(([question, answer]) => <details key={question} className="rounded-xl border bg-white p-5"><summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3 text-sm leading-6 text-slate-600">{answer}</p></details>)}</div></section>
    </main></div>;
}
