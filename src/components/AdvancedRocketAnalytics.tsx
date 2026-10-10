import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useToolkitMembership } from "@/hooks/useToolkitMembership";

type Advanced = { app_id: string; days: number; from: string; to: string; tracking_started: string; views: number; outbound_clicks: number; previous_views: number | null; previous_outbound_clicks: number | null; daily_clicks: { day: string; clicks: number }[]; public_collection_count: number; review_count: number };
const trend = (current: number, previous: number | null) => {
  if (previous === null || previous < 10 || current < 10) return "Not enough comparable activity";
  const change = Math.round((current - previous) / previous * 100);
  return `${change > 0 ? "+" : ""}${change}% vs previous equal-length period`;
};

export default function AdvancedRocketAnalytics({ appId, days }: { appId: string; days: number }) {
  const membership = useToolkitMembership();
  const [data, setData] = useState<Advanced | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true; setData(null); setError("");
    if (!membership.active) return () => { alive = false; };
    supabase.functions.invoke("rocket-developer-toolkit", { body: { action: "analytics", app_id: appId, days } })
      .then(({ data: result, error: failure }) => {
        if (failure || result?.error || result?.app_id !== appId || result.days !== days || !Array.isArray(result.daily_clicks)) throw new Error(result?.error || "Advanced analytics unavailable");
        if (alive) setData(result as Advanced);
      }).catch((issue) => { if (alive) setError(issue.message); });
    return () => { alive = false; };
  }, [appId, days, membership.active]);
  return <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6" aria-label="Advanced Rocket Analytics">
    <h2 className="text-lg font-semibold">Advanced Rocket Analytics</h2>
    <p className="mt-1 text-sm text-neutral-600">A deeper look at activity on Rocket. These are not website visits, installs or unique customers.</p>
    {membership.loading ? <p role="status" className="mt-4 text-sm text-neutral-500">Checking membership…</p>
      : !membership.active ? <p className="mt-4 text-sm text-neutral-600">Compare Rocket activity and discover public collection reach with <Link to="/settings/developer" className="font-semibold text-sky-800 underline">Rocket Developer</Link>. Your basic analytics above remain available.</p>
      : error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>
      : !data ? <p role="status" className="mt-4 text-sm text-neutral-500">Loading advanced analytics…</p>
      : <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Profile views", value: data.views, note: trend(data.views, data.previous_views) },
            { label: "Outbound clicks", value: data.outbound_clicks, note: trend(data.outbound_clicks, data.previous_outbound_clicks) },
            { label: "Published reviews", value: data.review_count, note: `During the selected ${days} days` },
            { label: "Public collections", value: data.public_collection_count, note: "Current appearances, not a historical trend" },
          ].map((metric) => <div key={metric.label} className="rounded-xl border border-neutral-200 p-4"><p className="text-sm text-neutral-600">{metric.label}</p><p className="mt-2 text-2xl font-semibold">{metric.value.toLocaleString()}</p><p className="mt-2 text-xs text-neutral-500">{metric.note}</p></div>)}
        </div>
        <details className="mt-5 text-sm"><summary className="cursor-pointer font-medium text-sky-800">Daily outbound clicks</summary><div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left"><caption className="sr-only">Daily outbound clicks on Rocket, UTC</caption><thead><tr><th className="py-2">Date (UTC)</th><th>Clicks</th></tr></thead><tbody>{data.daily_clicks.map((point) => <tr className="border-t" key={point.day}><th className="py-2 font-normal">{point.day}</th><td>{point.clicks.toLocaleString()}</td></tr>)}</tbody></table></div></details>
        <p className="mt-4 text-xs text-neutral-500">Tracking began {data.tracking_started}. Views and outbound clicks are deduplicated per app/browser/network/UTC day. Comparison appears only with a complete previous period and at least 10 events in each period. Public collection count is current; older collection history is unavailable.</p>
      </>}
  </section>;
}
