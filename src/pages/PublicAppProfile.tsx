import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "@/lib/router-compat";
import { ArrowLeft, ExternalLink } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import SaveAppButton from "@/components/SaveAppButton";
import { signalExplanation, signalLabel, type AppSignal } from "@/lib/appIntelligence";
import AppTrustBadges from "@/components/AppTrustBadges";
import AppLogo from "@/components/AppLogo";
import type { AppTrust } from "@/lib/appTrust";
import { trustLabels } from "@/lib/appTrust";
import { track } from "@/lib/analytics";

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
const descriptionSummary = (description: string) => {
  const firstParagraph = description.trim().split(/\n\s*\n/)[0];
  return firstParagraph.length > 360 ? `${firstParagraph.slice(0, 360).replace(/\s+\S*$/, "")}…` : firstParagraph;
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
  const [trust, setTrust] = useState<AppTrust | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useDocumentMeta({ title: app ? `${app.name} | Rocket Discover` : "App profile | Rocket",
    description: app?.tagline || (app?.description ? descriptionSummary(app.description).slice(0, 180) : "Explore a public app listed on Rocket."),
    canonical: id ? `https://tryrocket.ai/apps/${id}` : undefined,
    image: app?.logo_url && /^https:\/\//i.test(app.logo_url) ? app.logo_url : undefined });

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
      supabase.from("public_app_trust").select("*").eq("app_id", id).maybeSingle(),
    ]).then(([appResult, sourceResult, tractionResult, revenueResult, signalResult, trustResult]) => {
      if (canceled) return;
      setApp(appResult.data);
      setSources(sourceResult.data || []);
      setTraction(tractionResult.data || []);
      setRevenue(revenueResult.data || []);
      setSignals(signalResult.data || []);
      setTrust(trustResult.data);
      setError(Boolean(appResult.error || sourceResult.error || tractionResult.error || revenueResult.error || signalResult.error || !appResult.data));
      if (appResult.data && !appResult.error) track("app_profile_viewed", { app_id: appResult.data.id });
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
        if (!canceled && (!result.error || result.error.code === "23505")) {
          setSaved(true);
          if (!result.error) track("app_saved", { app_id: id, after_auth: true });
        }
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
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <Link to="/discover" className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-sky-700"><ArrowLeft className="h-4 w-4" />Back to Discover</Link>
      {loading && <div className="mt-8 animate-pulse rounded-2xl border border-neutral-200 bg-white p-6 sm:p-9" aria-label="Loading app profile"><div className="flex gap-5"><div className="h-16 w-16 rounded-2xl bg-neutral-100" /><div className="flex-1 space-y-3"><div className="h-8 w-1/2 rounded bg-neutral-100" /><div className="h-4 w-2/3 rounded bg-neutral-100" /></div></div><div className="mt-8 h-12 w-40 rounded-xl bg-neutral-100" /></div>}
      {error && !loading && <div role="alert" className="mt-10 rounded-xl border border-neutral-200 bg-white p-8"><h1 className="text-2xl font-semibold">App not found</h1><p className="mt-2 text-neutral-600">This listing may no longer be public.</p></div>}
      {app && !loading && !error && <>
        <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-9">
          <div className="flex items-start gap-4 sm:gap-5"><AppLogo name={app.name} src={app.logo_url} className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" eager /><div className="min-w-0 flex-1"><h1 className="font-display text-3xl leading-tight sm:text-4xl">{app.name}</h1><p className="mt-2 max-w-2xl text-neutral-600">{app.tagline || (app.description ? descriptionSummary(app.description) : app.canonical_host)}</p></div></div>
          <div className="mt-7 flex flex-wrap items-center gap-3"><a href={app.website_url} target="_blank" rel="noopener noreferrer nofollow" onClick={() => track("outbound_app_clicked", { app_id: app.id })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">Visit website <ExternalLink className="h-4 w-4" /></a><SaveAppButton appId={app.id} saved={saved} onChange={setSaved} /><span className="w-full text-sm text-neutral-500 sm:w-auto">{app.canonical_host}</span></div>
        </div>
        {signals.length > 0 && <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">Why it’s interesting</h2><div className="mt-4 space-y-4">{signals.map((signal) => <div key={signal.signal_type}><p className="font-medium text-sky-700">{signalLabel(signal)}</p><p className="mt-1 text-sm text-neutral-700">{signalExplanation(signal)}</p></div>)}</div><p className="mt-4 text-xs text-neutral-500">Public Launch activity is not verified traffic, revenue, or a Rocket recommendation.</p></section>}
        {trustLabels(trust).length > 0 && <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">Trust</h2>
          <div className="mt-4"><AppTrustBadges trust={trust} /></div>
          {trust?.domain_verified ? <p className="mt-3 text-sm text-neutral-600">The developer proved control of this app’s website domain.</p>
            : trust?.claimed ? <p className="mt-3 text-sm text-neutral-600">A developer has claimed this app; domain control has not been verified.</p> : null}
        </section>}
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">About</h2>{app.description && <><p className="mt-4 max-w-3xl whitespace-pre-wrap text-neutral-700">{descriptionSummary(app.description)}</p>{descriptionSummary(app.description) !== app.description.trim() && <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-sky-700">Read full description</summary><p className="mt-3 whitespace-pre-wrap text-neutral-700">{app.description}</p></details>}</>}<dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2"><div><dt className="text-neutral-500">Category</dt><dd className="mt-1 font-medium">{app.categories.join(", ") || "Not specified"}</dd></div><div><dt className="text-neutral-500">Available on</dt><dd className="mt-1 font-medium">{app.platforms.join(", ") || "Not specified"}</dd></div>{app.launched_at && <div><dt className="text-neutral-500">Launched</dt><dd className="mt-1 font-medium">{date(app.launched_at)}</dd></div>}</dl>{app.tags.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{app.tags.map((tag) => <span key={tag} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">{tag}</span>)}</div>}{!trust?.claimed && app.claim_state === "unclaimed" && <Link to={`/launch?app=${app.id}`} className="mt-6 inline-block text-sm font-semibold text-sky-700 hover:underline">Is this your app? Claim it</Link>}</section>
        {traction.length > 0 && <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">Traffic</h2><div className="mt-4 grid gap-4 sm:grid-cols-3">{traction.map((point) => <div key={point.metric_type} className="rounded-xl border p-4"><p className="text-sm text-neutral-500">{{ active_users: "Active users", sessions: "Sessions", views: "Views" }[point.metric_type] || point.metric_type} · {point.metric_date}</p><p className="mt-2 text-xl font-semibold">{point.visibility === "verified_only" ? "Traffic verified" : point.visibility === "range" ? point.value_range : point.value?.toLocaleString()}</p><p className="mt-2 text-xs text-neutral-500">Verified by Google Analytics · Updated {new Date(point.last_verified_at).toLocaleString()}</p></div>)}</div></section>}
        {revenue.length > 0 && <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">Subscription revenue</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{revenue.map((point) => <div key={point.currency} className="rounded-xl border p-4"><p className="text-sm text-neutral-500">Subscription MRR · {point.currency.toUpperCase()}</p>
          <p className="mt-2 text-xl font-semibold">{point.visibility === "verified_only" ? "Revenue verified by Stripe"
            : point.visibility === "range" && point.range_lower_minor !== null
              ? `${revenueMoney(point.range_lower_minor, point.currency)}${point.range_upper_minor === null ? "+" : `–${revenueMoney(point.range_upper_minor, point.currency)}`}`
              : point.mrr_minor !== null ? revenueMoney(point.mrr_minor, point.currency) : "Revenue verified by Stripe"}</p>
          <p className="mt-2 text-xs text-neutral-500">Verified by Stripe · Snapshot {new Date(point.observed_at).toLocaleString()}</p></div>)}</div></section>}
        {sources.length > 0 && <details className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><summary className="cursor-pointer text-lg font-semibold">How we know</summary><p className="mt-3 text-sm text-neutral-600">Rocket lists this app from public sources. A listing is not an endorsement.</p><ul className="mt-4 space-y-3">{sources.map((source) => <li key={`${source.source_type}-${source.source_url}`} className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3 text-sm"><span className="capitalize">{source.source_type}</span><a href={source.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sky-700 hover:underline">View source <ExternalLink className="h-3 w-3" /></a></li>)}</ul></details>}
      </>}
    </main><SiteFooter /></div>;
}
