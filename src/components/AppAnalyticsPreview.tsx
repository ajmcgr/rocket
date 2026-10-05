import { useEffect, useState } from "react";
import { ArrowRight, Bookmark, Eye, MessageSquare, Star } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { RocketAnalytics } from "@/pages/RocketAppAnalytics";

export default function AppAnalyticsPreview({ appId, appName }: { appId: string; appName: string }) {
  const { user, loading: authLoading } = useAuth();
  const [loaded, setLoaded] = useState<{ owner: string; value: RocketAnalytics } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const data = loaded && loaded.owner === user?.id && loaded.value.app_id === appId ? loaded.value : null;
  useEffect(() => {
    let alive = true;
    setLoaded(null); setFailed(false);
    if (authLoading || !user) return () => { alive = false; };
    supabase.functions.invoke("rocket-app-analytics", { body: { app_id: appId, days: 30, page: 1 } })
      .then(({ data: result, error }) => {
        if (error || result?.error || result?.app_id !== appId || !Array.isArray(result.daily_views) ||
          ![result.profile_views, result.period_review_count, result.save_count].every((n) => Number.isFinite(n) && n >= 0) ||
          !(result.average_rating === null || (Number.isFinite(result.average_rating) && result.average_rating >= 1 && result.average_rating <= 5)) ||
          !result.daily_views.every((p: { views: number }) => Number.isFinite(p.views) && p.views >= 0)) throw new Error("Unavailable");
        if (alive) setLoaded({ owner: user.id, value: result });
      }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [appId, user?.id, authLoading, retry]);

  const points = data?.daily_views || [];
  const max = Math.max(1, ...points.map((p) => p.views));
  const path = points.map((p, i) => `${i ? "L" : "M"}${4 + i * 592 / Math.max(1, points.length - 1)},${72 - p.views / max * 64}`).join(" ");
  return <section aria-label={`${appName} analytics preview`} className="mt-5 rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Analytics</h3>
      <Link to={`/my-apps/${appId}/rocket-analytics`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky-800 hover:underline dark:text-sky-400">View analytics <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
    <p className="text-xs text-neutral-500 dark:text-neutral-400">Last 30 days · Activity on Rocket, not your website traffic</p>
    {failed ? <p role="status" className="mt-4 text-sm text-neutral-500">Analytics preview unavailable. <button onClick={() => setRetry((n) => n + 1)} className="min-h-11 text-sky-800 underline dark:text-sky-400">Retry</button></p>
      : !data ? <p role="status" className="mt-4 text-sm text-neutral-500">{!authLoading && !user ? "Sign in to see analytics." : "Loading analytics…"}</p>
      : <>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Profile views", value: data.profile_views.toLocaleString(), Icon: Eye },
            { label: "Comments / reviews", value: data.period_review_count.toLocaleString(), Icon: MessageSquare },
            { label: "Star rating · all time", value: data.average_rating === null ? "No ratings yet" : `${data.average_rating.toFixed(1)} / 5`, Icon: Star },
            { label: "Saves · current", value: data.save_count.toLocaleString(), Icon: Bookmark },
          ].map(({ label, value, Icon }) => <div key={label}><p className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400"><Icon size={14} aria-hidden="true" />{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}
        </div>
        {points.length > 0 && <svg viewBox="0 0 600 80" role="img" aria-label={`${appName}: daily profile views over the last 30 days`} className="mt-4 h-20 w-full" preserveAspectRatio="none">
          <title>Daily profile views on Rocket</title>
          {[8, 40, 72].map((y) => <line key={y} x1="4" x2="596" y1={y} y2={y} stroke="currentColor" className="text-neutral-100 dark:text-neutral-800" />)}
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="text-sky-600 dark:text-sky-400" />
        </svg>}
        {data.profile_views === 0 && <p className="mt-2 text-xs text-neutral-500">No recorded profile views in this period yet.</p>}
      </>}
  </section>;
}
