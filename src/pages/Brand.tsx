import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Download, Loader2, X } from "lucide-react";
import jsPDF from "jspdf";
import { supabase as _sb } from "@/integrations/supabase/client";
import { Logotype, logotypeToPng, logotypeToSvg } from "@/components/Logotype";
import { defaultLogotypeState, type LogotypeState } from "@/lib/logotype";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const supabase = _sb as any;

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return message.includes(column.toLowerCase()) && (
    message.includes("column")
    || message.includes("schema cache")
    || message.includes("could not find")
  );
};

// Try to detect and use alpha channel to render silhouettes of raster logos.
// If the source PNG has no meaningful transparency, silhouette effects can't
// be derived — we fall back to displaying the original logo on the variant's
// background so cards never render as solid rectangles.
async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load logo image"));
    img.src = src;
  });
  return img;
}

function hasAlpha(img: HTMLImageElement): { alpha: boolean; canvas: HTMLCanvasElement } | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparentPixels = 0;
    // Sample every 4th pixel for speed.
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] < 250) transparentPixels++;
      if (transparentPixels > 20) return { alpha: true, canvas };
    }
    return { alpha: false, canvas };
  } catch {
    return null;
  }
}

function silhouetteDataUrl(img: HTMLImageElement, color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function useImageVariants(url: string | undefined) {
  const [variants, setVariants] = useState<{ black?: string; white?: string; hasAlpha: boolean } | null>(null);
  useEffect(() => {
    if (!url) { setVariants(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const img = await loadImage(url);
        if (cancelled) return;
        const info = hasAlpha(img);
        if (!info || !info.alpha) { setVariants({ hasAlpha: false }); return; }
        setVariants({
          hasAlpha: true,
          black: silhouetteDataUrl(img, "#0A0A0A"),
          white: silhouetteDataUrl(img, "#FFFFFF"),
        });
      } catch {
        if (!cancelled) setVariants({ hasAlpha: false });
      }
    })();
    return () => { cancelled = true; };
  }, [url]);
  return variants;
}


type Variant = {
  key: "regular" | "inverse" | "black" | "white";
  label: string;
  bg: string;
  fg: string;
  chipClass: string;
  border?: string;
};

const safeName = (s: string) =>
  s.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "logo";

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function downloadPng(state: LogotypeState, filename: string) {
  const dataUrl = await logotypeToPng(state, 4);
  const res = await fetch(dataUrl);
  downloadBlob(await res.blob(), `${filename}.png`);
}

function downloadSvg(state: LogotypeState, filename: string) {
  const svg = logotypeToSvg(state);
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${filename}.svg`);
}

async function downloadPdf(state: LogotypeState, filename: string, bg: string) {
  const dataUrl = await logotypeToPng(state, 4);
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = dataUrl;
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const pdf = new jsPDF({ orientation: w >= h ? "landscape" : "portrait", unit: "pt", format: [w, h] });
  if (bg && bg.toLowerCase() !== "#ffffff") {
    pdf.setFillColor(bg);
    pdf.rect(0, 0, w, h, "F");
  }
  pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
  pdf.save(`${filename}.pdf`);
}

export default function Brand() {
  const { id: projectId } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  if (!projectId) return <Navigate to="/brands" replace />;

  const [project, setProject] = useState<any>(null);
  const [logoAsset, setLogoAsset] = useState<any>(null);
  const [logoAssets, setLogoAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [section, setSection] = useState<string>("logo-files");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const loadProject = async () => {
        const result = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
        if (result.error) {
          console.error("Failed to load brand", result.error);
          return null;
        }
        if (user?.id && result.data?.user_id && result.data.user_id !== user.id) return null;
        return result.data || null;
      };
      const loadAssets = async () => {
        let result = await supabase
          .from("assets")
          .select("id,title,asset_type,editor_state,image_url,thumbnail_url,meta,created_at")
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error && isMissingColumnError(result.error, "deleted_at")) {
          result = await supabase
            .from("assets")
            .select("id,title,asset_type,editor_state,image_url,thumbnail_url,meta,created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(100);
        }
        return result.data || [];
      };
      const [proj, pAssets] = await Promise.all([loadProject(), loadAssets()]);
      if (cancelled) return;
      setProject(proj || null);
      const isLogo = (a: any) => {
        const t = String(a?.asset_type || "").toLowerCase();
        if (["logo", "logotype", "wordmark", "brandmark", "icon", "app_icon", "favicon", "graphic", "photo", "image"].includes(t)) return true;
        if (a?.editor_state?.kind === "logotype") return true;
        // Anything visual saved into this project counts as its logo mark.
        if (a?.image_url || a?.thumbnail_url) return true;
        return false;
      };
      let logos = (pAssets || []).filter(Boolean).filter(isLogo);
      // Only include designs the user explicitly saved (starred). Generated but
      // un-saved chat outputs share the project_id but should not clutter the kit.
      logos = logos.filter((a: any) => Boolean(a?.meta?.saved_at));
      // No cross-project fallback: only show what's actually in this brand kit.
      if (cancelled) return;
      setLogoAssets(logos);
      const withState = logos.find((a: any) => a?.editor_state?.kind === "logotype");
      setLogoAsset(withState || logos[0] || null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, user?.id]);

  const brandColor = useMemo(() => {
    const c = String(project?.brand_color || "").trim();
    return /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#1676e3";
  }, [project]);

  const baseState = useMemo<LogotypeState>(() => {
    if (logoAsset?.editor_state?.kind === "logotype") return logoAsset.editor_state as LogotypeState;
    return defaultLogotypeState(project?.name || logoAsset?.title || "Brand");
  }, [logoAsset, project]);

  const logoIsImage = !logoAsset?.editor_state && Boolean(logoAsset?.image_url || logoAsset?.thumbnail_url);
  const logoImageUrl = logoAsset?.image_url || logoAsset?.thumbnail_url;
  const imageVariants = useImageVariants(logoIsImage ? logoImageUrl : undefined);

  const variants = useMemo<Record<Variant["key"], LogotypeState>>(
    () => ({
      regular: { ...baseState, color: baseState.color || "#0A0A0A" },
      inverse: { ...baseState, color: "#FFFFFF" },
      black: { ...baseState, color: "#0A0A0A" },
      white: { ...baseState, color: "#FFFFFF" },
    }),
    [baseState],
  );

  const cards: Variant[] = [
    { key: "regular", label: "Regular", bg: "#FFFFFF", fg: "#0A0A0A", chipClass: "bg-neutral-100 text-neutral-700", border: "border-neutral-200" },
    { key: "inverse", label: "Inverse", bg: brandColor, fg: "#FFFFFF", chipClass: "bg-black/25 text-white" },
    { key: "black", label: "Black", bg: "#FFFFFF", fg: "#0A0A0A", chipClass: "bg-neutral-100 text-neutral-700", border: "border-neutral-200" },
    { key: "white", label: "White", bg: "#0A0A0A", fg: "#FFFFFF", chipClass: "bg-white/15 text-white" },
  ];

  const filenameFor = (v: Variant) => `${safeName(project?.name || baseState.text)}-logo-${v.key}`;

  const handleDownload = async (v: Variant, fmt: "png" | "svg" | "pdf") => {
    const key = `${v.key}:${fmt}`;
    setBusy(key);
    try {
      const state = variants[v.key];
      const name = filenameFor(v);
      if (fmt === "png") await downloadPng(state, name);
      else if (fmt === "svg") downloadSvg(state, name);
      else await downloadPdf(state, name, v.bg);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const removeFromKit = async (assetId: string) => {
    if (!confirm("Remove this file from the brand kit? It will stay in your Saved library.")) return;
    const { error } = await supabase.from("assets").update({ project_id: null }).eq("id", assetId);
    if (error) {
      toast({ title: "Could not remove", description: error.message, variant: "destructive" });
      return;
    }
    setLogoAssets((prev) => {
      const next = prev.filter((a) => a.id !== assetId);
      if (logoAsset?.id === assetId) {
        const withState = next.find((a: any) => a?.editor_state?.kind === "logotype");
        setLogoAsset(withState || next[0] || null);
      }
      return next;
    });
    toast({ title: "Removed from brand kit" });
  };

  return (
    <>
        <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Logo/Icon Files</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Download your logo or icon in the right variant for every context — light, dark, inverse and monochrome.
            </p>
          </div>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          ) : !logoAsset ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
              <p className="text-sm text-neutral-600">No logo saved for this brand yet.</p>
              <Link
                to="/create"
                className="mt-3 inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition hover:bg-brand-hover"
              >
                Generate a logo
              </Link>
            </div>
          ) : logoIsImage ? (
            <div className="mx-auto max-w-5xl">
              <div className="grid gap-6 md:grid-cols-2">
                {cards.map((v) => {
                  let src = logoImageUrl as string;
                  if (imageVariants?.hasAlpha) {
                    if (v.key === "black") src = imageVariants.black || src;
                    else if (v.key === "white" || v.key === "inverse") src = imageVariants.white || src;
                  }
                  return (
                  <div key={v.key} className={`relative overflow-hidden rounded-2xl ${v.border ? `border ${v.border}` : ""} shadow-[0_10px_40px_-20px_rgba(15,23,42,0.15)]`} style={{ backgroundColor: v.bg }}>
                    <div className="flex aspect-[16/9] items-center justify-center px-10">
                      <img
                        src={src}
                        alt={project?.name || "Logo"}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="pointer-events-none absolute left-4 top-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${v.chipClass}`}>{v.label}</span>
                    </div>
                    <a href={src} download={`${filenameFor(v)}.png`} target="_blank" rel="noreferrer" className={`absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-sm transition ${(v.bg === "#FFFFFF") ? "bg-neutral-900 text-white hover:bg-neutral-800" : "bg-white/95 text-neutral-900 hover:bg-white"}`}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
              {cards.map((v) => {
                const state = variants[v.key];
                const isDark = v.bg !== "#FFFFFF";
                return (
                  <div
                    key={v.key}
                    className={`relative overflow-hidden rounded-2xl ${v.border ? `border ${v.border}` : ""} shadow-[0_10px_40px_-20px_rgba(15,23,42,0.15)]`}
                    style={{ backgroundColor: v.bg }}
                  >
                    <div className="flex aspect-[16/9] items-center justify-center px-10">
                      <Logotype state={state} fit="contain" />
                    </div>
                    <div className="pointer-events-none absolute left-4 top-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${v.chipClass}`}>
                        {v.label}
                      </span>
                    </div>
                    <div className="absolute bottom-4 right-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-sm outline-none transition ${
                            isDark
                              ? "bg-white/95 text-neutral-900 hover:bg-white"
                              : "bg-neutral-900 text-white hover:bg-neutral-800"
                          }`}
                        >
                          {busy?.startsWith(`${v.key}:`) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Download
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={6}
                          className="w-48 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg"
                          style={{ colorScheme: "light" }}
                        >
                          <DropdownMenuItem
                            onClick={() => handleDownload(v, "png")}
                            className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm text-neutral-700 focus:bg-neutral-100"
                          >
                            <span className="inline-flex items-center gap-2">
                              <Download className="h-3.5 w-3.5" /> For Web
                            </span>
                            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">PNG</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDownload(v, "pdf")}
                            className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm text-neutral-700 focus:bg-neutral-100"
                          >
                            <span className="inline-flex items-center gap-2">
                              <Download className="h-3.5 w-3.5" /> For Print
                            </span>
                            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">PDF</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDownload(v, "svg")}
                            className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm text-neutral-700 focus:bg-neutral-100"
                          >
                            <span className="inline-flex items-center gap-2">
                              <Download className="h-3.5 w-3.5" /> Vector
                            </span>
                            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">SVG</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loading && logoAssets.length >= 1 && (
            <div className="mx-auto mt-10 max-w-5xl">
              <h2 className="text-sm font-semibold text-neutral-700">All files in this brand kit ({logoAssets.length})</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {logoAssets.map((a) => (
                  <div key={a.id} className={`group relative overflow-hidden rounded-xl border bg-white transition hover:shadow-sm ${logoAsset?.id === a.id ? "border-brand ring-2 ring-brand/30" : "border-neutral-200"}`}>
                    <button onClick={() => setLogoAsset(a)} className="block w-full">
                      <div className="flex aspect-square items-center justify-center bg-neutral-50 p-3">
                        {a?.editor_state?.kind === "logotype" ? (
                          <Logotype state={a.editor_state} fit="contain" />
                        ) : (a.image_url || a.thumbnail_url) ? (
                          <img src={a.image_url || a.thumbnail_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      title="Remove from brand kit"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeFromKit(a.id); }}
                      className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1 text-neutral-500 opacity-0 shadow-sm transition hover:text-red-600 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
    </>
  );
}
