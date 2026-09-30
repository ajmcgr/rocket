import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { supabase as _sb } from "@/integrations/supabase/client";
import { ArrowLeft, Download, FileDown, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
const supabase = _sb as any;
import { Skeleton } from "@/components/ui/skeleton";
import { Logotype } from "@/components/Logotype";
import ProjectNavigation from "@/components/ProjectNavigation";
import { tryJson, type ColorSystem, type FontSystem, type BrandVoiceData, type BrandGuidelinesData } from "@/lib/assetSchemas";

function uniq<T>(a: T[]) { return Array.from(new Set(a)); }

const BrandKit = () => {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [p, a] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        supabase.from("assets").select("*").eq("project_id", id).order("created_at", { ascending: true }),
      ]);
      setProject(p.data); setAssets(a.data || []); setLoading(false);
    })();
  }, [id]);

  if (loading) return (
    <div className="mx-auto max-w-5xl space-y-4 p-10">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)}
      </div>
    </div>
  );
  if (!project) return <div className="p-10 text-center text-sm text-neutral-500">Project not found.</div>;

  const logos = assets.filter(a => a.asset_type === "logo" && a.image_url && a?.editor_state?.kind !== "logotype");
  const logotypes = assets.filter(a => a?.editor_state?.kind === "logotype");
  const graphics = assets.filter(a => ["graphic", "icon", "photo"].includes(a.asset_type) && a.image_url);

  // Structured JSON sources only — no markdown parsing.
  const colorAssets: ColorSystem[] = assets.filter(a => a.asset_type === "color_system").map(a => tryJson<ColorSystem>(a.content || "")).filter(Boolean) as ColorSystem[];
  const fontAssets: FontSystem[] = assets.filter(a => a.asset_type === "font_system").map(a => tryJson<FontSystem>(a.content || "")).filter(Boolean) as FontSystem[];
  const voice: BrandVoiceData | null = (() => { const a = assets.find(x => x.asset_type === "brand_voice"); return a ? tryJson<BrandVoiceData>(a.content || "") : null; })();
  const guidelines: BrandGuidelinesData | null = (() => { const a = assets.find(x => x.asset_type === "brand_guidelines"); return a ? tryJson<BrandGuidelinesData>(a.content || "") : null; })();

  const colors = uniq(colorAssets.flatMap(c => [c.primary, c.secondary, c.accent, c.success, c.warning, c.danger].filter(Boolean) as string[]).map(c => c.toLowerCase())).slice(0, 12);
  const fonts = uniq(fontAssets.flatMap(f => [f.display_font, f.heading_font, f.body_font].filter(Boolean) as string[])).slice(0, 6);
  const tagline = guidelines?.taglines?.[0];

  const exportPng = async () => {
    if (!sheetRef.current) return;
    setExporting("png");
    try {
      const dataUrl = await toPng(sheetRef.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `${project.name.replace(/\s+/g, "-").toLowerCase()}-brand-kit.png`;
      link.href = dataUrl;
      link.click();
    } finally { setExporting(null); }
  };

  const exportPdf = async () => {
    if (!sheetRef.current) return;
    setExporting("pdf");
    try {
      const dataUrl = await toPng(sheetRef.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
      const img = new Image();
      img.src = dataUrl;
      await new Promise(r => (img.onload = r));
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const ratio = pageW / img.width;
      const h = img.height * ratio;
      const pageH = pdf.internal.pageSize.getHeight();
      let y = 0;
      // Slice into pages
      while (y < h) {
        if (y > 0) pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, -y, pageW, h);
        y += pageH;
      }
      pdf.save(`${project.name.replace(/\s+/g, "-").toLowerCase()}-brand-kit.pdf`);
    } finally { setExporting(null); }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link to={`/projects/${id}`} className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" /> {project.name}
        </Link>
        <div className="flex items-center gap-2">
          <button disabled={!!exporting} onClick={exportPng} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">
            {exporting === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PNG
          </button>
          <button disabled={!!exporting} onClick={exportPdf} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-50">
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} PDF
          </button>
        </div>
      </div>

      <ProjectNavigation projectId={id!} active="downloads" />

      <div ref={sheetRef} className="mt-8 space-y-10 rounded-3xl border border-neutral-200 bg-white p-10">
        <header className="border-b border-neutral-200 pb-8">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Brand Kit</div>
          <h1 className="mt-2 text-5xl font-semibold tracking-tight">{project.name}</h1>
          {tagline && <p className="mt-3 text-lg text-neutral-600">"{tagline}"</p>}
          {project.description && !tagline && <p className="mt-3 text-lg text-neutral-600">{project.description}</p>}
        </header>

        {logos.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">Logos</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {logos.map(l => (
                <div key={l.id} className="flex aspect-square items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
                  <img src={l.image_url} alt={l.title} className="max-h-full max-w-full object-contain" />
                </div>
              ))}
            </div>
          </section>
        )}

        {logotypes.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">Logotypes</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {logotypes.map(l => (
                <div key={l.id} className="flex aspect-[16/7] items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
                  <Logotype state={l.editor_state} fit="contain" />
                </div>
              ))}
            </div>
          </section>
        )}

        {colors.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">Colors</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {colors.map(c => (
                <div key={c} className="overflow-hidden rounded-xl border border-neutral-200">
                  <div className="h-20 w-full" style={{ backgroundColor: c }} />
                  <div className="border-t border-neutral-100 px-3 py-2 text-xs font-mono">{c.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {fonts.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">Typography</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {fonts.map(f => (
                <div key={f} className="rounded-2xl border border-neutral-200 p-5">
                  <div className="text-xs text-neutral-500">{f}</div>
                  <div className="mt-1 text-3xl" style={{ fontFamily: `'${f}', system-ui, sans-serif` }}>The quick brown fox</div>
                  <div className="mt-1 text-sm text-neutral-600" style={{ fontFamily: `'${f}', system-ui, sans-serif` }}>jumps over the lazy dog 0123456789</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {voice && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">Voice</h2>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
              {voice.overview && <p className="text-sm leading-relaxed text-neutral-800">{voice.overview}</p>}
              {voice.pillars?.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {voice.pillars.map((p, i) => (
                    <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4">
                      <div className="text-[10px] uppercase tracking-wider text-brand">Pillar {i + 1}</div>
                      <div className="mt-1 font-semibold text-neutral-900">{p.name}</div>
                      <p className="mt-1 text-xs text-neutral-600">{p.description}</p>
                      {p.example && <p className="mt-2 border-l-2 border-brand/30 pl-2 text-xs italic text-neutral-700">"{p.example}"</p>}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        )}

        {guidelines && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">Guidelines</h2>
            <div className="rounded-2xl border border-neutral-200 p-6 text-sm leading-relaxed text-neutral-800">
              {guidelines.mission && <div className="mb-4"><div className="text-[10px] uppercase tracking-wider text-neutral-500">Mission</div><p className="mt-1">{guidelines.mission}</p></div>}
              {guidelines.vision && <div className="mb-4"><div className="text-[10px] uppercase tracking-wider text-neutral-500">Vision</div><p className="mt-1">{guidelines.vision}</p></div>}
              {guidelines.positioning && <div className="mb-4"><div className="text-[10px] uppercase tracking-wider text-neutral-500">Positioning</div><blockquote className="mt-1 border-l-4 border-brand pl-3 italic">{guidelines.positioning}</blockquote></div>}
              {guidelines.values?.length ? (
                <div className="mb-4"><div className="text-[10px] uppercase tracking-wider text-neutral-500">Values</div>
                  <ul className="mt-1 grid gap-1 md:grid-cols-2">{guidelines.values.map((v, i) => <li key={i}><strong>{v.name}.</strong> {v.description}</li>)}</ul>
                </div>
              ) : null}
              {guidelines.taglines?.length ? (
                <div><div className="text-[10px] uppercase tracking-wider text-neutral-500">Taglines</div>
                  <ul className="mt-1 list-disc pl-5">{guidelines.taglines.slice(0, 6).map((t, i) => <li key={i}>"{t}"</li>)}</ul>
                </div>
              ) : null}
            </div>
          </section>
        )}

        {graphics.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">Graphics</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {graphics.map(g => (
                <div key={g.id} className="overflow-hidden rounded-2xl border border-neutral-200">
                  <div className="aspect-square w-full bg-neutral-50">
                    <img src={g.image_url} alt={g.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="border-t border-neutral-100 px-3 py-2 text-xs truncate">{g.title}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {logos.length === 0 && colors.length === 0 && fonts.length === 0 && !voice && !guidelines && (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500">
            Generate designs (logo, colors, fonts, voice) in this project to populate the kit.
          </div>
        )}

        <footer className="border-t border-neutral-200 pt-6 text-xs text-neutral-400">
          Generated with Rocket · tryrocket.ai
        </footer>
      </div>
    </div>
  );
};

export default BrandKit;
