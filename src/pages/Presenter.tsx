import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase as _sb } from "@/integrations/supabase/client";
import { tryJson, type PresentationData } from "@/lib/assetSchemas";
import ScaledSlide, { SlideStage } from "@/components/slides/ScaledSlide";
import SlideRenderer, { SLIDE_THEMES } from "@/components/slides/SlideRenderer";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Grid3x3, Maximize2, Minimize2, X,
  Download, StickyNote, Loader2, GripVertical, Palette, Copy, Trash2, Keyboard,
  Plus,
} from "lucide-react";
import { exportAsset } from "@/lib/exporters";
import { toast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics";
import { handleAiError } from "@/lib/aiErrors";
import { Wand2 } from "lucide-react";

const supabase = _sb as any;

export default function Presenter() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const slideParam = parseInt(params.get("slide") || "0", 10);
  const isPrint = params.get("print") === "1";

  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [gridOpen, setGridOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "pptx" | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [regeneratingSlide, setRegeneratingSlide] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    supabase.from("assets").select("*").eq("id", id).maybeSingle().then((r: any) => {
      setAsset(r.data); setLoading(false);
    });
  }, [id]);

  const data: PresentationData | null = useMemo(() => {
    const parsed = tryJson<PresentationData>(asset?.content || "");
    return parsed?.slides ? parsed : null;
  }, [asset]);

  const slides = data?.slides || [];
  const total = slides.length;
  const idx = Math.max(0, Math.min(total - 1, isNaN(slideParam) ? 0 : slideParam));

  const brand = useMemo(() => {
    const ctx = asset?.meta?.brand_context || {};
    return { name: ctx.productName || asset?.title, primary: ctx.colors?.[0] };
  }, [asset]);

  const themeKey: string = asset?.meta?.presentation_theme || "default";
  const theme = SLIDE_THEMES[themeKey] || SLIDE_THEMES.default;

  const applyTheme = async (key: string) => {
    if (!asset) return;
    const nextMeta = { ...(asset.meta || {}), presentation_theme: key };
    setAsset({ ...asset, meta: nextMeta });
    setThemeOpen(false);
    setSavingTheme(true);
    const { error } = await supabase.from("assets").update({ meta: nextMeta }).eq("id", asset.id);
    setSavingTheme(false);
    if (error) toast({ title: "Could not save theme", description: error.message, variant: "destructive" });
  };

  const setSlide = (n: number) => {
    const bounded = Math.max(0, Math.min(total - 1, n));
    const next = new URLSearchParams(params);
    next.set("slide", String(bounded));
    setParams(next, { replace: true });
  };

  const persistSlides = async (nextSlides: PresentationData["slides"]) => {
    if (!asset || !data) return;
    setSavingOrder(true);
    const nextContent = JSON.stringify({ ...data, slides: nextSlides }, null, 2);
    const optimistic = { ...asset, content: nextContent };
    setAsset(optimistic);
    const { error } = await supabase.from("assets").update({ content: nextContent }).eq("id", asset.id);
    setSavingOrder(false);
    if (error) toast({ title: "Could not save order", description: error.message, variant: "destructive" });
  };

  const reorder = async (from: number, to: number) => {
    if (from === to || !data) return;
    const copy = slides.slice();
    const [m] = copy.splice(from, 1);
    copy.splice(to, 0, m);
    await persistSlides(copy);
    // Keep currently-viewed slide stable when it moves.
    if (idx === from) setSlide(to);
    else if (from < idx && to >= idx) setSlide(idx - 1);
    else if (from > idx && to <= idx) setSlide(idx + 1);
  };

  const duplicateSlide = async (at: number) => {
    if (!data) return;
    const copy = slides.slice();
    const clone = JSON.parse(JSON.stringify(copy[at]));
    if (clone?.title) clone.title = `${clone.title} (copy)`;
    copy.splice(at + 1, 0, clone);
    await persistSlides(copy);
    if (at <= idx) setSlide(idx + 1);
  };

  const deleteSlide = async (at: number) => {
    if (!data || slides.length <= 1) {
      toast({ title: "Can't delete", description: "A presentation needs at least one slide.", variant: "destructive" });
      return;
    }
    const copy = slides.slice();
    copy.splice(at, 1);
    await persistSlides(copy);
    if (at < idx) setSlide(idx - 1);
    else if (at === idx) setSlide(Math.min(idx, copy.length - 1));
  };

  const addSlide = async (at?: number) => {
    if (!data) return;
    const insertAt = typeof at === "number" ? at : slides.length;
    const blank: any = {
      title: "Untitled slide",
      purpose: "",
      bullets: [],
      notes: "",
      layout: "title-bullets",
    };
    const copy = slides.slice();
    copy.splice(insertAt, 0, blank);
    await persistSlides(copy);
    setSlide(insertAt);
  };

  const regenerateSlide = async () => {
    if (!asset || !data || !slides[idx]) return;
    setRegeneratingSlide(true);
    try {
      const target = slides[idx];
      const { data: res, error } = await supabase.functions.invoke("rewrite-field", {
        body: {
          field_label: `slide_${idx + 1}`,
          current: target,
          as_json: true,
          asset_type: "presentation",
          brand_context: asset?.meta?.brand_context || {},
          instruction:
            "Rewrite this one slide. Return STRICT JSON with the same shape (keys: title, purpose, layout, bullets, notes, and any other keys already present). Sharpen the title, tighten bullets to <=8 words each, and improve the visual guidance / speaker notes. Do not add new top-level keys.",
        },
      });
      const err = handleAiError(res, error, toast);
      if (err) return;
      const next = (res as any)?.value;
      if (!next || typeof next !== "object") {
        toast({ title: "Regen failed", description: "Rocket didn't return a valid slide.", variant: "destructive" });
        return;
      }
      const copy = slides.slice();
      copy[idx] = { ...target, ...next };
      await persistSlides(copy);
      window.dispatchEvent(new Event("credits:refresh"));
      track("slide_regenerated", { asset_id: asset.id, slide_index: idx });
      toast({ title: "Slide regenerated" });
    } finally {
      setRegeneratingSlide(false);
    }
  };

  const doExport = async (format: "pdf" | "pptx") => {
    if (!asset) return;
    setExporting(format);
    try {
      await exportAsset({ id: asset.id, title: asset.title, content: asset.content, asset_type: asset.asset_type }, format);
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    if (total > 0) {
      const t = slides[idx]?.title || "Presentation";
      document.title = `${idx + 1}/${total} — ${t}`;
    }
  }, [idx, total, slides]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); setSlide(idx + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); setSlide(idx - 1); }
      else if (e.key === "Home") { e.preventDefault(); setSlide(0); }
      else if (e.key === "End") { e.preventDefault(); setSlide(total - 1); }
      else if (e.key.toLowerCase() === "g") { setGridOpen((v) => !v); }
      else if (e.key.toLowerCase() === "n") { setNotesOpen((v) => !v); }
      else if (e.key === "?" || (e.shiftKey && e.key === "/")) { setHelpOpen((v) => !v); }
      else if (e.key === "f" || e.key === "F5") { e.preventDefault(); toggleFullscreen(); }
      else if (e.key === "Escape") { if (helpOpen) setHelpOpen(false); else if (gridOpen) setGridOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, total, gridOpen, helpOpen]);

  const toggleFullscreen = async () => {
    const el = rootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) await el.requestFullscreen?.();
    else await document.exitFullscreen?.();
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (loading) return <div className="grid min-h-screen place-items-center bg-neutral-950 text-sm text-neutral-400">Loading…</div>;
  if (!asset) return <div className="grid min-h-screen place-items-center bg-neutral-950 text-sm text-neutral-400">Presentation not found.</div>;
  if (!data) return (
    <div className="grid min-h-screen place-items-center bg-neutral-950 p-10 text-center text-sm text-neutral-400">
      This asset didn't parse as a presentation.
      <Link to={`/editor?id=${asset.id}`} className="ml-2 text-brand underline" target="_blank" rel="noopener noreferrer">Back to design</Link>
    </div>
  );

  // Print/handout mode — stack every slide vertically at native 1920x1080 for Cmd+P → PDF.
  if (isPrint) {
    return (
      <div className="slide-print-root bg-white">
        <style>{`
          @page { size: 1920px 1080px landscape; margin: 0; }
          @media print {
            html, body { margin: 0; padding: 0; background: #fff; }
            .slide-print-page { page-break-after: always; break-after: page; }
          }
          .slide-print-page {
            width: 1920px;
            height: 1080px;
            position: relative;
            overflow: hidden;
            background: #fff;
            margin: 0 auto;
          }
        `}</style>
        {slides.map((s, i) => (
          <div key={i} className="slide-print-page">
            <SlideRenderer slide={s} index={i} total={total} brand={brand} theme={theme} />
          </div>
        ))}
      </div>
    );
  }

  const slide = slides[idx];
  const noteBullets = slide?.bullets || [];
  const hasNotes = !!(slide?.notes && slide.notes.trim());

  return (
    <div ref={rootRef} className="relative min-h-screen bg-neutral-950">
      {/* Top bar */}
      {!isFullscreen && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3">
          <Link
            to={`/editor?id=${asset.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
           target="_blank" rel="noopener noreferrer">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <div className="flex items-center gap-2">
            {savingOrder && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-white/50">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving order…
              </span>
            )}
            <button
              onClick={() => setNotesOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                notesOpen ? "border-brand/50 bg-brand/15 text-white" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
              }`}
              title="Notes (N)"
            >
              <StickyNote className="h-3.5 w-3.5" /> Notes
            </button>
            <button
              onClick={() => setGridOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              title="Grid overview (G)"
            >
              <Grid3x3 className="h-3.5 w-3.5" /> Grid
            </button>
            <button
              onClick={() => setHelpOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-3.5 w-3.5" /> Shortcuts
            </button>
            <div className="relative">
              <button
                onClick={() => setThemeOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                title="Theme"
              >
                {savingTheme ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Palette className="h-3.5 w-3.5" />} Theme
              </button>
              {themeOpen && (
                <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-white/10 bg-neutral-900 p-2 shadow-xl">
                  {Object.entries(SLIDE_THEMES).map(([k, t]) => (
                    <button
                      key={k}
                      onClick={() => applyTheme(k)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                        themeKey === k ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5"
                      }`}
                    >
                      <span className="inline-flex h-4 w-6 overflow-hidden rounded border border-white/10">
                        <span className="flex-1" style={{ background: t.bg }} />
                        <span className="w-2" style={{ background: t.accent || brand.primary || "#3B82F6" }} />
                      </span>
                      <span className="flex-1">{t.label}</span>
                      {themeKey === k && <span className="text-brand">•</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => doExport("pdf")}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:opacity-40"
              title="Export PDF"
            >
              {exporting === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
            </button>
            <button
              onClick={() => doExport("pptx")}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:opacity-40"
              title="Export PPTX"
            >
              {exporting === "pptx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PPTX
            </button>
            <button
              onClick={() => {
                const url = `/present?id=${asset.id}&print=1`;
                window.open(url, "_blank", "noopener");
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              title="Open printable handout (Cmd+P → Save as PDF)"
            >
              <Download className="h-3.5 w-3.5" /> Handout
            </button>
            <button
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {isFullscreen ? "Exit" : "Present"}
            </button>
            <button
              onClick={regenerateSlide}
              disabled={regeneratingSlide}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs text-white/90 hover:bg-brand/20 disabled:opacity-40"
              title="Rewrite this slide with Rocket (1 credit)"
            >
              {regeneratingSlide ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Regen slide
            </button>
          </div>
        </div>
      )}

      {/* Stage */}
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col items-center justify-center p-4 pt-16">
        <div className="w-full">
          <SlideStage className="rounded-2xl border border-white/10 bg-white shadow-2xl">
            <ScaledSlide>
              <SlideRenderer slide={slide} index={idx} total={total} brand={brand} theme={theme} />
            </ScaledSlide>
          </SlideStage>

          {/* Nav bar */}
          {!isFullscreen && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => setSlide(idx - 1)}
                disabled={idx === 0}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="text-xs tabular-nums text-white/60">{idx + 1} / {total}</span>
              <button
                onClick={() => setSlide(idx + 1)}
                disabled={idx >= total - 1}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Notes panel */}
          {!isFullscreen && notesOpen && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/85">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-widest text-white/50">Presenter notes · Slide {idx + 1}</div>
                <div className="text-[11px] text-white/40">Press N to toggle</div>
              </div>
              <div className="text-base font-medium text-white">{slide?.title}</div>
              {hasNotes ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-white/80">{slide?.notes}</p>
              ) : (
                <>
                  {slide?.purpose && <p className="mt-2 text-sm text-white/70">{slide.purpose}</p>}
                </>
              )}
              {noteBullets.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm text-white/75">
                  {noteBullets.map((b, i) => (
                    <li key={i} className="flex gap-2"><span className="text-white/40">•</span><span>{b}</span></li>
                  ))}
                </ul>
              )}
              {slide?.visual_guidance && (
                <div className="mt-3 border-t border-white/10 pt-3 text-xs italic text-white/50">
                  Visual direction · {slide.visual_guidance}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen overlay: black bg + slide only */}
      {isFullscreen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black">
          <div className="h-screen w-screen">
            <SlideStage className="h-full w-full">
              <ScaledSlide>
                <SlideRenderer slide={slide} index={idx} total={total} brand={brand} />
              </ScaledSlide>
            </SlideStage>
          </div>
        </div>
      )}

      {/* Grid overlay */}
      {gridOpen && (
        <div className="fixed inset-0 z-50 overflow-auto bg-neutral-950/95 backdrop-blur-sm">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-neutral-950/80 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium text-white">All slides · {total}</div>
              <div className="text-[11px] text-white/50">Drag cards to reorder</div>
              {savingOrder && <Loader2 className="h-3 w-3 animate-spin text-white/50" />}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => addSlide()}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/15 px-3 py-1.5 text-xs text-white hover:bg-brand/25"
              >
                <Plus className="h-3.5 w-3.5" /> New slide
              </button>
              <button
                onClick={() => setGridOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" /> Close
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-3 lg:grid-cols-4">
            {slides.map((s, i) => (
              <div
                key={i}
                draggable
                onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null); }}
                onDragEnd={() => setDragIdx(null)}
                className={`group relative overflow-hidden rounded-xl border text-left transition ${
                  i === idx ? "border-brand ring-2 ring-brand/40" : "border-white/10 hover:border-white/30"
                } ${dragIdx === i ? "opacity-50" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => { setSlide(i); setGridOpen(false); }}
                  className="block w-full text-left"
                >
                  <SlideStage className="bg-white">
                    <ScaledSlide>
                      <SlideRenderer slide={s} index={i} total={total} brand={brand} />
                    </ScaledSlide>
                  </SlideStage>
                  <div className="flex items-center justify-between bg-neutral-900 px-3 py-2 text-[11px] text-white/70">
                    <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <span className="ml-2 truncate">{s.title}</span>
                  </div>
                </button>
                <div
                  className="absolute left-2 top-2 cursor-grab rounded-md bg-black/60 p-1 text-white/70 opacity-0 backdrop-blur-sm transition group-hover:opacity-100"
                  title="Drag to reorder"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </div>
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); duplicateSlide(i); }}
                    className="rounded-md bg-black/60 p-1 text-white/80 backdrop-blur-sm hover:bg-black/80"
                    title="Duplicate slide"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete slide ${i + 1}?`)) deleteSlide(i);
                    }}
                    className="rounded-md bg-black/60 p-1 text-red-300 backdrop-blur-sm hover:bg-red-500/30"
                    title="Delete slide"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {helpOpen && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 text-sm text-white/85"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-base font-medium text-white">Keyboard shortcuts</div>
              <button onClick={() => setHelpOpen(false)} className="rounded-md p-1 text-white/60 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {[
                ["→ / Space", "Next slide"],
                ["←", "Previous slide"],
                ["Home / End", "First / last slide"],
                ["F", "Toggle fullscreen"],
                ["G", "Grid overview"],
                ["N", "Presenter notes"],
                ["?", "This help"],
                ["Esc", "Close overlay"],
              ].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-4">
                  <span className="text-white/70">{v}</span>
                  <kbd className="rounded border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/80">{k}</kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
