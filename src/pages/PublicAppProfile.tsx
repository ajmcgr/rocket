import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import SaveAppButton from "@/components/SaveAppButton";
import { signalExplanation, signalLabel, type AppSignal } from "@/lib/appIntelligence";

type App = Tables<"public_apps">;
type Source = Tables<"public_app_sources">;
type Traction = Tables<"public_app_traction">;
type Revenue = Tables<"public_app_revenue">;
const date = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Not available";
const revenueMoney = (minor: number, currency: string) => {
  try {
    const format = new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() });
    return format.format(minor / 10 ** format.resolvedOptions().maximumFractionDigits);
  } catch { return `${minor} ${currency.toUpperCase()} minor units`; }
};

export default function PublicAppProfile() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const saveAfterAuth = searchParams.get("save") === "1";
  const { user } = useAuth();
  const [app, setApp] = useState<App | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [traction, setTraction] = useState<Traction[]>([]);
  const [revenue, setRevenue] = useState<Revenue[]>([]);
  const [signals, setSignals] = useState<AppSignal[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useDocumentMeta({ title: app ? `${app.name} | Rocket Discover` : "App profile | Rocket", description: app?.tagline || "Explore a public app listed on Rocket.", canonical: id ? `https://tryrocket.ai/apps/${id}` : undefined });

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { setLoading(false); setError(true); return; }
    Promise.all([
      supabase.from("public_apps").select("*").eq("id", id).maybeSingle(),
      supabase.from("public_app_sources").select("*").eq("app_id", id),
      supabase.from("public_app_traction").select("*").eq("app_id", id),
      supabase.from("public_app_revenue").select("*").eq("app_id", id),
      supabase.from("public_app_intelligence").select("*").eq("app_id", id),
    ]).then(([appResult, sourceResult, tractionResult, revenueResult, signalResult]) => {
      if (canceled) return;
      setApp(appResult.data);
      setSources(sourceResult.data || []);
      setTraction(tractionResult.data || []);
      setRevenue(revenueResult.data || []);
      setSignals(signalResult.data || []);
      setError(Boolean(appResult.error || sourceResult.error || tractionResult.error || revenueResult.error || signalResult.error || !appResult.data));
      setLoading(false);
    });
    return () => { canceled = true; };
  }, [id]);

  useEffect(() => {
    if (!id || !user) { setSaved(false); return; }
    let canceled = false;
    const run = async () => {
      if (saveAfterAuth) {
        const result = await supabase.from("saved_apps").insert({ user_id: user.id, app_id: id });
        if (!canceled && (!result.error || result.error.code === "23505")) setSaved(true);
        if (!canceled) setSearchParams({}, { replace: true });
      } else {
        const { data } = await supabase.from("saved_apps").select("app_id").eq("user_id", user.id).eq("app_id", id).maybeSingle();
        if (!canceled) setSaved(Boolean(data));
      }
    };
    run();
    return () => { canceled = true; };
  }, [id, user, saveAfterAuth, setSearchParams]);

  return <div className="min-h-screen bg-[#f6f8fb] text-neutral-900"><SiteHeader />
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <Link to="/discover" className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-sky-700"><ArrowLeft className="h-4 w-4" />Back to Discover</Link>
      {loading && <p className="mt-12 text-neutral-500">Loading app…</p>}
      {error && !loading && <div role="alert" className="mt-10 rounded-xl border border-neutral-200 bg-white p-8"><h1 className="text-2xl font-semibold">App not found</h1><p className="mt-2 text-neutral-600">This listing may no longer be public.</p></div>}
      {app && !loading && !error && <>
        <div className="mt-10 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8">
          <div className="flex items-start gap-5"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 text-2xl font-semibold text-neutral-500">{app.logo_url ? <img src={app.logo_url} alt="" className="h-full w-full object-contain" /> : app.name[0]}</div><div className="min-w-0 flex-1"><h1 className="font-display text-3xl sm:text-4xl">{app.name}</h1><p className="mt-2 text-neutral-600">{app.tagline || app.canonical_host}</p></div><SaveAppButton appId={app.id} saved={saved} onChange={setSaved} /></div>
          {app.description && <p className="mt-7 whitespace-pre-wrap text-neutral-700">{app.description}</p>}
          <a href={app.website_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-medium text-white hover:bg-sky-700">Visit website <ExternalLink className="h-4 w-4" /></a>
          <div className="mt-8 grid gap-5 border-t border-neutral-100 pt-6 text-sm sm:grid-cols-2"><div><span className="text-neutral-500">Launched</span><p className="mt-1 font-medium">{date(app.launched_at)}</p></div><div><span className="text-neutral-500">Discovered by Rocket</span><p className="mt-1 font-medium">{date(app.discovered_at)}</p></div><div><span className="text-neutral-500">Categories</span><p className="mt-1 font-medium">{app.categories.join(", ") || "Not specified"}</p></div><div><span className="text-neutral-500">Platforms</span><p className="mt-1 font-medium">{app.platforms.join(", ") || "Not specified"}</p></div></div>
          {app.tags.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{app.tags.map((tag) => <span key={tag} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">{tag}</span>)}</div>}
        </div>
        {signals.length > 0 && <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">Why it’s interesting</h2><div className="mt-4 space-y-4">{signals.map((signal) => <div key={signal.signal_type}><p className="font-medium text-sky-700">{signalLabel(signal)}</p><p className="mt-1 text-sm text-neutral-700">{signalExplanation(signal)}</p><p className="mt-1 text-xs text-neutral-500">Evidence: public Launch votes · Observed {date(signal.source_updated_at)} · Calculated {date(signal.calculated_at)}</p></div>)}</div><p className="mt-4 text-xs text-neutral-500">Launch engagement is not verified traffic, revenue, or market demand.</p></section>}
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">Sources & verification</h2><p className="mt-2 text-sm text-neutral-600">{app.claim_state === "domain_verified" ? `The app's website domain has been verified by its Rocket claimant.${revenue.length ? " Revenue verified by Stripe." : " Revenue is not publicly verified."}${traction.length ? " Traffic verified by Google Analytics." : " Traffic is not publicly verified."}` : app.claim_state === "claimed" ? "This app is claimed on Rocket. Domain control, revenue and traffic are not verified." : "This app is unclaimed on Rocket. Its listing is sourced from public records; Rocket has not verified ownership, revenue or traffic."}</p>
          {app.claim_state === "unclaimed" && <Link to={`/apps/add?app=${app.id}`} className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">Claim this app</Link>}
          <ul className="mt-5 space-y-3">{sources.map((source) => <li key={`${source.source_type}-${source.source_url}`} className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3 text-sm"><span className="capitalize">{source.source_type}</span><a href={source.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sky-700 hover:underline">View source <ExternalLink className="h-3 w-3" /></a></li>)}</ul></section>
        {traction.length > 0 && <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">Traffic</h2><div className="mt-4 grid gap-4 sm:grid-cols-3">{traction.map((point) => <div key={point.metric_type} className="rounded-xl border p-4"><p className="text-sm text-neutral-500">{{ active_users: "Active users", sessions: "Sessions", views: "Views" }[point.metric_type] || point.metric_type} · {point.metric_date}</p><p className="mt-2 text-xl font-semibold">{point.visibility === "verified_only" ? "Traffic verified" : point.visibility === "range" ? point.value_range : point.value?.toLocaleString()}</p><p className="mt-2 text-xs text-neutral-500">Verified by Google Analytics · Updated {new Date(point.last_verified_at).toLocaleString()}</p></div>)}</div></section>}
        {revenue.length > 0 && <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">Subscription revenue</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{revenue.map((point) => <div key={point.currency} className="rounded-xl border p-4"><p className="text-sm text-neutral-500">Subscription MRR · {point.currency.toUpperCase()}</p>
          <p className="mt-2 text-xl font-semibold">{point.visibility === "verified_only" ? "Revenue verified by Stripe"
            : point.visibility === "range" && point.range_lower_minor !== null
              ? `${revenueMoney(point.range_lower_minor, point.currency)}${point.range_upper_minor === null ? "+" : `–${revenueMoney(point.range_upper_minor, point.currency)}`}`
              : point.mrr_minor !== null ? revenueMoney(point.mrr_minor, point.currency) : "Revenue verified by Stripe"}</p>
          <p className="mt-2 text-xs text-neutral-500">Verified by Stripe · Snapshot {new Date(point.observed_at).toLocaleString()}</p></div>)}</div></section>}
      </>}
    </main><SiteFooter /></div>;
}
