import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Copy } from "lucide-react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { loadBrandMeta } from "@/lib/brandMeta";

const supabase = _sb as any;

function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length === 8) hex = hex.slice(0, 6);
  return `#${hex.toUpperCase()}`;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

type Bucket = { r: number; g: number; b: number; count: number };

function isInkBucket(color: { r: number; g: number; b: number }) {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lightness = (max + min) / 510;
  return lightness < 0.28 && sat < 0.35;
}

function shouldSamplePixel(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lightness = (max + min) / 510;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  // Palette is for foreground logo colors only: keep vivid brand colors and
  // dark wordmark ink, but ignore pale tile backgrounds / soft AA washes.
  if (isInkBucket({ r, g, b })) return true;
  if (lightness > 0.78 || lum > 0.9) return false;
  if (sat < 0.25) return false;
  return true;
}

async function sampleImageBuckets(src: string): Promise<Bucket[]> {
  return new Promise((resolve) => {
    const finish = (b: Bucket[]) => resolve(b);
    const run = (img: HTMLImageElement) => {
      try {
        const w = 128, h = 128;
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) return finish([]);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const buckets = new Map<string, Bucket>();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 200) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (!shouldSamplePixel(r, g, b)) continue;
          const key = isInkBucket({ r, g, b }) ? "ink" : `${r >> 4}-${g >> 4}-${b >> 4}`;
          const cur = buckets.get(key);
          if (cur) { cur.r += r; cur.g += g; cur.b += b; cur.count++; }
          else buckets.set(key, { r, g, b, count: 1 });
        }
        finish(Array.from(buckets.values()));
      } catch { finish([]); }
    };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => run(img);
    img.onerror = () => {
      fetch(src, { mode: "cors" }).then((r) => r.ok ? r.blob() : Promise.reject()).then((blob) => {
        const url = URL.createObjectURL(blob);
        const i2 = new Image();
        i2.onload = () => run(i2);
        i2.onerror = () => finish([]);
        i2.src = url;
      }).catch(() => finish([]));
    };
    img.src = src;
  });
}

// Merge similar buckets into distinct final logo colors.
function clusterBuckets(buckets: Bucket[], maxColors = 6): string[] {
  const avg = buckets.map((b) => ({
    r: b.r / b.count,
    g: b.g / b.count,
    b: b.b / b.count,
    count: b.count,
  }));
  avg.sort((a, b) => b.count - a.count);
  const totalCount = avg.reduce((s, b) => s + b.count, 0) || 1;
  const clusters: { r: number; g: number; b: number; count: number }[] = [];
  const dist2 = (a: any, b: any) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
  const THRESH = 55 * 55; // merge visually-similar colors
  for (const p of avg) {
    const near = clusters.find((c) => dist2(c, p) < THRESH);
    if (near) {
      const total = near.count + p.count;
      near.r = (near.r * near.count + p.r * p.count) / total;
      near.g = (near.g * near.count + p.g * p.count) / total;
      near.b = (near.b * near.count + p.b * p.count) / total;
      near.count = total;
    } else {
      clusters.push({ ...p });
    }
  }
  // Drop tiny clusters (< 0.5% of pixels) that are usually AA fringe.
  // Wordmark text can be small relative to the icon, so keep a low floor.
  const kept = clusters.filter((c) => isInkBucket(c) ? c.count / totalCount >= 0.0005 : c.count / totalCount >= 0.005);
  kept.sort((a, b) => b.count - a.count);
  const to = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  const picked = kept.slice(0, maxColors);
  const ink = kept.find((c) => isInkBucket(c));
  if (ink && !picked.some((c) => isInkBucket(c))) {
    if (picked.length >= maxColors) picked[picked.length - 1] = ink;
    else picked.push(ink);
  }
  return picked.map((c) => isInkBucket(c) ? "#0A0A0A" : `#${to(c.r)}${to(c.g)}${to(c.b)}`.toUpperCase());
}

function collectImageSources(asset: any): string[] {
  const editorSources = Array.isArray(asset?.editor_state)
    ? asset.editor_state.map((el: any) => el?.src).filter((src: unknown): src is string => typeof src === "string" && src.length > 0)
    : [];
  const candidates = [
    asset?.image_url,
    asset?.thumbnail_url,
    asset?.meta?.preview_url,
    asset?.meta?.source_url,
    asset?.meta?.original_url,
    asset?.meta?.image_url,
    asset?.meta?.thumbnail_url,
    ...editorSources,
  ];
  return Array.from(new Set(candidates.filter((src): src is string => typeof src === "string" && src.length > 0)));
}

export default function PaletteExplorer() {
  const { id: projectId } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [colors, setColors] = useState<string[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: assets } = await supabase
        .from("assets")
        .select("id,editor_state,image_url,thumbnail_url,meta,content")
        .eq("project_id", projectId);
      if (cancelled) return;
      // Sample dominant colors from the final saved logo/icon images only —
      // the palette must reflect what actually appears in the artwork.
      const imageSrcs = (assets || [])
        .filter((a: any) => a?.meta?.saved_at)
        .flatMap((a: any) => collectImageSources(a));
      const bucketLists = await Promise.all(
        imageSrcs.map((s: string) => sampleImageBuckets(s).catch(() => [] as Bucket[])),
      );
      if (cancelled) return;
      const all: Bucket[] = bucketLists.flat();
      const final = clusterBuckets(all, 6);
      setColors(final);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      toast({ title: `Copied ${hex}` });
    } catch {}
  };

  const empty = !loading && colors.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Palette</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Colors used by the logos and icons in this brand kit.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-2xl" />
          ))}
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
          No colors yet. Save a logo or icon to your brand kit to populate the palette.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {colors.map((hex) => {
            const isLight = luminance(hex) > 0.6;
            return (
              <button
                key={hex}
                onClick={() => copy(hex)}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left shadow-[0_10px_40px_-20px_rgba(15,23,42,0.15)]"
              >
                <div className="flex aspect-[4/3] items-end justify-between px-5 py-4" style={{ backgroundColor: hex }}>
                  <span className={`text-xs font-medium tracking-wide ${isLight ? "text-neutral-800" : "text-white/90"}`}>
                    {hex}
                  </span>
                  <Copy className={`h-4 w-4 opacity-0 transition group-hover:opacity-100 ${isLight ? "text-neutral-800" : "text-white"}`} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}