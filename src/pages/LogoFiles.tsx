import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import { supabase as _sb } from "@/integrations/supabase/client";
import { Logotype } from "@/components/Logotype";
import { logotypeToPng, logotypeToSvg } from "@/components/Logotype";
import { defaultLogotypeState, type LogotypeState } from "@/lib/logotype";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import ProjectNavigation from "@/components/ProjectNavigation";

const supabase = _sb as any;

type Variant = {
  key: "regular" | "inverse" | "black" | "white";
  label: string;
  bg: string;              // card background
  fg: string;              // logotype color
  chipClass: string;       // pill on top of the card
  border?: string;
};

function buildVariants(base: LogotypeState, brandColor: string): Record<Variant["key"], LogotypeState> {
  return {
    regular: { ...base, color: base.color || "#0A0A0A" },
    inverse: { ...base, color: "#FFFFFF" },
    black:   { ...base, color: "#0A0A0A" },
    white:   { ...base, color: "#FFFFFF" },
  };
}

const VARIANTS = (brandColor: string): Variant[] => [
  { key: "regular", label: "Regular", bg: "#FFFFFF", fg: "#0A0A0A", chipClass: "bg-neutral-100 text-neutral-700", border: "border-neutral-200" },
  { key: "inverse", label: "Inverse", bg: brandColor, fg: "#FFFFFF", chipClass: "bg-black/25 text-white" },
  { key: "black",   label: "Black",   bg: "#FFFFFF", fg: "#0A0A0A", chipClass: "bg-neutral-100 text-neutral-700", border: "border-neutral-200" },
  { key: "white",   label: "White",   bg: "#0A0A0A", fg: "#FFFFFF", chipClass: "bg-white/15 text-white" },
];

const safeName = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "logo";

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
  // Load into an Image to read dimensions.
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
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

export default function LogoFiles() {
  const { id: projectId } = useParams();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [logoAsset, setLogoAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: proj }, { data: assets }] = await Promise.all([
        supabase.from("projects").select("id,name,brand_color").eq("id", projectId).maybeSingle(),
        supabase
          .from("assets")
          .select("id,title,asset_type,editor_state,image_url,created_at")
          .eq("project_id", projectId)
          .in("asset_type", ["logo", "logotype", "wordmark"])
          .order("created_at", { ascending: true })
          .limit(50),
      ]);
      if (cancelled) return;
      setProject(proj || null);
      const withState = (assets || []).find((a: any) => a.editor_state?.kind === "logotype");
      setLogoAsset(withState || (assets || [])[0] || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const brandColor = useMemo(() => {
    const c = String(project?.brand_color || "").trim();
    return /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#2563EB";
  }, [project]);

  const baseState = useMemo<LogotypeState>(() => {
    if (logoAsset?.editor_state?.kind === "logotype") return logoAsset.editor_state as LogotypeState;
    return defaultLogotypeState(project?.name || logoAsset?.title || "Brand");
  }, [logoAsset, project]);

  const variants = useMemo(() => buildVariants(baseState, brandColor), [baseState, brandColor]);

  const filenameFor = (v: Variant) =>
    `${safeName(project?.name || baseState.text)}-logo-${v.key}`;

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

  const cards = VARIANTS(brandColor);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center gap-3">
        {projectId ? (
          <Link
            to={`/brands/${projectId}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-50"
            aria-label="Back to brand"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Logo/Icon Files</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Download your logo or icon in the right variant for every context.
          </p>
        </div>
      </div>

      {projectId ? (
        <div className="mb-6">
          <ProjectNavigation projectId={projectId} active="downloads" />
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[16/9] w-full rounded-2xl" />
          ))}
        </div>
      ) : !logoAsset ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <p className="text-sm text-neutral-600">
            No logo saved for this project yet.
          </p>
          <Link
            to="/wizard"
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition hover:bg-brand-hover"
          >
            Generate a logo
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
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
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-sm outline-hidden transition ${
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
                        <span className="inline-flex items-center gap-2"><Download className="h-3.5 w-3.5" /> For Web</span>
                        <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">PNG</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDownload(v, "pdf")}
                        className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm text-neutral-700 focus:bg-neutral-100"
                      >
                        <span className="inline-flex items-center gap-2"><Download className="h-3.5 w-3.5" /> For Print</span>
                        <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">PDF</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDownload(v, "svg")}
                        className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm text-neutral-700 focus:bg-neutral-100"
                      >
                        <span className="inline-flex items-center gap-2"><Download className="h-3.5 w-3.5" /> Vector</span>
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
    </div>
  );
}