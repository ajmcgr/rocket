import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppJourney, { type MyApp } from "@/components/AppJourney";

export default function MyApps() {
  const [items, setItems] = useState<MyApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceFor, setSourceFor] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    supabase.functions.invoke("rocket-apps", { body: { action: "my_apps" } })
      .then(({ data, error }) => { if (error || !Array.isArray(data)) throw error || new Error("My Apps unavailable"); setItems(data); })
      .catch((cause) => setError((cause as Error).message))
      .finally(() => setLoading(false));
  }, []);
  return <main className="mx-auto max-w-4xl px-6 py-10 text-neutral-900">
    <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">For founders</p><h1 className="mt-2 font-display text-4xl">Your Apps</h1></div><Link to="/launch" className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white">Launch an app</Link></div>
    {loading && <p className="mt-8 text-sm text-neutral-500">Loading your apps…</p>}
    {error && <p role="alert" className="mt-8 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-5 text-sm text-green-700">{notice}</p>}
    {!loading && !error && !items.length && <div className="mt-8 rounded-2xl border bg-white p-8"><p>No apps here yet. Add yours to claim its listing and show visitors what you have built.</p><Link to="/launch" className="mt-3 inline-block font-medium text-sky-700">Launch your first app</Link></div>}
    <div className="mt-7 space-y-3">{items.map((item) => <div key={item.id} className="rounded-xl border bg-white p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">{item.app?.name || "App under review"}</h2><p className="text-sm text-neutral-500">{item.app?.website_url || "Private submission"}</p></div>
      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs">{item.owned ? item.owner_verification_level === "domain_verified" ? "Domain verified" : "Claimed" : item.status === "review" ? "Review pending" : "Claim pending"}</span></div>
      <div className="mt-3 flex gap-4 text-sm"><Link to={`/launch?app=${item.app_id}`} className="text-sky-700">Manage claim</Link>{item.app && <Link to={`/apps/${item.app_id}`} className="text-sky-700">View public profile</Link>}</div>
      <AppJourney item={item} />
      {item.owned && <div className="mt-4 text-sm"><button onClick={() => { setSourceFor(sourceFor === item.app_id ? null : item.app_id); setError(""); }} className="text-neutral-500 hover:text-sky-700">{sourceFor === item.app_id ? "Hide source options" : "More options · Add public source"}</button>
        {sourceFor === item.app_id && <form className="mt-3 flex gap-2" onSubmit={async (event) => {
          event.preventDefault(); setError(""); setNotice("");
          const { data, error: requestError } = await supabase.functions.invoke("rocket-apps", { body: { action: "add_source", app_id: item.app_id, url: sourceUrl } });
          if (requestError || data?.error) setError(data?.error || requestError?.message || "Could not attach source");
          else { setNotice(data?.outcome === "already_attached" ? "Source already attached." : "Source attached to your app."); setSourceFor(null); setSourceUrl(""); }
        }}><input type="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://public-source-url" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button className="rounded-lg bg-neutral-900 px-3 py-2 text-white">Add</button></form>}</div>}
    </div>)}</div>
    <p className="mt-8 text-sm text-neutral-500">Invited to the Rocket Connect test program? <Link to="/developer" className="font-medium text-sky-700 hover:underline">Open the Developer portal</Link>.</p>
  </main>;
}
