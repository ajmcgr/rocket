import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import {
  ChevronLeft, ChevronRight, Download, Layers, Loader2, Shapes, X,
} from "lucide-react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { packAssetsZip } from "@/lib/exporters/zipPack";
import { imageUrlToSvg } from "@/lib/vectorize";

const supabase = _sb as any;

type Row = {
  id: string;
  title: string;
  asset_type: string;
  image_url: string | null;
  content: string | null;
  meta: any;
  created_at: string;
};

const IMAGE_TYPES = new Set(["logo", "graphic", "icon", "photo"]);
const VECTORIZABLE = new Set(["logo", "icon"]);

/**
 * Full grid gallery for sibling image assets in the same batch.
 * Renders nothing when there is only one image in the set.
 *
 * Includes: responsive grid, lightbox with prev/next, per-image download,
 * download-all-as-ZIP, and vectorize-to-SVG for logo/icon assets.
 */
export default function ImageSetGallery({ asset }: { asset: any }) {
  const [siblings, setSiblings] = useState<Row[] | null>(null);
  const [zipping, setZipping] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [vectorizingId, setVectorizingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!asset?.image_url || !IMAGE_TYPES.has(asset.asset_type)) return;
      let q = supabase
        .from("assets")
        .select("id, title, asset_type, image_url, content, meta, created_at")
        .eq("asset_type", asset.asset_type)
        .eq("user_id", asset.user_id)
        .not("image_url", "is", null)
        .order("created_at", { ascending: true })
        .limit(48);
      if (asset.project_id) q = q.eq("project_id", asset.project_id);
      else q = q.is("project_id", null);
      if (asset.prompt) q = q.eq("prompt", asset.prompt);
      const { data } = await q;
      if (cancelled) return;
      setSiblings((data || []).filter((r: Row) => r.id !== asset.id));
    })();
    return () => { cancelled = true; };
  }, [asset?.id, asset?.image_url, asset?.asset_type, asset?.project_id, asset?.prompt, asset?.user_id]);

  const all = useMemo<Row[]>(() => {
    if (!siblings) return [];
    return [asset as Row, ...siblings];
  }, [asset, siblings]);

  const close = useCallback(() => setLightbox(null), []);
  const step = useCallback(
    (dir: 1 | -1) => setLightbox((n) => (n === null ? n : (n + dir + all.length) % all.length)),
    [all.length],
  );

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, step, close]);

  if (!siblings || all.length < 2) return null;

  const downloadZip = async () => {
    setZipping(true);
    try {
      await packAssetsZip(
        all.map((a) => ({
          title: a.title || "variant",
          asset_type: a.asset_type,
          image_url: a.image_url,
          content: a.content,
        })),
        `${asset.asset_type || "assets"}-pack.zip`,
      );
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || "Could not build ZIP.", variant: "destructive" });
    } finally {
      setZipping(false);
    }
  };

  const vectorize = async (row: Row) => {
    if (!row.image_url) return;
    setVectorizingId(row.id);
    try {
      const svg = await imageUrlToSvg(row.image_url);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(row.title || "asset").replace(/[^a-z0-9-_]+/gi, "-")}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e: any) {
      toast({ title: "Vectorize failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setVectorizingId(null);
    }
  };

  const active = lightbox === null ? null : all[lightbox];

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <Layers className="h-3.5 w-3.5" />
          <span className="font-medium text-neutral-800">Batch gallery</span>
          <span className="text-neutral-500">· {all.length} images</span>
        </div>
        <button
          onClick={downloadZip}
          disabled={zipping}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {zipping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          Download all (ZIP)
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {all.map((r, i) => {
          const isActive = r.id === asset.id;
          const canVector = VECTORIZABLE.has(r.asset_type);
          return (
            <div
              key={r.id}
              className={`group relative overflow-hidden rounded-xl border bg-neutral-50 transition ${
                isActive ? "border-brand ring-2 ring-brand/40" : "border-neutral-200 hover:border-neutral-300"
              }`}
            >
              <button
                type="button"
                onClick={() => setLightbox(i)}
                className="block aspect-square w-full"
                title={r.title}
              >
                {r.image_url ? (
                  <img
                    src={r.image_url}
                    alt={r.title}
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-neutral-400">no image</div>
                )}
              </button>

              {/* Bottom bar */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6 opacity-0 transition group-hover:opacity-100">
                <Link
                  to={`/editor?id=${r.id}`}
                  className="truncate rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-neutral-800 hover:bg-white"
                  title="Open design"
                 target="_blank" rel="noopener noreferrer">
                  {isActive ? "Current" : "Open"}
                </Link>
                <div className="flex items-center gap-1">
                  {canVector && r.image_url && (
                    <button
                      onClick={(e) => { e.stopPropagation(); vectorize(r); }}
                      disabled={vectorizingId === r.id}
                      title="Vectorize to SVG"
                      className="rounded-full bg-white/90 p-1 text-neutral-700 hover:bg-white disabled:opacity-50"
                    >
                      {vectorizingId === r.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Shapes className="h-3 w-3" />
                      )}
                    </button>
                  )}
                  {r.image_url && (
                    <a
                      href={r.image_url}
                      download
                      onClick={(e) => e.stopPropagation()}
                      title="Download"
                      className="rounded-full bg-white/90 p-1 text-neutral-700 hover:bg-white"
                    >
                      <Download className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {r.meta?.variant && r.meta?.of && (
                <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
                  {r.meta.variant}/{r.meta.of}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div className="flex items-center justify-between px-5 py-3 text-white/80" onClick={(e) => e.stopPropagation()}>
            <div className="text-xs">
              {lightbox! + 1} / {all.length} · <span className="text-white/60">{active.title}</span>
            </div>
            <div className="flex items-center gap-2">
              {VECTORIZABLE.has(active.asset_type) && active.image_url && (
                <button
                  onClick={() => vectorize(active)}
                  disabled={vectorizingId === active.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
                >
                  {vectorizingId === active.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shapes className="h-3.5 w-3.5" />}
                  Vectorize SVG
                </button>
              )}
              {active.image_url && (
                <a
                  href={active.image_url}
                  download
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              )}
              <Link
                to={`/editor?id=${active.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
               target="_blank" rel="noopener noreferrer">
                Open
              </Link>
              <button
                onClick={close}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
              >
                <X className="h-3.5 w-3.5" /> Close
              </button>
            </div>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-16 pb-8" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => step(-1)}
              className="absolute left-4 rounded-full border border-white/20 bg-white/10 p-3 text-white hover:bg-white/20"
              title="Previous (←)"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {active.image_url && (
              <img
                src={active.image_url}
                alt={active.title}
                className="max-h-[80vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
              />
            )}
            <button
              onClick={() => step(1)}
              className="absolute right-4 rounded-full border border-white/20 bg-white/10 p-3 text-white hover:bg-white/20"
              title="Next (→)"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
