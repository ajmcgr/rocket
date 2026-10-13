import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { shareCardUrl } from "@/lib/shareLinks";
import { monthLabel } from "@/lib/rocketRecap";
import { track } from "@/lib/analytics";
import { useEffect } from "react";

type PublicRecap = { id: string; username: string; avatar_url: string; profile_url: string; snapshot: { month: string; app: { slug: string; name: string } | null; metrics: Record<string, number> } };

export const Route = createFileRoute("/recap/s/$id")({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  loader: async ({ params }): Promise<PublicRecap | null> => {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(params.id)) return null;
    const { data, error } = await (supabase as any).rpc("get_public_rocket_recap", { p_id: params.id });
    return error ? null : data as PublicRecap | null;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Recap unavailable | Rocket" }, { name: "robots", content: "noindex, nofollow" }] };
    const recap = loaderData;
    const title = `${monthLabel(recap.snapshot.month)} Rocket Recap · @${recap.username}`;
    const description = Object.entries(recap.snapshot.metrics).map(([key, value]) => `${Number(value).toLocaleString()} ${key === "views" ? "recorded app visits" : "website clicks"}`).join(" · ");
    const url = `https://tryrocket.ai/recap/s/${recap.id}`;
    return { meta: [
      { title }, { name: "description", content: description },
      { property: "og:title", content: title }, { property: "og:description", content: description },
      { property: "og:url", content: url }, { property: "og:image", content: shareCardUrl("recap", recap.id) },
      { name: "twitter:card", content: "summary_large_image" },
    ], links: [{ rel: "canonical", href: url }] };
  },
  component: PublicRecapPage,
});

function PublicRecapPage() {
  const data = Route.useLoaderData();
  useEffect(() => { if (data) track("rocket_recap_public_visited", { id: data.id }); }, [data]);
  if (!data) return <main className="mx-auto max-w-2xl px-5 py-24"><h1 className="text-3xl font-bold">This recap is unavailable.</h1><p className="mt-3 text-neutral-600">The owner may have revoked its public link.</p><Link to="/" className="mt-6 inline-block font-semibold text-sky-700">Explore Rocket</Link></main>;
  const { snapshot } = data;
  return <main className="mx-auto max-w-4xl px-5 py-12 sm:py-20">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-600">Rocket Recap</p>
    <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-6xl">{monthLabel(snapshot.month)} on Rocket.</h1>
    <p className="mt-4 text-lg text-neutral-600">A month building in public with <Link to={data.profile_url} onClick={() => track("rocket_recap_profile_clicked", { id: data.id })} className="font-semibold text-sky-700">@{data.username}</Link>.</p>
    <section className="mt-10 rounded-3xl bg-[#0b1522] p-7 text-white sm:p-12">
      {snapshot.app && <p className="text-sm font-bold text-[#72c0ed]">{snapshot.app.name}</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{Object.entries(snapshot.metrics).map(([key, value]) => <div key={key} className="rounded-2xl border border-white/15 bg-white/5 p-6"><p className="text-5xl font-bold">{Number(value).toLocaleString()}</p><p className="mt-3 text-slate-300">{key === "views" ? "Recorded app visits" : "Recorded website clicks"}</p></div>)}</div>
    </section>
    <div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold text-sky-700">{snapshot.app && <Link to={`/apps/${snapshot.app.slug}`} onClick={() => track("rocket_recap_app_clicked", { id: data.id })}>Explore {snapshot.app.name}</Link>}<Link to={data.profile_url}>View @{data.username}</Link><Link to="/">Discover more on Rocket</Link></div>
  </main>;
}
