import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { Logotype, logotypeToPng } from "@/components/Logotype";
import BrandLogotypePreview from "@/components/BrandLogotypePreview";
import AssetThumbnail from "@/components/AssetThumbnail";
import { defaultLogotypeState, type LogotypeState } from "@/lib/logotype";
import { isCanvasAsset } from "@/lib/canvasAsset";
import {
  brandLogotypeToPng,
  canvasLogoLockupIconElements,
  canvasLogoLockupTextElements,
  isBrandKitLogotypeAsset,
  isCanvasLogoLockupAsset,
  logotypeLabel,
} from "@/lib/brandLogoAsset";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/useSubscription";
import { pickLogoColor, isDarkBg, silhouetteImage, transparentLogo } from "@/lib/logoContrast";
import { createCanvasElementsPreview } from "@/lib/previewThumbnail";

const supabase = _sb as any;

type Shape = "circle" | "rounded" | "square";

type Variant = {
  key: string;
  label: string;
  shape: Shape;
  bg: string;
  fg: string;
  border?: boolean;
};

const buildVariants = (brandColor: string): Variant[] => {
  // Inverse tiles use a neutral light-grey background so the original brand
  // artwork always reads clearly regardless of the brand color.
  const neutral = "#E5E7EB";
  const onLightPaper = isDarkBg(brandColor) ? brandColor : "#0A0A0A";
  return [
    { key: "circle-brand", label: "Circle · Inverse", shape: "circle", bg: neutral, fg: onLightPaper, border: true },
    { key: "circle-white", label: "Circle · Light", shape: "circle", bg: "#FFFFFF", fg: onLightPaper, border: true },
    { key: "circle-black", label: "Circle · Dark", shape: "circle", bg: "#0A0A0A", fg: "#FFFFFF" },
    { key: "rounded-brand", label: "Rounded · Inverse", shape: "rounded", bg: neutral, fg: onLightPaper, border: true },
    { key: "rounded-white", label: "Rounded · Light", shape: "rounded", bg: "#FFFFFF", fg: onLightPaper, border: true },
    { key: "rounded-black", label: "Rounded · Dark", shape: "rounded", bg: "#0A0A0A", fg: "#FFFFFF" },
    { key: "square-brand", label: "Square · Inverse", shape: "square", bg: neutral, fg: onLightPaper, border: true },
    { key: "square-white", label: "Square · Light", shape: "square", bg: "#FFFFFF", fg: onLightPaper, border: true },
  ];
};

const safeName = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "icon";

function shapeRadius(shape: Shape, size: number) {
  if (shape === "circle") return size / 2;
  if (shape === "rounded") return Math.round(size * 0.22);
  return 0;
}

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function renderIconPng(state: LogotypeState, v: Variant, size = 1024): Promise<Blob> {
  const logoUrl = await logotypeToPng({ ...state, color: v.fg }, 4);
  const img = await loadImage(logoUrl);
  return await composeIcon(img, v, size);
}

async function renderBrandLogotypeIconPng(asset: any, v: Variant, fallback: string, size = 1024): Promise<Blob> {
  const logoUrl = await brandLogotypeToPng(asset, v.fg, fallback, 4);
  const img = await loadImage(logoUrl);
  return await composeIcon(img, v, size);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const attempt = (crossOrigin: "anonymous" | null, url: string) =>
    new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = crossOrigin;
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  try { return await attempt("anonymous", src); } catch {}
  try {
    const res = await fetch(src, { mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try { return await attempt(null, objectUrl); } finally {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    }
  } catch {}
  return attempt(null, src);
}

async function renderImageIconPng(src: string, v: Variant, size = 1024): Promise<Blob> {
  // Key out any solid background so the logo can sit on the tile while
  // preserving its original colors (matches wordmark treatment).
  const { url } = await transparentLogo(src);
  const img = await loadImage(url);
  return await composeIcon(img, v, size);
}

async function renderCanvasIconPng(asset: any, v: Variant, size = 1024): Promise<Blob> {
  const dataUrl = await createCanvasElementsPreview(asset.editor_state as any, {
    outputWidth: 1200,
    outputHeight: 1200,
    paddingRatio: 0.16,
    logoColor: v.bg === "#0A0A0A" ? v.fg : undefined,
    normalizeLogoLockup: asset?.meta?.kind === "logo_lockup" || isCanvasLogoLockupAsset(asset),
  });
  const img = await loadImage(dataUrl);
  return await composeIcon(img, v, size);
}

function visibleImageRect(img: HTMLImageElement) {
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, w, h };
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return { x: 0, y: 0, w, h }; }
  const distance = (offset: number, rgb: [number, number, number]) => Math.max(
    Math.abs(data[offset] - rgb[0]),
    Math.abs(data[offset + 1] - rgb[1]),
    Math.abs(data[offset + 2] - rgb[2]),
  );
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (w * h - 1) * 4];
  const rgb: [number, number, number] = [data[0], data[1], data[2]];
  const hasPaper = data[3] > 235 && corners.every((offset) => data[offset + 3] > 235 && distance(offset, rgb) <= 36);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const offset = (y * w + x) * 4;
      if (data[offset + 3] <= 18) continue;
      if (hasPaper && distance(offset, rgb) <= 44) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, w, h };
  const pad = Math.ceil(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.015);
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const right = Math.min(w - 1, maxX + pad);
  const bottom = Math.min(h - 1, maxY + pad);
  return { x, y, w: Math.max(1, right - x + 1), h: Math.max(1, bottom - y + 1) };
}

async function composeIcon(img: HTMLImageElement, v: Variant, size: number): Promise<Blob> {

  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = shapeRadius(v.shape, size);

  // shape path
  ctx.beginPath();
  if (v.shape === "circle") {
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  } else if (v.shape === "rounded") {
    const rr = r;
    ctx.moveTo(rr, 0);
    ctx.lineTo(size - rr, 0);
    ctx.quadraticCurveTo(size, 0, size, rr);
    ctx.lineTo(size, size - rr);
    ctx.quadraticCurveTo(size, size, size - rr, size);
    ctx.lineTo(rr, size);
    ctx.quadraticCurveTo(0, size, 0, size - rr);
    ctx.lineTo(0, rr);
    ctx.quadraticCurveTo(0, 0, rr, 0);
  } else {
    ctx.rect(0, 0, size, size);
  }
  ctx.closePath();
  ctx.fillStyle = v.bg;
  ctx.fill();

  // fit logo with padding
  const pad = Math.round(size * 0.18);
  const maxW = size - pad * 2;
  const maxH = size - pad * 2;
  const rect = visibleImageRect(img);
  const scale = Math.min(maxW / rect.w, maxH / rect.h);
  const w = rect.w * scale;
  const h = rect.h * scale;
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, (size - w) / 2, (size - h) / 2, w, h);

  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
}

function derivedCanvasAsset(asset: any, editorState: any[], suffix: string, assetType: string) {
  return {
    ...asset,
    id: `${asset.id || safeName(asset.title || assetType)}:${suffix}`,
    title: `${asset.title || asset.asset_type || "logo"} ${suffix === "icon-only" ? "Icon" : "Logotype"}`,
    asset_type: assetType,
    image_url: null,
    thumbnail_url: null,
    editor_state: editorState,
    meta: { ...(asset.meta || {}), derived_from: asset.id, derived_kind: suffix, preview_url: null },
  };
}

function expandSocialAssets(assets: any[]) {
  const expanded: any[] = [];
  for (const asset of assets) {
    expanded.push(asset);
    const iconElements = canvasLogoLockupIconElements(asset);
    if (iconElements) expanded.push(derivedCanvasAsset(asset, iconElements, "icon-only", "icon"));
    const textElements = canvasLogoLockupTextElements(asset);
    if (textElements) expanded.push(derivedCanvasAsset(asset, textElements, "logotype-only", "logotype"));
  }
  return expanded;
}

export default function SocialIcons() {
  const { id: projectId } = useParams();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [logoAssets, setLogoAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Per-asset silhouettes keyed by ink color ("#0A0A0A" or "#FFFFFF") so image
  // logos automatically render in the right ink on each background.
  const [silhouettes, setSilhouettes] = useState<Record<string, { transparent?: string; black?: string; white?: string; hasAlpha: boolean }>>({});

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: proj }, { data: assets }] = await Promise.all([
        supabase.from("projects").select("id,name,brand_color").eq("id", projectId).maybeSingle(),
        supabase
          .from("assets")
          .select("id,title,asset_type,editor_state,image_url,thumbnail_url,meta,created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (cancelled) return;
      setProject(proj || null);
      // Mirror the Brand Kit filter: only designs the user explicitly saved.
      const kit = (assets || []).filter((a: any) => Boolean(a?.meta?.saved_at));
      setLogoAssets(expandSocialAssets(kit));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const brandColor = useMemo(() => {
    const c = String(project?.brand_color || "").trim();
    return /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#1676e3";
  }, [project]);

  const variants = useMemo(() => buildVariants(brandColor), [brandColor]);

  // Build black/white silhouettes for every image-based logo so previews
  // never render a dark logo on dark or light-on-light.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, { transparent?: string; black?: string; white?: string; hasAlpha: boolean }> = {};
      for (const a of logoAssets) {
        const src = isBrandKitLogotypeAsset(a) ? null : (a?.image_url || a?.thumbnail_url || null);
        if (!src) continue;
        try {
          const [transparent, black, white] = await Promise.all([
            transparentLogo(src),
            silhouetteImage(src, "#0A0A0A"),
            silhouetteImage(src, "#FFFFFF"),
          ]);
          if (cancelled) return;
          next[a.id] = {
            hasAlpha: transparent.hasTransparency || black.hasAlpha,
            transparent: transparent.url,
            black: black.url,
            white: white.url,
          };
        } catch {
          // ignore — fall back to original
        }
      }
      if (!cancelled) setSilhouettes(next);
    })();
    return () => { cancelled = true; };
  }, [logoAssets]);

  const { isPro, loading: subLoading } = useSubscription();
  const requirePro = () => {
    if (!subLoading && !isPro) {
      toast({
        title: "Upgrade to Pro to download",
        description: "Social icon downloads are available on the Pro plan.",
      });
      return true;
    }
    return false;
  };

  const stateForAsset = (asset: any): LogotypeState => {
    if (asset?.editor_state?.kind === "logotype") return asset.editor_state as LogotypeState;
    return defaultLogotypeState(asset?.title || project?.name || "Brand");
  };
  const imageSrcForAsset = (asset: any): string | null => {
    if (isBrandKitLogotypeAsset(asset) || isCanvasAsset(asset)) return null;
    return asset?.image_url || asset?.thumbnail_url || null;
  };
  const renderVariantForAsset = async (asset: any, v: Variant): Promise<Blob> => {
    if (isBrandKitLogotypeAsset(asset)) return renderBrandLogotypeIconPng(asset, v, project?.name || "Brand");
    const src = imageSrcForAsset(asset);
    if (src) return renderImageIconPng(src, v);
    if (isCanvasAsset(asset)) return renderCanvasIconPng(asset, v);
    return renderIconPng(stateForAsset(asset), v);
  };
  const assetLabel = (asset: any) =>
    isBrandKitLogotypeAsset(asset) ? logotypeLabel(asset, project?.name || "Brand") : asset?.title || project?.name || "Brand";

  const handleDownload = async (asset: any, v: Variant) => {
    if (requirePro()) return;
    const key = `${asset.id}:${v.key}`;
    setBusy(key);
    try {
      const blob = await renderVariantForAsset(asset, v);
      downloadBlob(blob, `${safeName(assetLabel(asset))}-social-${v.key}.png`);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    if (requirePro()) return;
    setBusy("all");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const asset of logoAssets) {
        const folder = zip.folder(safeName(assetLabel(asset))) || zip;
        for (const v of variants) {
          const blob = await renderVariantForAsset(asset, v);
          folder.file(`${safeName(assetLabel(asset))}-social-${v.key}.png`, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, `${safeName(project?.name || "brand")}-social-icons.zip`);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Social Icons</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Download square profile icons sized for social media in every shape and color.
          </p>
        </div>
        {logoAssets.length > 0 ? (
          <button
            onClick={downloadAll}
            disabled={busy === "all"}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground transition hover:bg-brand-hover disabled:opacity-60"
          >
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download all
            {!subLoading && !isPro && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">PRO</span>
            )}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-2xl" />
          ))}
        </div>
      ) : logoAssets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <p className="text-sm text-neutral-600">No logo saved for this brand yet.</p>
          <Link
            to="/wizard"
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition hover:bg-brand-hover"
          >
            Generate a logo
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {logoAssets.map((asset) => {
                    const imgSrc = imageSrcForAsset(asset);
            const state = stateForAsset(asset);
                    const isBrandLogotype = isBrandKitLogotypeAsset(asset);
                    const isCanvas = isCanvasAsset(asset) && !isBrandLogotype;
            return (
              <section key={asset.id}>
                <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500">
                  {assetLabel(asset)}
                </h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {variants.map((v) => {
                    const isDark = v.bg !== "#FFFFFF";
                    const radius = v.shape === "circle" ? "9999px" : v.shape === "rounded" ? "22%" : "0px";
                    const iconState: LogotypeState = { ...state, color: v.fg };
                    const bkey = `${asset.id}:${v.key}`;
                    const sil = silhouettes[asset.id];
                    // Prefer the background-keyed (transparent) source so the
                    // logo keeps its colors on top of the tile. Fall back to
                    // silhouettes only if the source truly has no alpha.
                    const previewSrc = imgSrc
                      ? (sil?.transparent || imgSrc)
                      : null;
                    return (
                      <div key={v.key} className="flex flex-col gap-2">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                          {v.label}
                        </div>
                        <div
                          className={`relative overflow-hidden shadow-[0_10px_40px_-20px_rgba(15,23,42,0.15)] ${v.border ? "ring-1 ring-neutral-200" : ""}`}
                          style={{ backgroundColor: v.bg, borderRadius: radius, aspectRatio: "1 / 1" }}
                        >
                        <div className="flex h-full w-full items-center justify-center p-[18%]">
                          {isBrandLogotype ? (
                            <BrandLogotypePreview asset={asset} color={v.fg} fallback={project?.name || "Brand"} />
                          ) : isCanvas ? (
                            <AssetThumbnail asset={asset} background={v.bg} logoColor={v.bg === "#0A0A0A" ? v.fg : undefined} className="h-full w-full object-contain" />
                          ) : previewSrc ? (
                            <img
                              src={previewSrc}
                              alt=""
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <Logotype state={iconState} fit="contain" />
                          )}
                        </div>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                          <button
                            onClick={() => handleDownload(asset, v)}
                            disabled={busy === bkey}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm transition ${
                              isDark ? "bg-white/95 text-neutral-900 hover:bg-white" : "bg-neutral-900 text-white hover:bg-neutral-800"
                            } disabled:opacity-60`}
                          >
                            {busy === bkey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            PNG
                          </button>
                        </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}