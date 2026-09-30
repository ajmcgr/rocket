import { Heart as ControlHeart, Wand2 as ControlWand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase as _sb } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Logotype } from "@/components/Logotype";
import { Heart, Wand2 } from "@/components/EmojiIcons";
const supabase = _sb as any;

type GalleryEntry = { project: any; assets: any[] };

const Gallery = () => {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: any) => setMe(data?.user?.id || null));
  }, []);

  // key = first asset id of a project (server likes are per-asset)
  const keyForProject = (e: GalleryEntry) => e.assets[0]?.id || null;

  useEffect(() => {
    if (!entries.length) return;
    const ids = entries.map(keyForProject).filter(Boolean) as string[];
    if (!ids.length) return;
    (async () => {
      const { data: all } = await supabase.from("likes").select("asset_id, user_id").in("asset_id", ids);
      const c: Record<string, number> = {};
      const mine: Record<string, boolean> = {};
      (all || []).forEach((r: any) => {
        c[r.asset_id] = (c[r.asset_id] || 0) + 1;
        if (me && r.user_id === me) mine[r.asset_id] = true;
      });
      setCounts(c); setLikes(mine);
    })();
  }, [entries, me]);

  const toggleLike = async (projectId: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const entry = entries.find(x => x.project.id === projectId);
    const assetId = entry && keyForProject(entry);
    if (!assetId) return;
    if (!me) { window.location.href = "/login"; return; }
    const already = !!likes[assetId];
    setLikes((p) => ({ ...p, [assetId]: !already }));
    setCounts((p) => ({ ...p, [assetId]: Math.max(0, (p[assetId] || 0) + (already ? -1 : 1)) }));
    if (already) {
      await supabase.from("likes").delete().eq("asset_id", assetId).eq("user_id", me);
    } else {
      await supabase.from("likes").insert({ asset_id: assetId, user_id: me });
    }
  };

  useEffect(() => {
    (async () => {
      // Requires column projects.is_public_gallery boolean default false + RLS policy allowing anon SELECT.
      // If the column doesn't exist yet, we get an error and just render an empty state.
      const { data: projects, error } = await supabase
        .from("projects")
        .select("id, name, description, share_token, updated_at")
        .eq("is_public_gallery", true)
        .not("share_token", "is", null)
        .order("updated_at", { ascending: false })
        .limit(60);
      if (error || !projects?.length) { setLoading(false); return; }
      const ids = projects.map((p: any) => p.id);
      const { data: assets } = await supabase
        .from("assets")
        .select("id, project_id, title, asset_type, image_url, editor_state, content")
        .in("project_id", ids)
        .order("created_at", { ascending: false });
      const byProject: Record<string, any[]> = {};
      (assets || []).forEach((a: any) => {
        (byProject[a.project_id] ||= []).push(a);
      });
      setEntries(projects.map((p: any) => ({ project: p, assets: (byProject[p.id] || []).slice(0, 4) })));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <Link to="/" className="text-sm font-semibold tracking-tight">Rocket</Link>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-xs normal-case tracking-wider text-brand">Public gallery</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Brand kits built with Rocket</h1>
        <p className="mt-2 text-sm text-neutral-600">A curated stream of founder-made brand kits. Turn yours on from any project's share menu.</p>

        {loading ? (
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-neutral-300 bg-white p-16 text-center">
            <div className="mx-auto mb-4 grid grid-cols-2 gap-1">
              {["#3B82F6", "#F59E0B", "#10B981", "#EF4444"].map((c) => (
                <span key={c} className="h-8 w-8 rounded-md" style={{ background: c }} />
              ))}
            </div>
            <h2 className="text-lg font-semibold text-neutral-900">No public kits yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
              Be the first to share — open any project, hit <span className="font-medium text-neutral-700">Share</span>, and turn on <span className="font-medium text-neutral-700">Show in public gallery</span>.
            </p>
            <Link to="/logos" className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover">
              Start a new brand kit
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            {entries.map(({ project, assets }) => (
              <Link
                key={project.id}
                to={`/share/project/${project.share_token}`}
                className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:border-brand"
              >
                <div className="grid grid-cols-2 gap-1 bg-neutral-50 p-1">
                  {assets.length === 0 && <div className="col-span-2 aspect-[2/1]" />}
                  {assets.map((a) => (
                    <div key={a.id} className="aspect-square overflow-hidden rounded-md bg-white">
                      {a?.editor_state?.kind === "logotype" ? (
                        <Logotype state={a.editor_state} fit="contain" />
                      ) : a.image_url ? (
                        <img src={a.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center p-3 text-[10px] text-neutral-500">
                          <div className="line-clamp-6 whitespace-pre-wrap text-center">{(a.content || a.title || "").slice(0, 120)}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-start justify-between gap-3 border-t border-neutral-100 p-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-neutral-900 group-hover:text-brand">{project.name}</div>
                    {project.description && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{project.description}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={(e) => toggleLike(project.id, e)}
                      title={(() => { const k = assets[0]?.id; return k && likes[k] ? "Unlike" : "Like"; })()}
                      className={`inline-flex h-8 items-center gap-1 rounded-full border px-2 text-xs transition ${(() => { const k = assets[0]?.id; return k && likes[k] ? "border-brand bg-brand/10 text-brand" : "border-neutral-200 text-neutral-500 hover:border-neutral-400"; })()}`}
                    >
                      {(() => { const k = assets[0]?.id; const liked = k && likes[k]; const n = k ? (counts[k] || 0) : 0; return (<>
                        <ControlHeart className="h-3.5 w-3.5" fill={liked ? "currentColor" : "none"} />
                        {n > 0 && <span>{n}</span>}
                      </>); })()}
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const prompt = `Create a brand kit inspired by "${project.name}"`;
                        window.location.href = `/create?prompt=${encodeURIComponent(prompt)}`;
                      }}
                      title="Remix this"
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:border-brand hover:text-brand"
                    >
                      <ControlWand2 className="h-3 w-3" /> Remix
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Gallery;
