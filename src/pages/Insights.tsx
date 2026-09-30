import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart3, Folders, Image, Coins, Sparkles, Loader2 } from "@/components/EmojiIcons";
import { Download } from "@/components/EmojiIcons";

const supabase = _sb as any;

type Asset = { id: string; asset_type: string | null; project_id: string | null; created_at: string; title: string | null; image_url: string | null };
type Project = { id: string; name: string; created_at: string };
type Usage = { plan: string; monthly_limit: number; credits_used: number; credits_extra: number | null };

const TYPE_LABEL: Record<string, string> = {
  logo: "Logos",
  color_system: "Color systems",
  font_system: "Font systems",
  brand_voice: "Brand voice",
  launch_copy: "Launch copy",
};

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayKey = (d: Date) => startOfDay(d).toISOString().slice(0, 10);

const Insights = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [range, setRange] = useState<7 | 30 | 90>(30);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [a, p, u] = await Promise.all([
        supabase.from("assets").select("id,asset_type,project_id,created_at,title,image_url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000),
        supabase.from("projects").select("id,name,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
        supabase.from("user_usage").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      setAssets((a.data as Asset[]) || []);
      setProjects((p.data as Project[]) || []);
      setUsage(u.data as Usage | null);
      setLoading(false);
    })();
  }, [user]);

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - range);
    return d;
  }, [range]);

  const inRange = useMemo(() => assets.filter(a => new Date(a.created_at) >= since), [assets, since]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    inRange.forEach(a => m.set(a.asset_type || "other", (m.get(a.asset_type || "other") || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [inRange]);

  const daily = useMemo(() => {
    const days: { key: string; date: Date; count: number }[] = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: dayKey(d), date: startOfDay(d), count: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.key, i]));
    inRange.forEach(a => {
      const k = dayKey(new Date(a.created_at));
      const i = idx.get(k);
      if (i != null) days[i].count++;
    });
    return days;
  }, [inRange, range]);

  const maxDay = Math.max(1, ...daily.map(d => d.count));
  const totalAssets = assets.length;
  const totalProjects = projects.length;
  const orphanAssets = assets.filter(a => !a.project_id).length;
  const creditsRemaining = usage ? usage.monthly_limit + (usage.credits_extra || 0) - usage.credits_used : 0;
  const creditsUsed = usage?.credits_used || 0;
  const creditsTotal = usage ? usage.monthly_limit + (usage.credits_extra || 0) : 0;
  const creditsPct = creditsTotal ? Math.min(100, Math.round((creditsUsed / creditsTotal) * 100)) : 0;

  const recent = assets.slice(0, 8);
  const recentProjects = projects.slice(0, 5);

  const [csvOpen, setCsvOpen] = useState(false);

  const downloadCsv = (name: string, rows: (string | number)[][]) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    setCsvOpen(false);
    const rows: (string | number)[][] = [["id", "title", "asset_type", "project_id", "project_name", "created_at", "image_url"]];
    const projById = new Map(projects.map((p) => [p.id, p.name]));
    inRange.forEach((a) => {
      rows.push([
        a.id,
        a.title || "",
        a.asset_type || "",
        a.project_id || "",
        projById.get(a.project_id || "") || "",
        a.created_at,
        a.image_url || "",
      ]);
    });
    downloadCsv(`rocket-assets-last-${range}d.csv`, rows);
  };

  const exportDailyCsv = () => {
    setCsvOpen(false);
    const rows: (string | number)[][] = [["date", "assets_generated"]];
    daily.forEach((d) => rows.push([d.key, d.count]));
    downloadCsv(`rocket-daily-last-${range}d.csv`, rows);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Insights</h1>
          <p className="mt-1 text-sm text-neutral-500">Your generation activity, credits, and library at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setCsvOpen((v) => !v)}
              disabled={loading || inRange.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-400 disabled:opacity-40"
              title="Export as CSV"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            {csvOpen && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-neutral-200 bg-white p-1 text-sm shadow-lg">
                <button onClick={exportCsv} className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-neutral-50">
                  <span className="font-medium">Per-asset breakdown</span>
                  <span className="text-[11px] text-neutral-500">One row per asset with type, project, timestamp.</span>
                </button>
                <button onClick={exportDailyCsv} className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-neutral-50">
                  <span className="font-medium">Daily totals</span>
                  <span className="text-[11px] text-neutral-500">One row per day with generation count.</span>
                </button>
              </div>
            )}
          </div>
          <div className="inline-flex rounded-xl border border-neutral-200 bg-white p-1 text-sm">
            {[7, 30, 90].map(n => (
              <button key={n} onClick={() => setRange(n as 7 | 30 | 90)} className={`rounded-lg px-3 py-1.5 transition ${range === n ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"}`}>
                {n}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-16 flex items-center justify-center text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat icon={<Sparkles className="h-4 w-4" />} label="Designs generated" value={inRange.length} hint={`of ${totalAssets} total`} />
            <Stat icon={<Folders className="h-4 w-4" />} label="Projects" value={totalProjects} hint={`${orphanAssets} unassigned assets`} />
            <Stat icon={<Image className="h-4 w-4" />} label="Logos & visuals" value={inRange.filter(a => a.image_url).length} hint="With images" />
            <Stat icon={<Coins className="h-4 w-4" />} label="Credits left" value={creditsRemaining} hint={`${creditsUsed.toLocaleString()} used`} />
          </div>

          <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Activity</h2>
                <p className="text-xs text-neutral-500">Designs generated per day · last {range} days</p>
              </div>
              <BarChart3 className="h-4 w-4 text-neutral-400" />
            </div>
            <div className="mt-6 flex h-40 items-end gap-1">
              {daily.map(d => (
                <div key={d.key} className="group flex flex-1 flex-col items-center justify-end" title={`${d.key}: ${d.count}`}>
                  <div
                    className={`w-full rounded-t ${d.count ? "bg-brand" : "bg-neutral-100"} transition-all group-hover:opacity-80`}
                    style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count ? 4 : 2 }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] normal-case tracking-wider text-neutral-400">
              <span>{daily[0]?.key}</span>
              <span>{daily[daily.length - 1]?.key}</span>
            </div>
          </section>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-neutral-200 bg-white p-6">
              <h2 className="text-base font-semibold">By asset type</h2>
              <p className="text-xs text-neutral-500">Last {range} days</p>
              <div className="mt-4 space-y-2.5">
                {byType.length === 0 && <p className="text-sm text-neutral-500">No designs in this window.</p>}
                {byType.map(([type, count]) => {
                  const pct = Math.round((count / inRange.length) * 100);
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-700">{TYPE_LABEL[type] || type}</span>
                        <span className="font-medium text-neutral-900">{count} <span className="text-xs text-neutral-400">· {pct}%</span></span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-full bg-neutral-900" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-6">
              <h2 className="text-base font-semibold">Credits</h2>
              <p className="text-xs text-neutral-500 capitalize">Plan: {usage?.plan || "free"}</p>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-2xl font-semibold">{creditsRemaining.toLocaleString()}</div>
                  <div className="text-xs text-neutral-500">remaining of {creditsTotal.toLocaleString()}</div>
                </div>
                <div className="text-right text-xs text-neutral-500">{creditsPct}% used</div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full bg-brand" style={{ width: `${creditsPct}%` }} />
              </div>
              <Link to="/settings/billing" className="mt-4 inline-flex text-sm font-medium text-neutral-900 hover:underline">Manage billing →</Link>
            </section>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-neutral-200 bg-white p-6">
              <h2 className="text-base font-semibold">Recent designs</h2>
              <ul className="mt-3 divide-y divide-neutral-100">
                {recent.length === 0 && <li className="py-4 text-sm text-neutral-500">No designs yet.</li>}
                {recent.map(a => (
                  <li key={a.id} className="py-2.5">
                    <Link to={`/editor?id=${a.id}`} className="flex items-center justify-between gap-3 group" target="_blank" rel="noopener noreferrer">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-neutral-900 group-hover:underline">{a.title || "Untitled"}</div>
                        <div className="truncate text-xs text-neutral-500">{TYPE_LABEL[a.asset_type || ""] || a.asset_type || "asset"} · {new Date(a.created_at).toLocaleDateString()}</div>
                      </div>
                      {a.image_url && <img src={a.image_url} alt="" className="h-9 w-9 rounded-md border border-neutral-200 object-cover" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-6">
              <h2 className="text-base font-semibold">Recent projects</h2>
              <ul className="mt-3 divide-y divide-neutral-100">
                {recentProjects.length === 0 && <li className="py-4 text-sm text-neutral-500">No projects yet.</li>}
                {recentProjects.map(p => {
                  const count = assets.filter(a => a.project_id === p.id).length;
                  return (
                    <li key={p.id} className="py-2.5">
                      <Link to={`/projects/${p.id}`} className="flex items-center justify-between group">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-neutral-900 group-hover:underline">{p.name}</div>
                          <div className="text-xs text-neutral-500">{count} asset{count === 1 ? "" : "s"} · {new Date(p.created_at).toLocaleDateString()}</div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
};

const Stat = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number; hint?: string }) => (
  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
    <div className="flex items-center gap-2 text-xs font-medium normal-case tracking-wider text-neutral-500">{icon}<span>{label}</span></div>
    <div className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">{value.toLocaleString()}</div>
    {hint && <div className="mt-0.5 text-xs text-neutral-500">{hint}</div>}
  </div>
);

export default Insights;
