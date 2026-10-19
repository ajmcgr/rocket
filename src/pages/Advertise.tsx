import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { track } from "@/lib/analytics";

type AdType = "featured_app" | "category_sponsor";
type OwnedApp = { id: string; name: string; categories: string[] };
type Sponsorship = {
  id: string; sponsorship_type: AdType; target_app_id: string; target_category: string | null; homepage_slot_id: string | null; destination_url: string | null;
  amount_cents: number; paid_amount_cents: number | null; status: string; stripe_payment_status: string; stripe_livemode: boolean;
  scheduled_start_at: string; scheduled_end_at: string;
  actual_start_at: string | null; actual_end_at: string | null;
  views?: number | null; clicks?: number | null;
};
type Quote = { available: boolean; reason?: string; start?: string; end?: string; amount_cents?: number };
type ReservedCheckout = { url: string; sponsorship_id: string; homepage_slot_id: string | null; start: string; end: string; checkout_expires_at: string; destination: string };
const offers = {
  featured_app: {
    title: "Featured App", price: "$49", duration: "7 days", button: "Feature an app",
    description: "Rotate your app across homepage Featured App positions and eligible public Rocket pages for 7 days.",
    details: "Placement is shared with other advertisers, with an equal chance of selection on each rotation. Sponsorships are clearly labelled and do not affect organic rankings or Rocket Picks. Traffic and sales are not guaranteed.",
  },
  category_sponsor: {
    title: "Category Sponsor", price: "$299", duration: "30 days", button: "Sponsor a category",
    description: "Sponsor a Rocket category for 30 days and reach people actively exploring apps in your space.",
    details: "Shared rotation with other sponsors in your chosen category, with an equal chance of selection. Does not affect category rankings. Traffic and sales are not guaranteed.",
  },
} as const;
const formatDate = (date: string) => new Date(date).toLocaleString(undefined, {
  year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
function validWebsiteUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && Boolean(url.hostname.includes("."))
      && !url.username && !url.password && !url.port && value.length <= 2048
      && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value)
      && !host.startsWith(".") && !host.endsWith(".")
      && !/^(localhost|.*\.(localhost|local|internal|test|invalid))$/.test(host)
      && !/^\d+(?:\.\d+){3}$/.test(host) && !host.startsWith("[");
  } catch { return false; }
}
export default function Advertise() {
  const { user } = useAuth();
  const [apps, setApps] = useState<OwnedApp[]>([]);
  const [history, setHistory] = useState<Sponsorship[]>([]);
  const [ready, setReady] = useState<Record<AdType, boolean>>({ featured_app: false, category_sponsor: false });
  const [type, setType] = useState<AdType | null>(null);
  const [appId, setAppId] = useState("");
  const [category, setCategory] = useState("");
  const [destinationMode, setDestinationMode] = useState<"app" | "website">("app");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [reservedCheckout, setReservedCheckout] = useState<ReservedCheckout | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useDocumentMeta({
    title: "Advertise on Rocket",
    description: "Put your app in front of developers and people discovering what to use next.",
    canonical: "https://tryrocket.ai/advertise",
  });

  useEffect(() => {
    track("advertise_page_viewed");
    void supabase.functions.invoke("rocket-advertising", { body: { action: "catalog" } })
      .then(({ data, error }) => {
        if (!error && data?.products) {
          setReady(Object.fromEntries(data.products.map((product: { type: AdType; ready: boolean }) =>
            [product.type, product.ready])) as Record<AdType, boolean>);
        }
      });

  }, []);
  useEffect(() => {
    if (!user) { setApps([]); setHistory([]); return; }
    void supabase.functions.invoke("rocket-advertising", { body: { action: "mine" } })
      .then(({ data, error }) => {
        if (error) { setError("Advertising details are temporarily unavailable."); return; }
        setApps(data?.apps || []);
        setHistory(data?.sponsorships || []);
      });
  }, [user]);
  useEffect(() => {
    setQuote(null);
    setReservedCheckout(null);
    if (!user || !type || !appId || (type === "category_sponsor" && !category)) return;
    let active = true;
    void supabase.functions.invoke("rocket-advertising", {
      body: { action: "quote", type, app_id: appId, category: type === "category_sponsor" ? category : null,
        mode: "live" },
    }).then(({ data, error }) => {
      if (active) setQuote(error ? { available: false, reason: "Availability could not be checked" } : data?.quote || null);
    });
    return () => { active = false; };
  }, [user, type, appId, category]);
  const selectedApp = apps.find((app) => app.id === appId);
  const selectOffer = (next: AdType) => {
    setType(next); setAppId(""); setCategory(""); setDestinationMode("app"); setWebsiteUrl("");
    setError(""); setReservedCheckout(null);
    track(next === "featured_app" ? "featured_app_selected" : "category_sponsor_selected");
  };
  const checkout = async () => {
    if (!type || !appId || !quote?.available || pending
      || (destinationMode === "website" && !validWebsiteUrl(websiteUrl))) return;
    setPending(true); setError("");
    try {
      const { data, error: requestError } = await supabase.functions.invoke("rocket-advertising", {
        body: { action: "checkout", type, app_id: appId, category: type === "category_sponsor" ? category : null,
          destination_url: destinationMode === "website" ? websiteUrl : null, mode: "live" },
      });
      if (requestError || !data?.url || !/^https:\/\/checkout\.stripe\.com\//.test(data.url)
        || !data.start || !data.end || !data.checkout_expires_at)
        throw new Error("Checkout is unavailable. No payment was made.");
      setReservedCheckout({ url: data.url, sponsorship_id: data.sponsorship_id,
        homepage_slot_id: data.homepage_slot_id || null, start: data.start, end: data.end,
        checkout_expires_at: data.checkout_expires_at,
        destination: destinationMode === "website" ? websiteUrl : `Rocket app page · ${selectedApp?.name || "App"}` });
      setPending(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout is unavailable. No payment was made.");
      setPending(false);
    }
  };

  return <div className="marketplace-page min-h-screen bg-[#f6f8fb] text-neutral-950">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Advertise on Rocket</h1>
      <p className="mt-3 max-w-2xl text-lg text-neutral-600">Put your app in front of developers and people discovering what to use next.</p>
      <div className="mt-9 grid gap-5 md:grid-cols-2">
        {(Object.keys(offers) as AdType[]).map((key) => <article key={key} className="rounded-3xl border border-neutral-200 bg-white p-7 shadow-sm sm:p-9">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">{offers[key].duration} · one-time</p>
          <h2 className="mt-3 text-2xl font-bold">{offers[key].title}</h2>
          <p className="mt-2 text-4xl font-bold">{offers[key].price}<span className="ml-2 text-base font-medium text-neutral-500">USD</span></p>
          <p className="mt-5 text-neutral-700">{offers[key].description}</p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-500">{offers[key].details}</p>
          {user ? <button className="mt-7 min-h-11 rounded-xl bg-[#167ac6] px-5 font-semibold text-white hover:bg-[#1268aa] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => selectOffer(key)} disabled={!ready[key]}>
              {ready[key] ? offers[key].button : "Booking unavailable"}</button>
            : <Link to="/login" className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-[#167ac6] px-5 font-semibold text-white hover:bg-[#1268aa]">Sign in to {key === "featured_app" ? "feature an app" : "sponsor a category"}</Link>}
        </article>)}
      </div>
      {user && type && <section className="mt-8 rounded-3xl border border-neutral-200 bg-white p-7 sm:p-9" aria-labelledby="booking-title">
        <h2 id="booking-title" className="text-2xl font-bold">Book {offers[type].title}</h2>
        {apps.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Your eligible app
            <select value={appId} onChange={(event) => { setAppId(event.target.value); setCategory(""); setReservedCheckout(null); }} className="mt-2 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3">
              <option value="">Select an app</option>{apps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
            </select>
          </label>
          {type === "category_sponsor" && <label className="text-sm font-semibold">Category
            <select value={category} onChange={(event) => { setCategory(event.target.value); setReservedCheckout(null); }} className="mt-2 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3">
              <option value="">Select a category</option>{(selectedApp?.categories || []).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>}
        </div> : <p className="mt-4 text-neutral-600">Add and claim an eligible app before booking. <Link className="font-semibold text-sky-700 underline" to="/submit">Submit my app</Link></p>}
        {appId && <fieldset className="mt-5">
          <legend className="text-sm font-semibold">Where should the ad link?</legend>
          <div className="mt-2 flex flex-wrap gap-5 text-sm">
            <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="ad-destination" checked={destinationMode === "app"}
              onChange={() => { setDestinationMode("app"); setReservedCheckout(null); }} />Rocket app page</label>
            <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="ad-destination" checked={destinationMode === "website"}
              onChange={() => { setDestinationMode("website"); setReservedCheckout(null); }} />Website URL</label>
          </div>
          {destinationMode === "website" && <label className="mt-4 block max-w-xl text-sm font-semibold">Destination URL
            <input type="url" inputMode="url" maxLength={2048} value={websiteUrl}
              onChange={(event) => { setWebsiteUrl(event.target.value); setReservedCheckout(null); }}
              placeholder="https://your-app.com" aria-invalid={Boolean(websiteUrl && !validWebsiteUrl(websiteUrl))}
              className="mt-2 min-h-11 w-full rounded-lg border border-neutral-300 px-3" />
            <span className="mt-1 block font-normal text-neutral-500">Use a public HTTPS page you control. Your Rocket app remains the sponsored app.</span>
          </label>}
        </fieldset>}
        {quote && !quote.available && <p className="mt-5 text-amber-800">{quote.reason || "This slot is temporarily unavailable."}</p>}
        {quote?.available && quote.start && quote.end && <div className="mt-6 rounded-xl bg-sky-50 p-5 text-sm text-neutral-800">
          <p><strong>Placement:</strong> {type === "featured_app" ? "Shared rotation on the homepage and eligible public pages" : `Shared sponsor rotation in ${category}`}</p>
          <p className="mt-1"><strong>App:</strong> {selectedApp?.name}</p>
          <p className="mt-1"><strong>Ad destination:</strong> {destinationMode === "website" ? websiteUrl || "Enter a website URL" : "Rocket app page"}</p>
          <p className="mt-1"><strong>Starts:</strong> {formatDate(quote.start)}</p>
          <p className="mt-1"><strong>Ends:</strong> {formatDate(quote.end)}</p>
          <p className="mt-1"><strong>Due:</strong> {offers[type].price} USD, one-time</p>
          <p className="mt-3 text-neutral-600">Availability and dates are confirmed again at checkout. The placement starts only after verified payment.</p>
          {!reservedCheckout && <button onClick={checkout} disabled={pending || !ready[type] || (destinationMode === "website" && !validWebsiteUrl(websiteUrl))} className="mt-4 min-h-11 rounded-xl bg-[#167ac6] px-5 font-semibold text-white disabled:opacity-50">{pending ? "Reserving…" : `Reserve and review · ${offers[type].price}`}</button>}
        </div>}
        {reservedCheckout && <div className="mt-5 rounded-xl border border-sky-200 bg-white p-5 text-sm">
          <p className="font-semibold">Final booking review</p>
          <p className="mt-2">{selectedApp?.name} · {type === "featured_app" ? "Shared homepage Featured App rotation and eligible public pages" : `Shared sponsor rotation in ${category}`}</p>
          <p className="mt-1">Ad destination: {reservedCheckout.destination}</p>
          <p className="mt-1">{formatDate(reservedCheckout.start)} – {formatDate(reservedCheckout.end)}</p>
          <p className="mt-1">{offers[type].price} USD, one-time. Stripe checkout expires {formatDate(reservedCheckout.checkout_expires_at)}.</p>
          <button onClick={() => { track("sponsorship_checkout_started", { sponsorship_type: type,
            sponsorship_id: reservedCheckout.sponsorship_id, slot_id: reservedCheckout.homepage_slot_id,
            placement_type: type === "featured_app" ? "homepage" : "category",
            occurred_at: new Date().toISOString() }); window.location.assign(reservedCheckout.url); }}
            className="mt-4 min-h-11 rounded-xl bg-[#167ac6] px-5 font-semibold text-white">Open Stripe Checkout</button>
        </div>}
        {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      </section>}
      {user && <section className="mt-10" aria-labelledby="my-advertising">
        <h2 id="my-advertising" className="text-2xl font-bold">My Advertising</h2>
        {history.length ? <div className="mt-4 grid gap-3">{history.map((item) => {
          const app = apps.find((owned) => owned.id === item.target_app_id);
          return <div key={item.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{offers[item.sponsorship_type].title} · {app?.name || "App"}{item.target_category ? ` · ${item.target_category}` : ""}</h3><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold capitalize">{item.status}</span></div>
            <p className="mt-2 text-sm text-neutral-600">${((item.paid_amount_cents ?? item.amount_cents) / 100).toFixed(2)} USD · {item.stripe_payment_status}</p>
            <p className="mt-1 text-sm text-neutral-600">{formatDate(item.actual_start_at || item.scheduled_start_at)} – {formatDate(item.actual_end_at || item.scheduled_end_at)}</p>
            <p className="mt-1 break-all text-sm text-neutral-600">Ad destination: {item.destination_url || "Rocket app page"}</p>
            {item.stripe_payment_status === "paid" && <div className="mt-4 flex flex-wrap gap-6 border-t border-neutral-100 pt-4" aria-label="Sponsored placement performance">
              {item.views === null || item.clicks === null
                ? <p className="text-sm text-neutral-500">Performance is temporarily unavailable.</p>
                : <><p className="text-sm text-neutral-600"><span className="block text-xl font-bold text-neutral-950">{(item.views ?? 0).toLocaleString()}</span>Placement views</p>
                  <p className="text-sm text-neutral-600"><span className="block text-xl font-bold text-neutral-950">{(item.clicks ?? 0).toLocaleString()}</span>Ad clicks</p></>}
            </div>}
            {app && <Link to={`/apps/${item.target_app_id}`} className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:underline">View app</Link>}
          </div>;
        })}</div> : <p className="mt-3 text-neutral-600">No advertising purchases yet.</p>}
        {history.some((item) => item.stripe_payment_status === "paid") && <p className="mt-3 text-xs text-neutral-500">Views count when a sponsored placement is at least half visible. Totals are daily-deduplicated estimates; activity before reporting began is not included.</p>}
      </section>}
    </main>
  </div>;
}
