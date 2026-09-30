import { Loader2 as ControlLoader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { Download, Loader2, Layers } from "@/components/EmojiIcons";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { packAssetsZip } from "@/lib/exporters/zipPack";
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

/**
 * Sibling image variants generated in the same batch (same project, same
 * asset_type, same prompt). Renders a compact strip with per-item link and
 * a "Download all as ZIP" action. Renders nothing when there is only one.
 */
export default function RelatedVariantsGrid({ asset }: { asset: any }) {
  const [siblings, setSiblings] = useState<Row[] | null>(null);
  const [zipping, setZipping] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!asset?.image_url) return;
      // Only image asset types where a batch would produce multiple visuals.
      const t = asset.asset_type;
      if (!["logo", "graphic", "icon", "photo"].includes(t)) return;

      let q = supabase
        .from("assets")
        .select("id, title, asset_type, image_url, content, meta, created_at")
        .eq("asset_type", t)
        .eq("user_id", asset.user_id)
        .not("image_url", "is", null)
        .order("created_at", { ascending: true })
        .limit(48);
      if (asset.project_id) q = q.eq("project_id", asset.project_id);
      else q = q.is("project_id", null);
      if (asset.prompt) q = q.eq("prompt", asset.prompt);

      const { data } = await q;
      if (cancelled) return;
      const rows: Row[] = (data || []).filter((r: Row) => r.id !== asset.id);
      setSiblings(rows);
    })();
    return () => { cancelled = true; };
  }, [asset?.id, asset?.image_url, asset?.asset_type, asset?.project_id, asset?.prompt, asset?.user_id]);

  if (!siblings || siblings.length === 0) return null;
  const all = [asset, ...siblings];

  const downloadZip = async () => {
    setZipping(true);
    try {
      await packAssetsZip(
        all.map((a: any) => ({
          title: a.title || "variant",
          asset_type: a.asset_type,
          image_url: a.image_url,
          content: a.content,
        })),
        `${(asset.asset_type || "assets")}-pack.zip`,
      );
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || "Could not build ZIP.", variant: "destructive" });
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <Layers className="h-3.5 w-3.5" />
          <span className="font-medium text-neutral-800">Variants in this set</span>
          <span className="text-neutral-500">· {all.length}</span>
        </div>
        <button
          onClick={downloadZip}
          disabled={zipping}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {zipping ? <ControlLoader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Download all (ZIP)
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto p-3">
        {all.map((a: any) => {
          const active = a.id === asset.id;
          return (
            <Link
              key={a.id}
              to={`/editor?id=${a.id}`}
              title={a.title}
              className={`group relative block h-20 w-20 shrink-0 overflow-hidden rounded-lg border transition ${active ? "border-brand ring-2 ring-brand/40" : "border-neutral-200 hover:border-neutral-300"}`}
             target="_blank" rel="noopener noreferrer">
              {a.image_url ? (
                <img src={a.image_url} alt={a.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-neutral-50 text-[10px] text-neutral-400">no img</div>
              )}
              {a.meta?.variant && a.meta?.of && (
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[9px] font-medium text-white">
                  {a.meta.variant}/{a.meta.of}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
