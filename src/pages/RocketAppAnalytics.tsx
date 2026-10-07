import { useEffect, useState } from "react";
import { BarChart3, Bookmark, Eye, MessageSquare, Star } from "lucide-react";
import { Link, useParams } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type RocketAnalytics = {
  app_id: string; app_name: string; from: string; to: string; days: number; page: number; page_size: number;
  profile_views: number; total_profile_views: number; review_count: number; period_review_count: number;
  average_rating: number | null; save_count: number; updated_at: string;
  daily_views: { day: string; views: number }[];
  rating_distribution: { stars: number; count: number }[];
  reviews: { id: string; rating: number; body: string; created_at: string }[];
};
const number = (n: number) => n.toLocaleString();
const date = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const panel = "rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6";

function ViewTrend({ points }: { points: RocketAnalytics["daily_views"] }) {
  const max = Math.max(2, Math.ceil(Math.max(0, ...points.map((p) => p.views)) / 2) * 2);
  const path = points.map((p, i) => `${i ? "L" : "M"}${50 + i * 700 / Math.max(1, points.length - 1)},${190 - p.views / max * 150}`).join(" ");
  return <>
    <svg viewBox="0 0 800 230" role="img" aria-label="Daily Rocket profile views" className="mt-4 w-full">
      <title>Daily Rocket profile views</title>
      {[0, 1, 2].map((n) => <g key={n}><line x1="50" x2="750" y1={190 - n * 75} y2={190 - n * 75} stroke="currentColor" className="text-neutral-100" /><text x="35" y={195 - n * 75} textAnchor="end" fill="currentColor" className="text-neutral-500" fontSize="14">{Math.ceil(max * n / 2)}</text></g>)}
      <path d={path} stroke="#0284c7" strokeWidth="3" fill="none" strokeLinejoin="round" />
      {points.length > 0 && <><text x="50" y="220" fill="currentColor" className="text-neutral-500" fontSize="14">{date(points[0].day)}</text><text x="750" y="220" textAnchor="end" fill="currentColor" className="text-neutral-500" fontSize="14">{date(points[points.length - 1].day)}</text></>}
    </svg>
    <details className="mt-2 text-sm"><summary className="cursor-pointer text-sky-800">View daily counts</summary>
      <div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left"><caption className="sr-only">Daily profile views, UTC</caption><thead><tr><th scope="col" className="py-2">Date (UTC)</th><th scope="col">Views</th></tr></thead><tbody>{points.map((p) => <tr key={p.day} className="border-t"><th scope="row" className="py-2 font-normal">{p.day}</th><td>{number(p.views)}</td></tr>)}</tbody></table></div>
    </details>
  </>;
}

export default function RocketAppAnalytics() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState(30), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<{ owner: string; value: RocketAnalytics } | null>(null);
  const data = loaded?.owner === user?.id && loaded?.value.app_id === id ? loaded.value : null;
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setLoaded(null); setError(""); setLoading(true);
    if (authLoading) return () => { alive = false; };
    if (!user || !id) { setLoading(false); return () => { alive = false; }; }
    supabase.functions.invoke("rocket-app-analytics", { body: { app_id: id, days, page } }).then(async ({ data: result, error: failure }) => {
      if (failure || result?.error) {
        let message = result?.error;
        if (!message && failure?.context instanceof Response) { try { message = (await failure.context.json()).error; } catch { /* use fallback */ } }
        throw new Error(message || "Rocket analytics could not be loaded. Please retry.");
      }
      if (!result || result.app_id !== id || !Array.isArray(result.daily_views) || !Array.isArray(result.reviews)) throw new Error("Rocket analytics could not be loaded. Please retry.");
      if (alive) setLoaded({ owner: user.id, value: result });
    }).catch((err) => { if (alive) setError(err.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, user?.id, authLoading, days, page, refresh]);
  const pages = data ? Math.max(1, Math.ceil(data.period_review_count / data.page_size)) : 1;
  return <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
    <Link to="/your-apps" className="text-sm font-medium text-sky-800 hover:underline">← My Apps</Link>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
      <div><p className="flex items-center gap-2 text-sm font-semibold text-sky-800"><BarChart3 size={18} aria-hidden="true" />Rocket Analytics</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{data?.app_name || "App analytics"}</h1><p className="mt-2 text-neutral-600">See how people discover and review your app on Rocket.</p></div>
      <div className="flex flex-wrap items-center gap-3"><div role="group" aria-label="Analytics date range" className="flex gap-1 rounded-xl border bg-white p-1">{[7,30,90].map((n) => <button key={n} disabled={loading} aria-pressed={days === n} onClick={() => { setDays(n); setPage(1); }} className={`min-h-10 rounded-lg px-3 text-sm font-medium disabled:opacity-60 ${days === n ? "bg-sky-700 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{n} days</button>)}</div><button disabled={loading} onClick={() => setRefresh((v) => v+1)} className="min-h-11 rounded-xl border bg-white px-4 text-sm font-medium disabled:opacity-60">Refresh</button></div>
    </div>
    {!authLoading && !user && <p className="mt-8"><Link to="/login" className="text-sky-800 underline">Log in to see your app analytics</Link></p>}
    {loading && <div role="status" className="mt-8 rounded-2xl border bg-white p-8 text-neutral-500">Loading Rocket analytics…</div>}
    {error && <p role="alert" className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>}
    {data && <>
      <p className="mt-6 text-sm text-neutral-500">{date(data.from)} – {date(data.to)} (UTC) · App profile activity on Rocket, not your website traffic.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Profile views", value: number(data.profile_views), note: `${number(data.total_profile_views)} since tracking began`, Icon: Eye },
          { label: "Comments / reviews", value: number(data.period_review_count), note: `${number(data.review_count)} published reviews overall`, Icon: MessageSquare },
          { label: "Star rating", value: data.average_rating === null ? "—" : `${data.average_rating.toFixed(1)} / 5`, note: data.review_count ? "All published reviews" : "No ratings yet", Icon: Star },
          { label: "Saves", value: number(data.save_count), note: "Currently bookmarked by Rocket users", Icon: Bookmark },
        ].map(({ label, value, note, Icon }) => <section key={label} className={panel}><p className="flex items-center gap-2 text-sm font-medium text-neutral-600"><Icon size={18} aria-hidden="true" />{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-xs text-neutral-500">{note}</p></section>)}
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <section className={panel}><h2 className="text-lg font-semibold">Profile views over time</h2>{data.profile_views === 0 && <p className="mt-2 text-sm text-neutral-500">No recorded views in this period yet.</p>}<ViewTrend points={data.daily_views} /><p className="mt-3 text-xs text-neutral-500">Repeat visits from the same browser/network count once per app per UTC day. These are deduplicated views, not unique people across the whole period.</p></section>
        <section className={panel}><h2 className="text-lg font-semibold">Star rating breakdown</h2><p className="mt-1 text-sm text-neutral-500">All published reviews</p><div className="mt-6 space-y-4">{data.rating_distribution.map((row) => <div key={row.stars} className="flex items-center gap-3 text-sm" aria-label={`${row.stars} stars: ${row.count} reviews`}><span className="inline-flex w-10 items-center gap-1">{row.stars}<Star size={15} className="fill-amber-400 text-amber-500" aria-hidden="true" /></span><div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${data.review_count ? row.count / data.review_count * 100 : 0}%` }} /></div><span className="w-8 text-right">{number(row.count)}</span></div>)}</div></section>
      </div>
      <section className={`${panel} mt-6`}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Review comments</h2><Link to={`/apps/${id}`} className="text-sm font-medium text-sky-800 hover:underline">View public profile →</Link></div><p className="mt-1 text-sm text-neutral-500">Published feedback submitted during the selected period. Star ratings and comments are part of the same review.</p>
        {!data.reviews.length ? <p className="mt-6 text-neutral-600">No published reviews in this period.</p> : <ul className="mt-4 divide-y">{data.reviews.map((review) => <li key={review.id} className="py-5"><div className="flex items-center justify-between gap-3"><span aria-label={`${review.rating} out of 5 stars`} className="text-lg tracking-wider text-amber-500">{"★".repeat(review.rating)}<span className="text-neutral-200">{"★".repeat(5-review.rating)}</span></span><time dateTime={review.created_at} className="text-xs text-neutral-500">{date(review.created_at)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-700">{review.body}</p></li>)}</ul>}
        {pages>1 && <nav aria-label="Review pagination" className="mt-4 flex items-center justify-center gap-4"><button disabled={page<=1 || loading} onClick={() => setPage((p) => p-1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Previous</button><span className="text-sm">Page {page} of {pages}</span><button disabled={page>=pages || loading} onClick={() => setPage((p) => p+1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-40">Next</button></nav>}
      </section>
      <p className="mt-5 text-xs text-neutral-500">Loaded {new Date(data.updated_at).toLocaleString()} · Ratings exclude hidden or deleted reviews. Saves are a current total, not a historical conversion metric.</p>
    </>}
  </main>;
}
