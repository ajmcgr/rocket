import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Trash2, ArrowLeft, Search, LayoutGrid, List, ArrowUpDown, CheckSquare, Square, AlertTriangle } from "lucide-react";
import { AssetGridSkeleton } from "@/components/Skeletons";
import { Logotype } from "@/components/Logotype";
import AssetThumbnail from "@/components/AssetThumbnail";
import BrandCover from "@/components/brand/BrandCover";
import { type CanvasElement } from "@/lib/canvasAsset";
import { isBrandAsset } from "@/lib/assetExperience";
import { CollectionView, DesignSort, sortByOption } from "@/lib/designCollections";
import { defaultLogotypeState, pickLogotypeText } from "@/lib/logotype";
const supabase = _sb as any;

const ASSET_TYPE_LABELS: Record<string, string> = {
  logo: "Logo",
  graphic: "Graphic",
  icon: "Icon",
  photo: "Photo",
  template: "Template",
  presentation: "Presentation",
  other: "Other",
};

const GENERIC_LOGOTYPE_TITLE = /^logotype(?:\s+\d+)?$/i;

type TrashPreviewAsset = {
  title?: string | null;
  content?: string | null;
  prompt?: string | null;
  asset_type?: string | null;
  editor_state?: unknown;
  image_url?: string | null;
  thumbnail_url?: string | null;
  source_url?: string | null;
  meta?: {
    kind?: string | null;
    asset_kind?: string | null;
    brand_context?: { productName?: string | null; name?: string | null; url?: string | null; colors?: string[] | null } | null;
    brandContext?: { productName?: string | null; name?: string | null; url?: string | null; colors?: string[] | null } | null;
  } | null;
};

const hasRenderableCanvasElements = (value: unknown): value is CanvasElement[] => {
  if (!Array.isArray(value)) return false;
  return value.some((item) => {
    if (!item || typeof item !== "object") return false;
    const el = item as { kind?: string; visible?: boolean; text?: unknown; src?: unknown; w?: unknown; h?: unknown };
    if (el.visible === false || typeof el.kind !== "string") return false;
    if ((el.kind === "text" || el.kind === "sticky") && String(el.text || "").trim()) return true;
    if (el.kind === "image" && String(el.src || "").trim()) return true;
    if (el.kind === "line") return Boolean(Number(el.w) || Number(el.h));
    return ["rect", "circle", "triangle", "star", "table"].includes(el.kind);
  });
};

const firstCanvasText = (value: unknown) => {
  if (!Array.isArray(value)) return "";
  const textElement = value.find((item) => {
    if (!item || typeof item !== "object") return false;
    const el = item as { kind?: string; visible?: boolean; text?: unknown };
    return el.visible !== false && (el.kind === "text" || el.kind === "sticky") && String(el.text || "").trim();
  }) as { text?: unknown } | undefined;
  return String(textElement?.text || "").trim();
};

const safePreviewText = (asset: TrashPreviewAsset) => {
  const title = String(asset?.title || "").trim();
  const content = String(asset?.content || "").trim();
  const prompt = String(asset?.prompt || "").trim();
  return content || prompt || title;
};

const isLogotypeLikeDesign = (asset: TrashPreviewAsset) => {
  const title = String(asset?.title || "");
  const prompt = String(asset?.prompt || "");
  const content = String(asset?.content || "");
  const metaKind = String(asset?.meta?.kind || asset?.meta?.asset_kind || "");
  return (
    asset?.asset_type === "logo" &&
    ((asset?.editor_state as any)?.kind === "logotype" ||
      GENERIC_LOGOTYPE_TITLE.test(title.trim()) ||
      /\b(logotype|wordmark|word mark)\b/i.test(`${prompt} ${content} ${metaKind}`))
  );
};

const logotypePreviewState = (asset: TrashPreviewAsset) => {
  const brandContext = asset?.meta?.brand_context || asset?.meta?.brandContext || {};
  const canvasText = firstCanvasText(asset?.editor_state);
  const fallback = GENERIC_LOGOTYPE_TITLE.test(String(asset?.title || "").trim())
    ? canvasText || asset?.prompt || asset?.content
    : canvasText || asset?.title || asset?.prompt || asset?.content;
  const text = pickLogotypeText({
    prompt: asset?.prompt || canvasText,
    productName: brandContext?.productName || brandContext?.name,
    url: brandContext?.url || asset?.source_url,
    fallback,
  }) || canvasText || String(asset?.title || "Design").trim();
  return defaultLogotypeState(text, Array.isArray(brandContext?.colors) ? brandContext.colors[0] || "#0A0A0A" : "#0A0A0A");
};

const Trash = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [view, setView] = useState<CollectionView>("card");
  const [sort, setSort] = useState<DesignSort>("date");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
    const ws = await ensureActiveWorkspaceId();
    const scope = (q: any) => (ws ? q.eq("workspace_id", ws) : q);
    const a = await scope(supabase.from("assets").select("*").eq("user_id", user.id)).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500);
    // Client-side purge of items older than 30 days (best-effort).
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const expiredAssetIds = (a.data || []).filter((x: any) => new Date(x.deleted_at).getTime() < cutoff).map((x: any) => x.id);
    if (expiredAssetIds.length) await supabase.from("assets").delete().in("id", expiredAssetIds);
    setAssets(a.data || []); setLoading(false);
    setSelected(new Set());
  };
  useEffect(() => { load(); }, [user]);

  const daysRemaining = (deletedAt: string) => {
    const diff = 30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(0, diff);
  };

  const restoreAsset = async (id: string) => {
    const { error } = await supabase.from("assets").update({ deleted_at: null }).eq("id", id);
    if (error) return toast({ title: "Restore failed", description: error.message, variant: "destructive" });
    setAssets((prev) => prev.filter(x => x.id !== id));
    toast({ title: "Design restored" });
  };
  const purgeAsset = async (id: string) => {
    if (!confirm("Permanently delete this design? This can't be undone.")) return;
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    setAssets((prev) => prev.filter(x => x.id !== id));
  };

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulkRestore = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    await supabase.from("assets").update({ deleted_at: null }).in("id", ids);
    setAssets((prev) => prev.filter((x) => !ids.includes(x.id)));
    setSelected(new Set());
    setBusy(false);
    toast({ title: `Restored ${ids.length} item${ids.length === 1 ? "" : "s"}` });
  };
  const bulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Permanently delete ${ids.length} item(s)? This can't be undone.`)) return;
    setBusy(true);
    await supabase.from("assets").delete().in("id", ids);
    setAssets((prev) => prev.filter((x) => !ids.includes(x.id)));
    setSelected(new Set());
    setBusy(false);
  };
  const emptyTrash = async () => {
    setBusy(true);
    const assetIds = assets.map((a) => a.id);
    if (assetIds.length) await supabase.from("assets").delete().in("id", assetIds);
    setAssets([]);
    setSelected(new Set());
    setConfirmEmpty(false); setBusy(false);
    toast({ title: "Trash emptied" });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = assets.filter((a) => {
      if (filter !== "all" && a.asset_type !== filter) return false;
      if (!q) return true;
      return [a.title, a.asset_type].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
    return sortByOption(visible, sort, (a) => a.title, (a) => a.deleted_at || a.created_at);
  }, [assets, filter, query, sort]);

  const AssetPreview = ({ a }: { a: TrashPreviewAsset }) => {
    const isLogotype = (a?.editor_state as any)?.kind === "logotype";
    const rasterPreview = a.thumbnail_url || a.image_url;
    const isImage = !!rasterPreview && !isLogotype;
    const isCanvas = !isImage && !isLogotype && hasRenderableCanvasElements(a?.editor_state);
    const fallbackLogotype = !isImage && !isLogotype && !isCanvas && isLogotypeLikeDesign(a);
    const brand = !isLogotype && !isCanvas && !fallbackLogotype && !isImage && isBrandAsset(a);
    const fallbackText = safePreviewText(a);

    return isLogotype || isCanvas || isImage ? (
      <AssetThumbnail asset={a} fallbackText={fallbackText} />
    ) : fallbackLogotype ? (
      <Logotype state={logotypePreviewState(a)} fit="contain" />
    ) : brand ? (
      <BrandCover asset={a} />
    ) : (
      <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-neutral-500">
        <div className="line-clamp-6 whitespace-pre-wrap">{fallbackText ? fallbackText.slice(0, 220) : "No preview"}</div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <Link to="/designs" className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"><ArrowLeft className="h-4 w-4" /> Back to Designs</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trash</h1>
          <p className="mt-1 text-sm text-neutral-500">Deleted items live here for 30 days before being purged automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-neutral-500">{selected.size} selected</span>
              <button onClick={bulkRestore} disabled={busy} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-60"><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
              <button onClick={bulkDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
            </>
          )}
          <button
            onClick={() => setConfirmEmpty(true)}
            disabled={busy || assets.length === 0}
            className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Empty trash
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search trash…"
            className="h-9 w-full min-w-0 rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-neutral-400 sm:w-72"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setFilter("all")} className={`rounded-full border px-3 py-1 text-xs transition ${filter === "all" ? "border-brand bg-brand text-brand-foreground" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}>All</button>
          {Object.keys(ASSET_TYPE_LABELS).map((type) => (
            <button key={type} onClick={() => setFilter(type)} className={`rounded-full border px-3 py-1 text-xs transition ${filter === type ? "border-brand bg-brand text-brand-foreground" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}>
              {ASSET_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-1">
            <button onClick={() => setView("card")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${view === "card" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Card
            </button>
            <button onClick={() => setView("list")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${view === "list" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-1">
            <button onClick={() => setSort("name")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${sort === "name" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              <ArrowUpDown className="h-3.5 w-3.5" /> Name (A–Z)
            </button>
            <button onClick={() => setSort("date")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${sort === "date" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              Date deleted
            </button>
          </div>
        </div>
      </div>


      {loading ? (
        <AssetGridSkeleton />
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-neutral-300 bg-gradient-to-b from-white to-neutral-50 p-16 text-center">
          <h2 className="text-lg font-semibold text-neutral-900">Trash is empty.</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">
            Designs you delete will appear here for 30 days.
          </p>
        </div>
      ) : view === "card" ? (
        <>
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setSelected((prev) => prev.size === filtered.length ? new Set() : new Set(filtered.map((a: any) => a.id)))}
            className="text-xs text-neutral-500 hover:text-neutral-800"
          >
            {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((a) => (
            <div key={a.id} className={`group relative overflow-hidden rounded-2xl border bg-white transition hover:shadow-md ${selected.has(a.id) ? "border-brand ring-2 ring-brand/30" : "border-neutral-200"}`}>
              <button onClick={() => toggle(a.id)} className="absolute left-2 top-2 z-10 rounded-md bg-white/90 p-1 text-neutral-500 shadow-sm backdrop-blur hover:text-neutral-900">
                {selected.has(a.id) ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4" />}
              </button>
              <div className="aspect-square w-full overflow-hidden bg-neutral-50">
                <AssetPreview a={a} />
              </div>
              <div className="border-t border-neutral-100 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-neutral-900">{a.title || "Untitled"}</div>
                  <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                    {ASSET_TYPE_LABELS[a.asset_type] || a.asset_type} · {daysRemaining(a.deleted_at)}d left
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <button onClick={() => restoreAsset(a.id)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 text-[11px] hover:bg-neutral-50"><RotateCcw className="h-3 w-3" /> Restore</button>
                  <button onClick={() => purgeAsset(a.id)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" /> Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        </>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {filtered.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0">
              <button onClick={() => toggle(a.id)} className="text-neutral-400 hover:text-neutral-800">
                {selected.has(a.id) ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4" />}
              </button>
              <div className="h-14 w-14 overflow-hidden rounded-lg bg-neutral-50">
                <AssetPreview a={a} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-900">{a.title || "Untitled"}</div>
                <div className="truncate text-xs text-neutral-500">
                  {(ASSET_TYPE_LABELS[a.asset_type] || a.asset_type)} · deleted {new Date(a.deleted_at).toLocaleDateString()} · {daysRemaining(a.deleted_at)}d left
                </div>
              </div>
              <button onClick={() => restoreAsset(a.id)} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs hover:bg-neutral-50"><RotateCcw className="h-3 w-3" /> Restore</button>
              <button onClick={() => purgeAsset(a.id)} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" /> Delete forever</button>
            </div>
          ))}
        </div>
      )}

      {confirmEmpty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setConfirmEmpty(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-50 p-2"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-neutral-900">Empty trash?</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  This will permanently delete {assets.length} item{assets.length === 1 ? "" : "s"}. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmEmpty(false)} disabled={busy} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-60">Cancel</button>
              <button onClick={emptyTrash} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">Empty trash</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Trash;
