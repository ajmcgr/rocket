import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type App = Tables<"public_apps">;
type Source = Tables<"public_app_sources">;
const date = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Not available";

export default function PublicAppProfile() {
  const { id } = useParams();
  const [app, setApp] = useState<App | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
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
    ]).then(([appResult, sourceResult]) => {
      if (canceled) return;
      setApp(appResult.data);
      setSources(sourceResult.data || []);
      setError(Boolean(appResult.error || sourceResult.error || !appResult.data));
      setLoading(false);
    });
    return () => { canceled = true; };
  }, [id]);

  return <div className="min-h-screen bg-[#f6f8fb] text-neutral-900"><SiteHeader />
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <Link to="/discover" className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-sky-700"><ArrowLeft className="h-4 w-4" />Back to Discover</Link>
      {loading && <p className="mt-12 text-neutral-500">Loading app…</p>}
      {error && !loading && <div role="alert" className="mt-10 rounded-xl border border-neutral-200 bg-white p-8"><h1 className="text-2xl font-semibold">App not found</h1><p className="mt-2 text-neutral-600">This listing may no longer be public.</p></div>}
      {app && !loading && !error && <>
        <div className="mt-10 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8">
          <div className="flex items-start gap-5"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 text-2xl font-semibold text-neutral-500">{app.logo_url ? <img src={app.logo_url} alt="" className="h-full w-full object-contain" /> : app.name[0]}</div><div className="min-w-0"><h1 className="font-display text-3xl sm:text-4xl">{app.name}</h1><p className="mt-2 text-neutral-600">{app.tagline || app.canonical_host}</p></div></div>
          {app.description && <p className="mt-7 whitespace-pre-wrap text-neutral-700">{app.description}</p>}
          <a href={app.website_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-medium text-white hover:bg-sky-700">Visit website <ExternalLink className="h-4 w-4" /></a>
          <div className="mt-8 grid gap-5 border-t border-neutral-100 pt-6 text-sm sm:grid-cols-2"><div><span className="text-neutral-500">Launched</span><p className="mt-1 font-medium">{date(app.launched_at)}</p></div><div><span className="text-neutral-500">Discovered by Rocket</span><p className="mt-1 font-medium">{date(app.discovered_at)}</p></div><div><span className="text-neutral-500">Categories</span><p className="mt-1 font-medium">{app.categories.join(", ") || "Not specified"}</p></div><div><span className="text-neutral-500">Platforms</span><p className="mt-1 font-medium">{app.platforms.join(", ") || "Not specified"}</p></div></div>
          {app.tags.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{app.tags.map((tag) => <span key={tag} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">{tag}</span>)}</div>}
        </div>
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">Sources & verification</h2><p className="mt-2 text-sm text-neutral-600">{app.claim_state === "domain_verified" ? "The app's website domain has been verified by its Rocket claimant. Revenue and traffic are not verified." : app.claim_state === "claimed" ? "This app is claimed on Rocket. Domain control, revenue and traffic are not verified." : "This app is unclaimed on Rocket. Its listing is sourced from public records; Rocket has not verified ownership, revenue or traffic."}</p>
          {app.claim_state === "unclaimed" && <Link to={`/apps/add?app=${app.id}`} className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">Claim this app</Link>}
          <ul className="mt-5 space-y-3">{sources.map((source) => <li key={`${source.source_type}-${source.source_url}`} className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3 text-sm"><span className="capitalize">{source.source_type}</span><a href={source.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sky-700 hover:underline">View source <ExternalLink className="h-3 w-3" /></a></li>)}</ul></section>
        <section className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">Verified traction</h2><p className="mt-2 text-sm text-neutral-500">No verified revenue or traffic is available for this listing.</p></section>
      </>}
    </main><SiteFooter /></div>;
}
