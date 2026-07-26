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

function collectColorsFromState(state: any, out: Set<string>) {
  if (!state) return;
  const push = (v: unknown) => {
    const h = normalizeHex(v);
    if (h) out.add(h);
  };
  if (state.kind === "logotype") {
    push(state.color);
    return;
  }
  if (Array.isArray(state)) {
    for (const el of state) {
      if (!el || typeof el !== "object") continue;
      push((el as any).fill);
      push((el as any).color);
      push((el as any).stroke);
      push((el as any).background);
      push((el as any).backgroundColor);
    }
  }
}

function collectColorsDeep(value: unknown, out: Set<string>, depth = 0) {
  if (depth > 5 || value == null) return;
  const direct = normalizeHex(value);
  if (direct) out.add(direct);
  if (typeof value === "string") {
    for (const match of value.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi) || []) {
      const h = normalizeHex(match);
      if (h) out.add(h);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectColorsDeep(item, out, depth + 1));
    return;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectColorsDeep(item, out, depth + 1));
  }
}

function shade(hex: string, amount: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount)));
  const to = (c: number) => c.toString(16).padStart(2, "0");
  return `#${to(mix(r))}${to(mix(g))}${to(mix(b))}`.toUpperCase();
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

async function sampleImageColors(src: string): Promise<string[]> {
  return new Promise((resolve) => {
    const finish = (hexes: string[]) => resolve(hexes);
    const run = (img: HTMLImageElement) => {
      try {
        const w = 96, h = 96;
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) return finish([]);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 200) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          // Keep every meaningful chromatic color, including small accent
          // colors from multicolor logos, while ignoring paper/ink fields that
          // otherwise dominate the sample.
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat < 0.25) continue;
          // Quantize
          const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
          const cur = buckets.get(key);
          if (cur) { cur.r += r; cur.g += g; cur.b += b; cur.count++; }
          else buckets.set(key, { r, g, b, count: 1 });
        }
        const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count).slice(0, 12);
        const to = (n: number) => n.toString(16).padStart(2, "0");
        finish(sorted.map((b) => `#${to(Math.round(b.r / b.count))}${to(Math.round(b.g / b.count))}${to(Math.round(b.b / b.count))}`.toUpperCase()));
      } catch { finish([]); }
    };
    const attempt = (crossOrigin: "anonymous" | null, url: string) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = crossOrigin;
      img.onload = () => run(img);
      img.onerror = () => finish([]);
      img.src = url;
    };
    // Try CORS first for untainted canvas
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => run(img);
    img.onerror = () => {
      fetch(src, { mode: "cors" }).then((r) => r.ok ? r.blob() : Promise.reject()).then((blob) => {
        const url = URL.createObjectURL(blob);
        attempt(null, url);
      }).catch(() => finish([]));
    };
    img.src = src;
  });
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
      const loadProject = async () => {
        let res = await supabase.from("projects").select("brand_color,meta").eq("id", projectId).maybeSingle();
        if (res.error) res = await supabase.from("projects").select("brand_color").eq("id", projectId).maybeSingle();
        return res.data || null;
      };
      const [{ data: assets }, proj] = await Promise.all([
        supabase.from("assets").select("id,editor_state,image_url,thumbnail_url,meta,content").eq("project_id", projectId),
        loadProject(),
      ]);
      if (cancelled) return;
      const set = new Set<string>();
      // Prefer the project's saved brand color; fall back to brandMeta.
      const meta = loadBrandMeta(projectId);
      const brandRaw = (proj as any)?.brand_color || (proj as any)?.meta?.brand_color || meta.brand_color;
      const brand = normalizeHex(brandRaw);
      if (brand) set.add(brand);
      collectColorsDeep((proj as any)?.meta, set);
      for (const c of meta.palette || []) {
        const h = normalizeHex(c);
        if (h) set.add(h);
      }
      // Include shades derived from the brand color so the palette mirrors
      // the Brand Book (Deep / Soft / Ink / Paper) whenever we have a brand.
      if (brand) {
        [shade(brand, -40), shade(brand, 40), "#0A0A0A", "#F5F5F4"].forEach((h) => {
          const n = normalizeHex(h);
          if (n) set.add(n);
        });
      }
      // Only saved-to-brand-kit assets are the source of truth.
      for (const a of assets || []) {
        if (!a?.meta?.saved_at) continue;
        collectColorsDeep(a.meta, set);
        collectColorsDeep(a.content, set);
        collectColorsFromState(a.editor_state, set);
      }
      setColors(Array.from(set));
      setLoading(false);
      // Enrich with dominant colors sampled from raster logo images.
      const imageSrcs = (assets || [])
        .filter((a: any) => a?.meta?.saved_at)
        .flatMap((a: any) => collectImageSources(a));
      const sampled = await Promise.all(imageSrcs.map((s: string) => sampleImageColors(s).catch(() => [])));
      if (cancelled) return;
      for (const list of sampled) {
        for (const hex of list) {
          const h = normalizeHex(hex);
          if (h) set.add(h);
        }
      }
      setColors(Array.from(set));
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