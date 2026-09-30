import { Loader2 as ControlLoader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { ArrowLeft, Download, Loader2 } from "@/components/EmojiIcons";
import { toPng } from "html-to-image";
import { supabase as _sb } from "@/integrations/supabase/client";
import { Logotype } from "@/components/Logotype";
import { defaultLogotypeState, LOGOTYPE_FONTS, loadGoogleFont, type LogotypeState } from "@/lib/logotype";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import ProjectNavigation from "@/components/ProjectNavigation";

const supabase = _sb as any;

type Preset = {
  key: string;
  label: string;
  platform: string;
  w: number;
  h: number;
  variant: "center" | "banner" | "story" | "thumb";
};

const PRESETS: Preset[] = [
  { key: "ig-post", label: "Instagram Post", platform: "Instagram", w: 1080, h: 1080, variant: "center" },
  { key: "ig-story", label: "Instagram Story", platform: "Instagram", w: 1080, h: 1920, variant: "story" },
  { key: "x-header", label: "X / Twitter Header", platform: "X", w: 1500, h: 500, variant: "banner" },
  { key: "li-banner", label: "LinkedIn Banner", platform: "LinkedIn", w: 1584, h: 396, variant: "banner" },
  { key: "yt-thumb", label: "YouTube Thumbnail", platform: "YouTube", w: 1280, h: 720, variant: "thumb" },
  { key: "fb-cover", label: "Facebook Cover", platform: "Facebook", w: 820, h: 312, variant: "banner" },
];

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

export default function SocialKit() {
  const { id: projectId } = useParams();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [logoAsset, setLogoAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: proj }, { data: assets }] = await Promise.all([
        supabase.from("projects").select("id,name,tagline,brand_color").eq("id", projectId).maybeSingle(),
        supabase
          .from("assets")
          .select("id,title,asset_type,editor_state,created_at")
          .eq("project_id", projectId)
          .in("asset_type", ["logo", "logotype", "wordmark"])
          .order("created_at", { ascending: true })
          .limit(20),
      ]);
      if (cancelled) return;
      setProject(proj || null);
      const withState = (assets || []).find((a: any) => a.editor_state?.kind === "logotype");
      setLogoAsset(withState || (assets || [])[0] || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => { LOGOTYPE_FONTS.forEach((f) => loadGoogleFont(f.family, f.weights)); }, []);

  const brandColor = useMemo(() => {
    const c = String(project?.brand_color || "").trim();
    return /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#0A0A0A";
  }, [project]);

  const baseState = useMemo<LogotypeState>(() => {
    if (logoAsset?.editor_state?.kind === "logotype") return logoAsset.editor_state as LogotypeState;
    return defaultLogotypeState(project?.name || "Brand");
  }, [logoAsset, project]);

  const isDark = luminance(brandColor) < 0.4;
  const onBrandText = isDark ? "#ffffff" : "#0A0A0A";
  const invertedState: LogotypeState = { ...baseState, color: onBrandText };

  const download = async (preset: Preset) => {
    const node = refs.current[preset.key];
    if (!node) return;
    setBusy(preset.key);
    try {
      const displayW = node.clientWidth;
      const scale = preset.w / Math.max(displayW, 1);
      const dataUrl = await toPng(node, {
        pixelRatio: scale,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      const safe = (project?.name || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      a.href = dataUrl;
      a.download = `${safe}-${preset.key}-${preset.w}x${preset.h}.png`;
      a.click();
      toast({ title: `${preset.label} downloaded` });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const renderPreset = (preset: Preset) => {
    const aspect = `${preset.w} / ${preset.h}`;
    const name = project?.name || "Brand";
    const tagline = project?.tagline || "";
    if (preset.variant === "banner") {
      return (
        <div className="flex h-full w-full items-center gap-6 px-[6%]" style={{ background: brandColor }}>
          <div className="flex h-[55%] w-[38%] items-center justify-start">
            <Logotype state={invertedState} fit="contain" />
          </div>
          <div className="min-w-0 flex-1" style={{ color: onBrandText }}>
            <div className="truncate text-[clamp(14px,3.5vw,42px)] font-semibold tracking-tight">{name}</div>
            {tagline ? (
              <div className="mt-2 line-clamp-2 text-[clamp(10px,1.6vw,20px)] opacity-80">{tagline}</div>
            ) : null}
          </div>
        </div>
      );
    }
    if (preset.variant === "story") {
      return (
        <div className="flex h-full w-full flex-col items-center justify-between py-[10%]" style={{ background: brandColor }}>
          <div className="text-[clamp(10px,2vw,18px)] normal-case tracking-[0.3em]" style={{ color: onBrandText, opacity: 0.7 }}>
            {tagline || "Introducing"}
          </div>
          <div className="flex h-[45%] w-[75%] items-center justify-center">
            <Logotype state={invertedState} fit="contain" />
          </div>
          <div className="text-[clamp(12px,2.4vw,22px)] font-medium" style={{ color: onBrandText }}>
            {name}
          </div>
        </div>
      );
    }
    if (preset.variant === "thumb") {
      return (
        <div className="relative flex h-full w-full flex-col justify-end p-[5%]" style={{ background: brandColor }}>
          <div className="absolute inset-0 opacity-[0.06]" style={{
            backgroundImage: "radial-gradient(circle at 20% 20%, #fff 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }} />
          <div className="relative flex h-[55%] items-center justify-center">
            <Logotype state={invertedState} fit="contain" />
          </div>
          <div className="relative mt-4 text-[clamp(14px,3vw,36px)] font-semibold tracking-tight" style={{ color: onBrandText }}>
            {tagline || name}
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-[10%]" style={{ background: brandColor }}>
        <div className="flex h-[45%] w-[70%] items-center justify-center">
          <Logotype state={invertedState} fit="contain" />
        </div>
        {tagline ? (
          <div className="text-center text-[clamp(10px,2vw,22px)] font-medium" style={{ color: onBrandText, opacity: 0.85 }}>
            {tagline}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center gap-3">
        {projectId ? (
          <Link
            to={`/brands/${projectId}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-50"
            aria-label="Back to brand kit"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Social Media Kit</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Ready-to-post covers, headers, and thumbnails using your brand. Download at exact platform dimensions.
          </p>
        </div>
      </div>

      {projectId ? (
        <div className="mb-6">
          <ProjectNavigation projectId={projectId} active="downloads" />
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[16/9] w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {PRESETS.map((preset) => (
            <div
              key={preset.key}
              className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_10px_40px_-20px_rgba(15,23,42,0.15)]"
            >
              <div className="relative w-full bg-neutral-50" style={{ aspectRatio: `${preset.w} / ${preset.h}` }}>
                <div
                  ref={(el) => { refs.current[preset.key] = el; }}
                  className="absolute inset-0"
                >
                  {renderPreset(preset)}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-neutral-900">{preset.label}</div>
                  <div className="text-[11px] normal-case tracking-wide text-neutral-500">
                    {preset.platform} · {preset.w}×{preset.h}
                  </div>
                </div>
                <button
                  onClick={() => download(preset)}
                  disabled={busy === preset.key}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
                >
                  {busy === preset.key ? <ControlLoader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  PNG
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
