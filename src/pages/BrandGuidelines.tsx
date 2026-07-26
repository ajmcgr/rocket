import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { supabase as _sb } from "@/integrations/supabase/client";
import BrandLogotypePreview from "@/components/BrandLogotypePreview";
import AssetThumbnail from "@/components/AssetThumbnail";
import { defaultLogotypeState, LOGOTYPE_FONTS, loadGoogleFont, type LogotypeState } from "@/lib/logotype";
import { isCanvasAsset } from "@/lib/canvasAsset";
import { isBrandKitLogotypeAsset, logotypeStateFromAsset } from "@/lib/brandLogoAsset";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { loadBrandMeta } from "@/lib/brandMeta";
import { useSubscription } from "@/hooks/useSubscription";
import { pickLogoColor, isDarkBg } from "@/lib/logoContrast";
import { silhouetteImage, transparentLogo } from "@/lib/logoContrast";

const supabase = _sb as any;

function hexToRgb(hex: string) {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return { r: 10, g: 10, b: 10 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function shade(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount)));
  const to = (c: number) => c.toString(16).padStart(2, "0");
  return `#${to(mix(r))}${to(mix(g))}${to(mix(b))}`;
}

function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = /^#?([a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/i.exec(input.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length === 8) hex = hex.slice(0, 6);
  return `#${hex.toUpperCase()}`;
}

function collectColorsFromState(state: any, out: Set<string>) {
  if (!state) return;
  const push = (value: unknown) => {
    const hex = normalizeHex(value);
    if (hex) out.add(hex);
  };
  if (state.kind === "logotype") {
    push(state.color);
    return;
  }
  if (Array.isArray(state)) {
    for (const el of state) {
      push(el?.fill);
      push(el?.color);
      push(el?.stroke);
      push(el?.background);
      push(el?.backgroundColor);
    }
  }
}

function collectColorsDeep(value: unknown, out: Set<string>, depth = 0) {
  if (depth > 5 || value == null) return;
  const direct = normalizeHex(value);
  if (direct) out.add(direct);
  if (typeof value === "string") {
    for (const match of value.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi) || []) {
      const hex = normalizeHex(match);
      if (hex) out.add(hex);
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
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat < 0.25) continue;
          const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
          const cur = buckets.get(key);
          if (cur) { cur.r += r; cur.g += g; cur.b += b; cur.count++; }
          else buckets.set(key, { r, g, b, count: 1 });
        }
        const to = (n: number) => n.toString(16).padStart(2, "0");
        finish(Array.from(buckets.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 12)
          .map((bucket) => `#${to(Math.round(bucket.r / bucket.count))}${to(Math.round(bucket.g / bucket.count))}${to(Math.round(bucket.b / bucket.count))}`.toUpperCase()));
      } catch { finish([]); }
    };
    const attempt = (crossOrigin: "anonymous" | null, url: string) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = crossOrigin;
      img.onload = () => run(img);
      img.onerror = () => finish([]);
      img.src = url;
    };
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


export default function BrandGuidelines() {
  const { id: projectId } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isPro, loading: subLoading } = useSubscription();
  const [project, setProject] = useState<any>(null);
  const [savedAssets, setSavedAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [meta, setMeta] = useState(() => loadBrandMeta(projectId));
  const [sampledColors, setSampledColors] = useState<string[]>([]);
  const [imageSilhouettes, setImageSilhouettes] = useState<
    Record<string, { hasAlpha: boolean; transparent?: string; black?: string; white?: string }>
  >({});
  const pageRef = useRef<HTMLDivElement | null>(null);

  const requirePro = () => {
    if (!subLoading && !isPro) {
      toast({
        title: "Pro feature",
        description: "Brand Book downloads are available on the Pro plan. Upgrade to download PDF and PNG exports.",
      });
      navigate("/pricing");
      return true;
    }
    return false;
  };

  const loadEverything = useMemo(
    () => async () => {
      if (!projectId) return;
      setLoading(true);
      const loadProject = async () => {
        let res = await supabase
          .from("projects")
          .select("id,name,tagline,brand_color,meta")
          .eq("id", projectId)
          .maybeSingle();
        if (res.error) {
          res = await supabase
            .from("projects")
            .select("id,name,tagline")
            .eq("id", projectId)
            .maybeSingle();
        }
        return res.data || null;
      };
      const loadAssets = async () => {
        let res = await supabase
          .from("assets")
          .select("id,title,asset_type,editor_state,image_url,thumbnail_url,meta,content,created_at")
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(100);
        if (res.error) {
          res = await supabase
            .from("assets")
            .select("id,title,asset_type,editor_state,image_url,thumbnail_url,meta,content,created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(100);
        }
        return res.data || [];
      };
      const [proj, assets] = await Promise.all([loadProject(), loadAssets()]);
      setProject(proj);
      const saved = (assets || []).filter((a: any) => Boolean(a?.meta?.saved_at));
      setSavedAssets(saved);
      setMeta(loadBrandMeta(projectId));
      setLoading(false);
      const imageSrcs = saved.flatMap((asset: any) => collectImageSources(asset));
      const sampled = await Promise.all(imageSrcs.map((src: string) => sampleImageColors(src).catch(() => [])));
      setSampledColors(Array.from(new Set(sampled.flat().map((hex) => normalizeHex(hex)).filter((hex): hex is string => Boolean(hex)))));
    },
    [projectId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadEverything();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [loadEverything]);

  // Live sync: when the Brand Kit is modified anywhere (Palette / Fonts /
  // Logo save-to-kit / cross-tab storage), refresh the Brand Book.
  useEffect(() => {
    if (!projectId) return;
    const refresh = () => { loadEverything(); };
    const onNotify = (e: Event) => {
      const detail: any = (e as CustomEvent).detail || {};
      if (!detail.projectId || detail.projectId === projectId) refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.includes(`brandmeta:${projectId}`)) {
        setMeta(loadBrandMeta(projectId));
      }
    };
    window.addEventListener("rocket:notify", onNotify as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("rocket:notify", onNotify as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [projectId, loadEverything]);

  useEffect(() => { LOGOTYPE_FONTS.forEach((f) => loadGoogleFont(f.family, f.weights)); }, []);

  // === Brand Kit as source of truth ===
  const brandColor = useMemo(() => {
    // Prefer project column, fall back to brandMeta.
    const fromProject = String(project?.brand_color || "").trim();
    const fromMeta = String(meta?.brand_color || "").trim();
    const pick = fromProject || fromMeta;
    return /^#[0-9a-f]{3,8}$/i.test(pick) ? pick : "#1676e3";
  }, [project, meta]);

  const brandName = project?.name || "Brand";

  // Primary logo = first saved logotype, including clean text-only editor
  // canvases; icons/images keep using the existing visual pipeline.
  const primaryLogotype = useMemo(
    () => savedAssets.find((a) => isBrandKitLogotypeAsset(a)) || null,
    [savedAssets],
  );
  const primaryVisual = useMemo(
    () => savedAssets.find((a) => !isBrandKitLogotypeAsset(a) && (isCanvasAsset(a) || (!a?.editor_state && (a?.image_url || a?.thumbnail_url)))) || null,
    [savedAssets],
  );
  const primaryAsset = primaryLogotype || primaryVisual;
  const secondaryAsset = primaryLogotype && primaryVisual
    ? primaryVisual
    : savedAssets.filter((a) => a !== primaryAsset)[0] || null;

  const baseState = useMemo<LogotypeState>(() => {
    if (primaryLogotype) {
      return logotypeStateFromAsset(primaryLogotype, brandName);
    }
    return defaultLogotypeState(brandName);
  }, [primaryLogotype, brandName]);

  // Silhouette raster logos so they contrast against brand / dark backgrounds.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const targets = savedAssets
        .filter((a) => !a?.editor_state && (a?.image_url || a?.thumbnail_url))
        .filter((a) => !imageSilhouettes[a.id]);
      for (const a of targets) {
        const url = a.image_url || a.thumbnail_url;
        try {
          const [transparent, black, white] = await Promise.all([
            transparentLogo(url),
            silhouetteImage(url, "#0A0A0A"),
            silhouetteImage(url, "#FFFFFF"),
          ]);
          if (cancelled) return;
          setImageSilhouettes((prev) => ({
            ...prev,
            [a.id]: {
              hasAlpha: transparent.hasTransparency || black.hasAlpha,
              transparent: transparent.url,
              black: black.url,
              white: white.url,
            },
          }));
        } catch {
          if (!cancelled) {
            setImageSilhouettes((prev) => ({ ...prev, [a.id]: { hasAlpha: false } }));
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [savedAssets, imageSilhouettes]);

  // Pick the correct rendering for an asset given a background hex.
  const renderAssetOn = (asset: any, bg: string, size: "lg" | "md" = "lg") => {
    if (!asset) return null;
    if (isBrandKitLogotypeAsset(asset)) {
      return <BrandLogotypePreview asset={asset} color={pickLogoColor(bg)} fallback={brandName} />;
    }
    if (isCanvasAsset(asset)) {
      return <AssetThumbnail asset={asset} background={bg} logoColor={bg === "#0A0A0A" ? pickLogoColor(bg) : undefined} className="h-full w-full object-contain" />;
    }
    const url = asset.image_url || asset.thumbnail_url;
    const sil = imageSilhouettes[asset.id];
    // Prefer the background-keyed transparent source so the icon keeps its
    // real colors while sitting cleanly on any tile.
    const src = sil?.transparent || url;
    return (
      <img
        src={src}
        alt={brandName}
        className={`max-w-full object-contain ${size === "lg" ? "max-h-full" : "max-h-full"}`}
      />
    );
  };

  // Palette: prefer saved Brand Kit palette, fall back to shades of brand color.
  const palette = useMemo(() => {
    const collected = new Set<string>();
    collectColorsDeep((project as any)?.meta, collected);
    collectColorsDeep(meta.palette, collected);
    collectColorsDeep(meta.brand_color, collected);
    collectColorsDeep(brandColor, collected);
    collectColorsDeep(sampledColors, collected);
    savedAssets.forEach((asset) => {
      collectColorsDeep(asset?.meta, collected);
      collectColorsDeep(asset?.content, collected);
      collectColorsFromState(asset?.editor_state, collected);
    });
    const saved = Array.from(collected);
    if (saved.length >= 3) {
      const labels = ["Primary", "Secondary", "Accent", "Highlight", "Support"];
      const items = saved.slice(0, 8).map((hex, i) => ({ name: labels[i] || `Color ${i + 1}`, hex }));
      // Always include ink + paper neutrals for practical usage.
      if (!items.some((item) => item.hex.toLowerCase() === "#0a0a0a")) items.push({ name: "Ink", hex: "#0A0A0A" });
      if (items.length < 5) items.push({ name: "Paper", hex: "#F5F5F4" });
      return items.slice(0, 8);
    }
    return [
      { name: "Primary", hex: brandColor },
      { name: "Deep", hex: shade(brandColor, -40) },
      { name: "Soft", hex: shade(brandColor, 40) },
      { name: "Ink", hex: "#0A0A0A" },
      { name: "Paper", hex: "#F5F5F4" },
    ];
  }, [meta, brandColor, project, savedAssets, sampledColors]);

  // Fonts: prefer the actual font on the saved primary logotype (kept live
  // in sync with /editor edits). Fall back to Brand Kit meta.font, then Inter.
  const primaryFont = useMemo(() => {
    return baseState.font || meta.font || "Inter";
  }, [meta, baseState]);
  const secondaryFont = useMemo(() => {
    const others = savedAssets
      .map((a) => a?.editor_state?.font)
      .filter((f): f is string => typeof f === "string" && !!f)
      .filter((f) => f.toLowerCase() !== primaryFont.toLowerCase());
    return others[0] || null;
  }, [savedAssets, primaryFont]);
  const primaryFontMeta = LOGOTYPE_FONTS.find((f) => f.family.toLowerCase() === primaryFont.toLowerCase());
  const secondaryFontMeta = secondaryFont
    ? LOGOTYPE_FONTS.find((f) => f.family.toLowerCase() === secondaryFont.toLowerCase())
    : null;
  useEffect(() => {
    if (secondaryFont) {
      const m = LOGOTYPE_FONTS.find((f) => f.family.toLowerCase() === secondaryFont.toLowerCase());
      if (m) loadGoogleFont(m.family, m.weights);
      else loadGoogleFont(secondaryFont, [400, 700]);
    }
  }, [secondaryFont]);
  useEffect(() => {
    if (primaryFont) {
      const m = LOGOTYPE_FONTS.find((f) => f.family.toLowerCase() === primaryFont.toLowerCase());
      if (m) loadGoogleFont(m.family, m.weights);
      else loadGoogleFont(primaryFont, [400, 700]);
    }
  }, [primaryFont]);

  const download = async () => {
    if (requirePro()) return;
    if (!pageRef.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(pageRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
      const a = document.createElement("a");
      const safe = (project?.name || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      a.href = dataUrl;
      a.download = `${safe}-brand-guidelines.png`;
      a.click();
      toast({ title: "Brand guidelines downloaded" });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (requirePro()) return;
    if (!pageRef.current) return;
    setBusyPdf(true);
    try {
      const dataUrl = await toPng(pageRef.current, { pixelRatio: 3, cacheBust: true, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(dataUrl, "PNG", 0, 0, pageW, pageH);
      const safe = (project?.name || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      pdf.save(`${safe}-brand-guidelines.pdf`);
      toast({ title: "Brand guidelines PDF downloaded" });
    } catch (e: any) {
      toast({ title: "PDF export failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setBusyPdf(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Brand Book</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            A one-page brand book that pulls together your logo, colors, and typography.
          </p>
        </div>
        <button
          onClick={downloadPdf}
          disabled={busyPdf || loading || subLoading}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-sm font-medium text-brand-foreground transition hover:bg-brand-hover disabled:opacity-50"
        >
          {busyPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download PDF
          {!subLoading && !isPro && (
            <span className="ml-1 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Pro</span>
          )}
        </button>
        <button
          onClick={download}
          disabled={busy || loading || subLoading}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download PNG
          {!subLoading && !isPro && (
            <span className="ml-1 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Pro</span>
          )}
        </button>
      </div>

      {loading ? (
        <Skeleton className="aspect-[8.5/11] w-full rounded-2xl" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
          <div
            ref={pageRef}
            className="mx-auto aspect-[8.5/11] w-full bg-white p-10"
            style={{ maxWidth: 900 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-neutral-200 pb-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">Brand Book</div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900">{brandName}</div>
                {project?.tagline ? (
                  <div className="mt-1 text-sm text-neutral-500">{project.tagline}</div>
                ) : null}
              </div>
              <div className="text-right text-[10px] uppercase tracking-[0.2em] text-neutral-400">
                v1.0<br />
                {new Date().toLocaleDateString(undefined, { month: "short", year: "numeric" })}
              </div>
            </div>

            {/* Logo showcase */}
            <section className="mt-8">
              <div className="mb-3 text-[10px] uppercase tracking-[0.3em] text-neutral-500">Logo</div>
              {primaryAsset ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex h-40 items-center justify-center rounded-xl border border-neutral-200 bg-white px-6">
                    {renderAssetOn(primaryAsset, "#FFFFFF")}
                  </div>
                  <div
                    className="flex h-40 items-center justify-center rounded-xl px-6"
                    style={{ background: brandColor }}
                  >
                    {renderAssetOn(primaryAsset, brandColor)}
                  </div>
                  {secondaryAsset ? (
                    <>
                      <div className="flex h-40 items-center justify-center rounded-xl border border-neutral-200 bg-white px-6">
                        {renderAssetOn(secondaryAsset, "#FFFFFF")}
                      </div>
                      <div className="flex h-40 items-center justify-center rounded-xl px-6" style={{ background: "#0A0A0A" }}>
                        {renderAssetOn(secondaryAsset, "#0A0A0A")}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-6 text-sm text-neutral-500">
                  Save a logo into your Brand Kit to see it here.
                </div>
              )}
            </section>

            {/* Palette */}
            <section className="mt-8">
              <div className="mb-3 text-[10px] uppercase tracking-[0.3em] text-neutral-500">Color palette</div>
              <div className="grid grid-cols-4 gap-3">
                {palette.map((c) => (
                  <div key={c.name} className="overflow-hidden rounded-xl border border-neutral-200">
                    <div className="h-16 w-full" style={{ background: c.hex }} />
                    <div className="px-2 py-1.5">
                      <div className="text-[11px] font-semibold text-neutral-900">{c.name}</div>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{c.hex}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Typography */}
            <section className="mt-8">
              <div className="mb-3 text-[10px] uppercase tracking-[0.3em] text-neutral-500">Typography</div>
              <div className="space-y-3">
                <div className="rounded-xl border border-neutral-200 p-5">
                  <div className="flex items-baseline justify-between">
                    <div
                      className="text-4xl tracking-tight text-neutral-900"
                      style={{ fontFamily: `'${primaryFont}', system-ui` }}
                    >
                      {primaryFont}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                      Primary · {primaryFontMeta?.category || "sans"}
                    </div>
                  </div>
                  <div className="mt-3 text-neutral-700" style={{ fontFamily: `'${primaryFont}', system-ui` }}>
                    Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz 0123456789
                  </div>
                  <div className="mt-3 text-sm text-neutral-500" style={{ fontFamily: `'${primaryFont}', system-ui` }}>
                    The quick brown fox jumps over the lazy dog.
                  </div>
                </div>
                {secondaryFont ? (
                  <div className="rounded-xl border border-neutral-200 p-5">
                    <div className="flex items-baseline justify-between">
                      <div
                        className="text-3xl tracking-tight text-neutral-900"
                        style={{ fontFamily: `'${secondaryFont}', system-ui` }}
                      >
                        {secondaryFont}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                        Secondary · {secondaryFontMeta?.category || "sans"}
                      </div>
                    </div>
                    <div className="mt-3 text-neutral-700" style={{ fontFamily: `'${secondaryFont}', system-ui` }}>
                      Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz 0123456789
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {/* Footer */}
            <div className="mt-10 flex items-center justify-between border-t border-neutral-200 pt-4 text-[10px] uppercase tracking-[0.3em] text-neutral-400">
              <span>{brandName} · Brand Book</span>
              <span>Made with Rocket</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}