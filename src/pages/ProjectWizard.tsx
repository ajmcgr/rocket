import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import OutOfCreditsModal from "@/components/OutOfCreditsModal";
import { getTemplate } from "@/data/templates";
import { handleAiError } from "@/lib/aiErrors";
const supabase = _sb as any;

const TONES = ["Friendly & playful", "Bold & confident", "Minimal & technical", "Warm & human", "Luxe & editorial"];
const AUDIENCES = ["Indie developers", "Founders & operators", "Designers & creatives", "SMB owners", "Consumer / general"];

const STARTERS: { type: string; label: string; prompt: (ctx: Ctx) => string }[] = [
  { type: "logo", label: "Logo", prompt: (c) => `A logo for ${c.name}${c.url ? ` (${c.url})` : ""}. ${c.description}. Audience: ${c.audience}. Tone: ${c.tone}.` },
  { type: "color_system", label: "Color system", prompt: (c) => `Color system for ${c.name}. ${c.description}. Tone: ${c.tone}.` },
  { type: "font_system", label: "Fonts", prompt: (c) => `Font pairing for ${c.name}. Tone: ${c.tone}.` },
  { type: "brand_voice", label: "Brand voice", prompt: (c) => `Brand voice for ${c.name}. Audience: ${c.audience}. Tone: ${c.tone}. ${c.description}` },
  { type: "launch_copy", label: "Launch copy", prompt: (c) => `Launch copy for ${c.name}${c.url ? ` at ${c.url}` : ""}. ${c.description}. Audience: ${c.audience}.` },
];

type Ctx = { name: string; url: string; description: string; audience: string; tone: string };

const ProjectWizard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get("template");
  const template = templateId ? getTemplate(templateId) : null;
  const [step, setStep] = useState(0);
  const [ctx, setCtx] = useState<Ctx>({ name: "", url: "", description: "", audience: AUDIENCES[1], tone: TONES[0] });
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Record<string, "pending" | "running" | "done" | "error">>({});
  const [outOfCredits, setOutOfCredits] = useState<{ needed?: number; remaining?: number } | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState<any | null>(null);

  // Apply template defaults once on mount
  useEffect(() => {
    if (!template) return;
    setCtx(c => ({
      ...c,
      name: c.name || template.sampleName,
      description: c.description || template.description,
      audience: template.audience,
      tone: template.tone,
    }));
    setScraped({
      productName: template.sampleName,
      tagline: template.tagline,
      description: template.description,
      colors: template.colors,
      fonts: template.fonts,
      logo: null,
      voiceNotes: template.voiceNotes,
      fromTemplate: template.id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const setF = <K extends keyof Ctx>(k: K, v: Ctx[K]) => setCtx((c) => ({ ...c, [k]: v }));

  const isUrl = (s: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s.trim());
  const normalizeUrl = (s: string) => /^https?:\/\//i.test(s) ? s.trim() : "https://" + s.trim();

  const analyzeBrand = async () => {
    if (!ctx.url.trim() || !isUrl(ctx.url)) return;
    setScraping(true);
    try {
      const { data } = await supabase.functions.invoke("scrape-url", { body: { url: normalizeUrl(ctx.url) } });
      if (data && !data.error) {
        setScraped(data);
        // Auto-fill from scrape
        setCtx(c => ({
          ...c,
          name: c.name || data.productName || "",
          description: c.description || data.tagline || data.description || "",
        }));
        toast({ title: "Brand analyzed", description: data.productName ? `Found: ${data.productName}` : "Scraped successfully" });
      } else {
        toast({ title: "Couldn't analyze", description: "We'll proceed without scraped context.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Couldn't analyze", variant: "destructive" });
    } finally {
      setScraping(false);
    }
  };

  const run = async () => {
    if (!user) return;
    setRunning(true);
    const normalizedUrl = ctx.url.trim() ? normalizeUrl(ctx.url) : null;
    const brandContext = {
      ...(scraped || {}),
      productName: ctx.name.trim() || scraped?.productName || "",
      description: ctx.description.trim() || scraped?.description || scraped?.tagline || "",
      audience: ctx.audience,
      tone: ctx.tone,
      ...(normalizedUrl ? { url: normalizedUrl } : {}),
    };
    const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
    const workspace_id = await ensureActiveWorkspaceId();
    const { data: project, error } = await supabase.from("projects").insert({
      user_id: user.id,
      workspace_id,
      name: ctx.name.trim(),
      description: ctx.description.trim() || null,
      source_url: normalizedUrl,
      brand_context: brandContext,
    } as any).select().single();
    if (error || !project) { toast({ title: "Failed", description: error?.message, variant: "destructive" }); setRunning(false); return; }

    // Ingest scraped brand artifacts directly as assets (no AI regeneration) when present.
    const ingested = new Set<string>();
    if (scraped) {
      const inserts: any[] = [];
      if (scraped.logo) {
        inserts.push({
          user_id: user.id, workspace_id, project_id: project.id, asset_type: "logo",
          title: `${ctx.name.trim()} logo (imported)`,
          image_url: scraped.logo, thumbnail_url: scraped.logo,
          prompt: `Imported from ${normalizeUrl(ctx.url)}`,
        });
        ingested.add("logo");
      }
      if (Array.isArray(scraped.colors) && scraped.colors.length) {
        const colors = scraped.colors.slice(0, 8);
        const content = `Color system imported from ${normalizeUrl(ctx.url)}\n\n` +
          colors.map((c: string, i: number) => `${i === 0 ? "Primary" : i === 1 ? "Secondary" : "Accent " + (i - 1)}: ${c}`).join("\n");
        inserts.push({
          user_id: user.id, workspace_id, project_id: project.id, asset_type: "color_system",
          title: `${ctx.name.trim()} colors (imported)`, content,
          prompt: `Imported from ${normalizeUrl(ctx.url)}`,
        });
        ingested.add("color_system");
      }
      if (Array.isArray(scraped.fonts) && scraped.fonts.length) {
        const fonts = scraped.fonts.slice(0, 4);
        const content = `Font system imported from ${normalizeUrl(ctx.url)}\n\n` +
          fonts.map((f: string, i: number) => `${i === 0 ? "Headings" : i === 1 ? "Body" : "Accent " + (i - 1)}: ${f}`).join("\n");
        inserts.push({
          user_id: user.id, workspace_id, project_id: project.id, asset_type: "font_system",
          title: `${ctx.name.trim()} fonts (imported)`, content,
          prompt: `Imported from ${normalizeUrl(ctx.url)}`,
        });
        ingested.add("font_system");
      }
      if (inserts.length) {
        await supabase.from("assets").insert(inserts);
      }
    }

    const init: any = {};
    STARTERS.forEach(s => init[s.type] = ingested.has(s.type) ? "done" : "pending");
    setStatus(init);

    const toGenerate = STARTERS.filter(s => !ingested.has(s.type));
    await Promise.all(toGenerate.map(async (s) => {
      setStatus(prev => ({ ...prev, [s.type]: "running" }));
      try {
        const { data, error } = await supabase.functions.invoke("generate-asset", {
          body: { prompt: s.prompt(ctx), asset_type: s.type, project_id: project.id, brand_context: brandContext || undefined },
        });
        const d: any = data;
        const aiErr = handleAiError(d, error, toast);
        if (aiErr?.kind === "no_credits") { setOutOfCredits({ needed: aiErr.needed, remaining: aiErr.remaining }); setStatus(prev => ({ ...prev, [s.type]: "error" })); return; }
        if (aiErr || d?.refused) { setStatus(prev => ({ ...prev, [s.type]: "error" })); return; }
        setStatus(prev => ({ ...prev, [s.type]: "done" }));
        window.dispatchEvent(new Event("credits:refresh"));
      } catch {
        setStatus(prev => ({ ...prev, [s.type]: "error" }));
      }
    }));

    setTimeout(() => nav(`/projects/${project.id}`), 800);
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-neutral-900">
      <button onClick={() => (step === 0 || running) ? nav("/projects") : setStep(s => s - 1)} className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" /> {step === 0 || running ? "Projects" : "Back"}
      </button>

      <div className="mt-6 flex items-center gap-2 text-xs text-neutral-500">
        {["Brand", "Audience", "Generate"].map((t, i) => (
          <div key={t} className={`flex items-center gap-2 ${i === step ? "text-neutral-900" : ""}`}>
            <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${i <= step ? "bg-brand text-brand-foreground" : "bg-neutral-200 text-neutral-500"}`}>{i + 1}</div>
            {t}{i < 2 && <span className="text-neutral-300">·</span>}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="mt-8 space-y-5">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">{template ? `Starting from "${template.name}"` : "Tell us about your brand"}</h1>
          <p className="text-sm text-neutral-500">{template ? "Audience, tone, palette, and fonts are pre-filled. Adjust the name and description, then continue." : "Paste a website URL to extract a real brand, or fill in the fields manually to create one from scratch."}</p>
          {template && (
            <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex gap-1">
                {template.colors.slice(0, 5).map(c => <span key={c} className="h-6 w-6 rounded-md border border-white" style={{ background: c }} />)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{template.name}</div>
                <div className="truncate text-xs text-neutral-500">{template.fonts[0]} · {template.fonts[1]} · {template.tone}</div>
              </div>
              <button type="button" onClick={() => nav("/projects/new")} className="text-xs text-neutral-500 hover:text-neutral-900">Clear</button>
            </div>
          )}

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">Website (optional)</label>
            <div className="mt-1.5 flex gap-2">
              <Input value={ctx.url} onChange={e => { setF("url", e.target.value); setScraped(null); }} placeholder="https://trylaunch.ai" />
              <Button type="button" variant="outline" onClick={analyzeBrand} disabled={!ctx.url.trim() || !isUrl(ctx.url) || scraping} className="shrink-0">
                {scraping ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Globe className="mr-1 h-4 w-4" /> Analyze</>}
              </Button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{scraped ? `Analyzed: ${scraped.productName || ctx.url}${scraped.colors?.length ? ` · ${scraped.colors.length} colors` : ""}` : "We'll scrape colors, fonts, logo and copy."}</p>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">Brand / project name</label>
            <Input value={ctx.name} onChange={e => setF("name", e.target.value)} placeholder="TryLaunch" className="mt-1.5" />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">One-line description</label>
            <Input value={ctx.description} onChange={e => setF("description", e.target.value)} placeholder="The fastest way to launch a SaaS product" className="mt-1.5" />
          </div>
          <Button onClick={() => setStep(1)} disabled={!ctx.name.trim() || !ctx.description.trim()} className="w-full">
            Continue <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="mt-8 space-y-6">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Who & how it feels</h1>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">Primary audience</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {AUDIENCES.map(a => (
                <button key={a} onClick={() => setF("audience", a)} className={`rounded-full border px-3 py-1.5 text-sm ${ctx.audience === a ? "border-brand bg-brand text-brand-foreground" : "border-neutral-200 hover:bg-neutral-50"}`}>{a}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">Tone</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TONES.map(t => (
                <button key={t} onClick={() => setF("tone", t)} className={`rounded-full border px-3 py-1.5 text-sm ${ctx.tone === t ? "border-brand bg-brand text-brand-foreground" : "border-neutral-200 hover:bg-neutral-50"}`}>{t}</button>
              ))}
            </div>
          </div>
          <Button onClick={() => setStep(2)} className="w-full">
            Continue <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-8 space-y-6">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Generate your starter pack</h1>
          <p className="text-sm text-neutral-500">
            We'll create 5 starter designs in a new project: logo, colors, fonts, brand voice, and launch copy.
            {scraped && (
              <> Items we found on your site (
              {[scraped.logo && "logo", scraped.colors?.length && "colors", scraped.fonts?.length && "fonts"].filter(Boolean).join(", ") || "none"}
              ) will be imported as-is — the rest are AI-generated from your brand context.</>
            )}
          </p>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            {STARTERS.map(s => {
              const st = status[s.type] || (running ? "pending" : "pending");
              return (
                <div key={s.type} className="flex items-center justify-between border-b border-neutral-100 py-2.5 last:border-0">
                  <div className="text-sm">{s.label}</div>
                  <div className="text-xs text-neutral-500">
                    {!running && "—"}
                    {st === "pending" && running && "Queued"}
                    {st === "running" && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Generating</span>}
                    {st === "done" && <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="h-3 w-3" /> Done</span>}
                    {st === "error" && <span className="text-red-600">Skipped</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <Button onClick={run} disabled={running} className="w-full">
            {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="mr-1 h-4 w-4" /> Generate starter pack</>}
          </Button>
        </div>
      )}

      <OutOfCreditsModal open={!!outOfCredits} onClose={() => setOutOfCredits(null)} needed={outOfCredits?.needed} remaining={outOfCredits?.remaining} />
    </div>
  );
};

export default ProjectWizard;
