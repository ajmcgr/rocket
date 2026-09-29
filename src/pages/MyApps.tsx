import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type MyApp = { id: string; app_id: string; status: string; verification_state: string;
  app: { name?: string; website_url?: string; logo_url?: string | null; claim_state?: string } | null };

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
    <div className="flex items-center justify-between"><h1 className="font-display text-3xl">My Apps</h1><Link to="/apps/add" className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white">Add app</Link></div>
    {loading && <p className="mt-8 text-sm text-neutral-500">Loading your apps…</p>}
    {error && <p role="alert" className="mt-8 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-5 text-sm text-green-700">{notice}</p>}
    {!loading && !error && !items.length && <div className="mt-8 rounded-2xl border bg-white p-8"><p>No apps claimed yet.</p><Link to="/apps/add" className="mt-3 inline-block text-sky-700">Add your first app</Link></div>}
    <div className="mt-7 space-y-3">{items.map((item) => <div key={item.id} className="rounded-xl border bg-white p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">{item.app?.name || "App under review"}</h2><p className="text-sm text-neutral-500">{item.app?.website_url || "Private submission"}</p></div>
      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs">{item.verification_state === "domain_verified" ? "Domain verified" : item.status === "review" ? "Review pending" : "Verification required"}</span></div>
      <p className="mt-3 text-xs text-neutral-500">{item.app?.claim_state === "unclaimed" ? "Public listing · unclaimed" : item.status === "verified" ? "Public listing · claimed" : "Claim pending"}</p>
      <div className="mt-3 flex gap-4 text-sm"><Link to={`/apps/add?app=${item.app_id}`} className="text-sky-700">Manage claim</Link>{item.status === "verified" && <Link to={`/apps/${item.app_id}`} className="text-sky-700">Public profile</Link>}{item.verification_state === "domain_verified" && <Link to={`/my-apps/${item.app_id}/analytics`} className="text-sky-700">Traffic connection</Link>}</div>
      {item.status === "verified" && <div className="mt-3 text-sm"><button onClick={() => { setSourceFor(sourceFor === item.app_id ? null : item.app_id); setError(""); }} className="text-sky-700">Add source</button>
        {sourceFor === item.app_id && <form className="mt-3 flex gap-2" onSubmit={async (event) => {
          event.preventDefault(); setError(""); setNotice("");
          const { data, error: requestError } = await supabase.functions.invoke("rocket-apps", { body: { action: "add_source", app_id: item.app_id, url: sourceUrl } });
          if (requestError || data?.error) setError(data?.error || requestError?.message || "Could not attach source");
          else { setNotice(data?.outcome === "already_attached" ? "Source already attached." : "Source attached to your app."); setSourceFor(null); setSourceUrl(""); }
        }}><input type="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://public-source-url" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button className="rounded-lg bg-neutral-900 px-3 py-2 text-white">Add</button></form>}</div>}
    </div>)}</div>
  </main>;
}
