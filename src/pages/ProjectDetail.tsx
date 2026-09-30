import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { assetHref, BRAND_TYPES, DESIGN_TYPES, isBrandAsset, normalizeAssetType } from "@/lib/assetExperience";
import BrandCover from "@/components/brand/BrandCover";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Sparkles, Trash2, Check, Paintbrush, Send, Radio, Wand2, LayoutGrid, List, ArrowUpDown, CheckSquare, Square, Loader2, Zap, X, RefreshCw, Download } from "lucide-react";
import { AssetGridSkeleton } from "@/components/Skeletons";
import { Logotype } from "@/components/Logotype";
import { handleAiError } from "@/lib/aiErrors";
import { CollectionView, DesignSort, sortByOption } from "@/lib/designCollections";
import ProjectNavigation from "@/components/ProjectNavigation";
const supabase = _sb as any;

type WF = "brand" | "design" | "launch" | "promote" | "other";
const WF_OF: Record<string, WF> = {
  logo: "brand", brand_guidelines: "brand", color_system: "brand", font_system: "brand", brand_voice: "brand",
  graphic: "design", icon: "design", photo: "design", template: "design",
  launch_copy: "launch", product_hunt_copy: "launch", presentation: "launch",
  social_post: "promote", founder_bio: "promote",
};
const WF_META: Record<WF, { label: string; Icon: any }> = {
  brand: { label: "Brand", Icon: Sparkles },
  design: { label: "Design", Icon: Paintbrush },
  launch: { label: "Launch", Icon: Send },
  promote: { label: "Promote", Icon: Radio },
  other: { label: "Other", Icon: Wand2 },
};
const wfOf = (t: string): WF => WF_OF[t] || "other";
const designStatus = (asset: any) => {
  const meta = asset?.meta || {};
  if (meta.downloaded_at) return "Downloaded";
  if (meta.approved_at || meta.selected_as_direction) return "Approved";
  if (meta.edited_at) return "Edited";
  return "Ready";
};

const ProjectDetail = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [allAssets, setAllAssets] = useState<any[]>([]);
  const [picking, setPicking] = useState(false);
  const [allDesigns, setAllDesigns] = useState<any[]>([]);
  const [pickingDesign, setPickingDesign] = useState(false);
  const [tab, setTab] = useState<"all" | WF>("all");
  const [completing, setCompleting] = useState(false);
  const [completionStatus, setCompletionStatus] = useState<Record<string, "pending" | "running" | "done" | "error">>({});
  const [completionErrors, setCompletionErrors] = useState<Record<string, string>>({});
  const [completePanelOpen, setCompletePanelOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<CollectionView>("card");
  const [sort, setSort] = useState<DesignSort>("date");
  const [selectMode, setSelectMode] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsUrl, setSettingsUrl] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const section = params.get("section") === "settings" ? "settings" : params.get("section") === "templates" ? "templates" : "designs";
  const toggleSelect = (assetId: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(assetId) ? next.delete(assetId) : next.add(assetId);
    return next;
  });
  const clearSelection = () => setSelected(new Set());
  const bulkRemoveFromProject = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Remove ${ids.length} design${ids.length === 1 ? "" : "s"} from project?`)) return;
    const { error } = await supabase.from("assets").update({ project_id: null }).in("id", ids);
    if (error) { toast({ title: "Remove failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Removed ${ids.length} design${ids.length === 1 ? "" : "s"} from project` });
    clearSelection();
    load();
  };
  const bulkTrash = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Move ${ids.length} design${ids.length === 1 ? "" : "s"} to Trash?`)) return;
    const { error } = await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).in("id", ids);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Moved ${ids.length} to Trash` });
    clearSelection();
    load();
  };
  const selectAllVisible = (visibleAssets: any[]) => setSelected(new Set(visibleAssets.map(a => a.id)));

  const CORE_KIT: { type: string; label: string; prompt: (name: string, ctx: any) => string }[] = [
    { type: "logo", label: "Logotype", prompt: (n, c) => `A polished text-based logotype for ${n}${c?.url ? ` (${c.url})` : ""}. ${c?.tagline || c?.description || ""}` },
    { type: "color_system", label: "Color system", prompt: (n, c) => `A cohesive color system for ${n}. ${c?.description || c?.tagline || ""}` },
    { type: "font_system", label: "Font system", prompt: (n, c) => `A font pairing (heading + body) for ${n}. ${c?.tagline || ""}` },
    { type: "brand_voice", label: "Brand voice", prompt: (n, c) => `Brand voice and tone guidelines for ${n}. ${c?.description || ""}` },
    { type: "brand_guidelines", label: "Brand guidelines", prompt: (n, c) => `Brand guidelines overview for ${n}. ${c?.description || ""}` },
  ];

  const missingKit = () => {
    const have = new Set(assets.map((a: any) => a.asset_type));
    return CORE_KIT.filter(k => !have.has(k.type));
  };

  const runKitGeneration = async (targets: { type: string; label: string; prompt: (n: string, c: any) => string }[]) => {
    if (!project || !user || !targets.length) return;
    setCompleting(true);
    setCompletePanelOpen(true);
    setCompletionStatus(prev => {
      const next = { ...prev };
      targets.forEach(k => (next[k.type] = "pending"));
      return next;
    });
    setCompletionErrors(prev => {
      const next = { ...prev };
      targets.forEach(k => { delete next[k.type]; });
      return next;
    });

    const name = project.name || "Brand";
    const ctx = project.brand_context || (project.source_url ? { url: project.source_url, productName: name } : null);

    await Promise.all(targets.map(async (k) => {
      setCompletionStatus(prev => ({ ...prev, [k.type]: "running" }));
      try {
        const { data, error } = await supabase.functions.invoke("generate-asset", {
          body: { prompt: k.prompt(name, ctx), asset_type: k.type, project_id: project.id, brand_context: ctx || undefined },
        });
        const d: any = data;
        const aiErr = handleAiError(d, error, toast);
        if (aiErr) {
          setCompletionStatus(prev => ({ ...prev, [k.type]: "error" }));
          setCompletionErrors(prev => ({ ...prev, [k.type]: aiErr.kind === "no_credits" ? "Out of credits" : aiErr.message }));
          return;
        }
        if (d?.refused) {
          setCompletionStatus(prev => ({ ...prev, [k.type]: "error" }));
          setCompletionErrors(prev => ({ ...prev, [k.type]: d?.message || "Refused" }));
          return;
        }
        setCompletionStatus(prev => ({ ...prev, [k.type]: "done" }));
        window.dispatchEvent(new Event("credits:refresh"));
      } catch (e: any) {
        setCompletionStatus(prev => ({ ...prev, [k.type]: "error" }));
        setCompletionErrors(prev => ({ ...prev, [k.type]: e?.message || "Network error" }));
      }
    }));

    setCompleting(false);
    await load();
  };

  const completeBrandKit = async () => {
    const missing = missingKit();
    if (!missing.length) {
      toast({ title: "Brand kit is complete", description: "All core brand designs already exist." });
      nav(`/brands/${id}`);
      return;
    }
    await runKitGeneration(missing);
    toast({ title: "Brand kit updated", description: "Review results below — retry any that failed." });
    nav(`/brands/${id}`);
  };

  const retryOne = async (type: string) => {
    const k = CORE_KIT.find(x => x.type === type);
    if (k) await runKitGeneration([k]);
  };

  const retryAllFailed = async () => {
    const failed = Object.entries(completionStatus).filter(([, s]) => s === "error").map(([t]) => t);
    const targets = CORE_KIT.filter(k => failed.includes(k.type));
    if (targets.length) await runKitGeneration(targets);
  };

  const load = async () => {
    if (!id || !user) return;
    const [p, a] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).maybeSingle(),
      supabase.from("assets").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    ]);
    setProject(p.data); setAssets(a.data || []);
  };
  useEffect(() => { load(); }, [id, user]);

  useEffect(() => {
    if (!project) return;
    setSettingsName(project.name || "");
    setSettingsDescription(project.description || "");
    setSettingsUrl(project.source_url || "");
  }, [project]);

  const saveProjectSettings = async () => {
    if (!id || !settingsName.trim()) {
      toast({ title: "Name your brand", description: "A project needs a name.", variant: "destructive" });
      return;
    }
    setSavingSettings(true);
    const brandContext = {
      ...(project?.brand_context || {}),
      productName: settingsName.trim(),
      description: settingsDescription.trim() || undefined,
      url: settingsUrl.trim() || undefined,
    };
    const { error } = await supabase
      .from("projects")
      .update({
        name: settingsName.trim(),
        description: settingsDescription.trim() || null,
        source_url: settingsUrl.trim() || null,
        brand_context: brandContext,
      })
      .eq("id", id);
    setSavingSettings(false);
    if (error) {
      toast({ title: "Could not save project settings", description: error.message, variant: "destructive" });
      return;
    }
    setProject((current: any) => current ? {
      ...current,
      name: settingsName.trim(),
      description: settingsDescription.trim() || null,
      source_url: settingsUrl.trim() || null,
      brand_context: brandContext,
    } : current);
    toast({ title: "Brand settings saved" });
  };

  const openPicker = async () => {
    const { data } = await supabase
      .from("assets")
      .select("id, title, asset_type, image_url, content, project_id")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .in("asset_type", [...BRAND_TYPES])
      .order("created_at", { ascending: false })
      .limit(200);
    // Exclude assets already in this project
    setAllAssets((data || []).filter((a: any) => a.project_id !== id)); setPicking(true);
  };

  const openDesignPicker = async () => {
    const { data } = await supabase
      .from("assets")
      .select("id, title, asset_type, image_url, content, editor_state, project_id")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .in("asset_type", [...DESIGN_TYPES])
      .order("created_at", { ascending: false })
      .limit(200);
    setAllDesigns((data || []).filter((a: any) => a.project_id !== id)); setPickingDesign(true);
  };

  const addAsset = async (assetId: string) => {
    await supabase.from("assets").update({ project_id: id }).eq("id", assetId);
    setPicking(false); load();
  };

  const removeAsset = async (assetId: string) => {
    if (!confirm("Remove from project?")) return;
    await supabase.from("assets").update({ project_id: null }).eq("id", assetId);
    load();
  };

  const counts: Record<WF, number> = { brand: 0, design: 0, launch: 0, promote: 0, other: 0 };
  for (const a of assets) counts[wfOf(a.asset_type)]++;
  const workspaceAssets = section === "templates"
    ? assets.filter((asset) => ["template", "brand_template", "social_template", "presentation"].includes(normalizeAssetType(asset.asset_type)))
    : assets;
  const visible = tab === "all" ? workspaceAssets : workspaceAssets.filter(a => wfOf(a.asset_type) === tab);
  const visibleSorted = useMemo(() => sortByOption(visible, sort, a => a.title, a => a.created_at), [visible, sort]);
  const tabs: ("all" | WF)[] = ["all", "brand", "design", "launch", "promote", "other"];

  if (!project) return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="h-8 w-1/3 animate-pulse rounded bg-neutral-100" />
      <AssetGridSkeleton />
    </div>
  );

  if (section === "settings") return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"><ArrowLeft className="h-4 w-4" /> Brands</Link>
      <div className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{project.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">Keep the context Rocket uses for every design in this brand.</p>
      </div>
      <div className="mt-6">
        <ProjectNavigation projectId={id!} active="settings" />
      </div>
      <form
        className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        onSubmit={(event) => { event.preventDefault(); void saveProjectSettings(); }}
      >
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold text-neutral-900">Brand settings</h2>
          <p className="mt-1 text-sm text-neutral-500">Your name and website help Rocket carry the right context into every new design.</p>
        </div>
        <div className="mt-6 grid gap-5">
          <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
            Brand name
            <input value={settingsName} onChange={(event) => setSettingsName(event.target.value)} className="h-10 rounded-lg border border-neutral-200 px-3 text-sm font-normal outline-hidden focus:border-neutral-400" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
            Website
            <input value={settingsUrl} onChange={(event) => setSettingsUrl(event.target.value)} placeholder="https://yourcompany.com" className="h-10 rounded-lg border border-neutral-200 px-3 text-sm font-normal outline-hidden focus:border-neutral-400" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
            Brand description
            <textarea value={settingsDescription} onChange={(event) => setSettingsDescription(event.target.value)} placeholder="What does this company do?" rows={4} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-normal outline-hidden focus:border-neutral-400" />
          </label>
        </div>
        <button disabled={savingSettings} className="mt-6 inline-flex items-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:bg-brand-hover disabled:opacity-50">
          {savingSettings ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"><ArrowLeft className="h-4 w-4" /> Projects</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{project.name}</h1>
        <div className="flex flex-wrap gap-2">
          <Link to={`/projects/${id}/hub`} className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10"><Download className="h-4 w-4" /> Download</Link>
          <button onClick={openDesignPicker} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm hover:bg-neutral-50"><Plus className="h-4 w-4" /> Add design</button>
          <button onClick={openPicker} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm hover:bg-neutral-50"><Plus className="h-4 w-4" /> Add brand work</button>
          {missingKit().length > 0 && (
            <button
              onClick={completeBrandKit}
              disabled={completing}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/15 disabled:opacity-50"
              title={`Generate ${missingKit().length} missing brand asset${missingKit().length === 1 ? "" : "s"}`}
            >
              {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Complete brand kit
              <span className="ml-1 rounded-full bg-brand/20 px-1.5 text-[10px]">{missingKit().length}</span>
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        <ProjectNavigation projectId={id!} active={section === "templates" ? "templates" : "designs"} />
      </div>

      {section === "templates" && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900">Templates</h2>
          <p className="mt-1 text-sm text-neutral-500">Reusable layouts and presentations for this brand.</p>
        </div>
      )}

      {workspaceAssets.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-1.5 border-b border-neutral-200 pb-2">
          {tabs.map(t => {
            const count = t === "all" ? workspaceAssets.length : workspaceAssets.filter((asset) => wfOf(asset.asset_type) === t).length;
            if (t !== "all" && count === 0) return null;
            const label = t === "all" ? "All" : WF_META[t as WF].label;
            return (
              <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1 text-xs ${tab === t ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
                {label} <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {workspaceAssets.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-1">
            <button onClick={() => setView("card")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${view === "card" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Card
            </button>
            <button onClick={() => setView("list")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${view === "list" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-1">
            <button onClick={() => setSort("name")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${sort === "name" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              <ArrowUpDown className="h-3.5 w-3.5" /> Name (A–Z)
            </button>
            <button onClick={() => setSort("date")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${sort === "date" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              Date created
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setSelectMode(v => !v); clearSelection(); }}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${selectMode ? "border-brand bg-brand/10 text-brand" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}
            >
              {selectMode ? <X className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />} {selectMode ? "Cancel" : "Select"}
            </button>
          </div>
        </div>
      )}

      {section === "templates" && workspaceAssets.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <h2 className="text-lg font-semibold text-neutral-900">No templates in this brand yet.</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">Create a social post, presentation, or reusable layout and it will appear here.</p>
          <Link to={`/create?project=${id}&asset_type=template&prompt=${encodeURIComponent(`Create a reusable brand template for ${project.name}`)}`} className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover">
            <Sparkles className="h-4 w-4" /> Create a template
          </Link>
        </div>
      ) : assets.length === 0 ? (
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Get started</div>
            <h2 className="mt-1 text-lg font-semibold">Your first brand kit in 4 steps</h2>
            <ol className="mt-4 space-y-3 text-sm">
              {[
                { n: 1, title: "Add brand context", desc: project.source_url ? "URL analyzed ✓" : "Set a source URL in project settings so Rocket knows your brand.", done: !!project.source_url },
                { n: 2, title: "Generate your logotype", desc: "Start with a wordmark — everything else builds from it." },
                { n: 3, title: "Complete the core kit", desc: "One click generates colors, fonts, voice, and guidelines." },
                { n: 4, title: "Share or download", desc: "Public link for stakeholders, or ZIP the whole pack." },
              ].map((s) => (
                <li key={s.n} className="flex gap-3">
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${s.done ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                    {s.done ? <Check className="h-3.5 w-3.5" /> : s.n}
                  </div>
                  <div>
                    <div className="font-medium text-neutral-900">{s.title}</div>
                    <div className="text-xs text-neutral-500">{s.desc}</div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to={`/create?project=${id}&workflow=brand&prompt=${encodeURIComponent(`Logotype for ${project.name}`)}`} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover"><Sparkles className="h-4 w-4" /> Generate logotype</Link>
              <button onClick={completeBrandKit} disabled={completing} className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/15 disabled:opacity-50">
                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Complete brand kit
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("rocket:start-tour"))}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
                title="Take a 60-second tour"
              >
                Take the tour
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Or</div>
            <h2 className="mt-1 text-lg font-semibold">Bring in existing work</h2>
            <p className="mt-1 text-sm text-neutral-500">Attach brand work you've already generated in Rocket to this project.</p>
            <button onClick={openPicker} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm hover:bg-neutral-50"><Plus className="h-4 w-4" /> Add existing brand work</button>
          </div>
        </div>
      ) : view === "card" ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visibleSorted.map(a => (
            <div key={a.id} className={`group relative overflow-hidden rounded-2xl border bg-white ${selected.has(a.id) ? "border-brand ring-2 ring-brand/40" : "border-neutral-200"}`}>
              <Link to={assetHref(a)} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (selected.size > 0 || selectMode) { e.preventDefault(); toggleSelect(a.id); } }}>
                <div className="aspect-square w-full bg-neutral-50">
                  {a?.editor_state?.kind === "logotype" ? <Logotype state={a.editor_state} fit="contain" /> :
                    a.image_url ? <img src={a.image_url} alt={a.title} className="h-full w-full object-cover" /> :
                    isBrandAsset(a) ? <BrandCover asset={a} /> :
                    <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-neutral-500"><div className="line-clamp-6 whitespace-pre-wrap">{(a.content || "").slice(0, 200)}</div></div>}
                </div>
                <div className="border-t border-neutral-100 p-3">
                  <div className="truncate text-sm font-medium">{a.title}</div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">{a.asset_type} · {designStatus(a)}</div>
                </div>
              </Link>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(a.id); }}
                className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border bg-white/95 transition ${selected.has(a.id) || selectMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"} ${selected.has(a.id) ? "border-brand text-brand" : "border-neutral-300 text-transparent"}`}
                title={selected.has(a.id) ? "Deselect" : "Select"}
              >
                {selected.has(a.id) && <Check className="h-4 w-4" />}
              </button>
              <button onClick={() => removeAsset(a.id)} className="absolute right-2 top-2 rounded-md bg-white/90 p-1 opacity-0 transition group-hover:opacity-100" title="Remove from project"><Trash2 className="h-4 w-4 text-red-600" /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {visibleSorted.map(a => (
            <div key={a.id} className={`flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0 ${selected.has(a.id) ? "bg-brand/5" : ""}`}>
              <button
                onClick={() => toggleSelect(a.id)}
                className="shrink-0 rounded-md p-1"
                aria-label={selected.has(a.id) ? "Deselect" : "Select"}
              >
                {selected.has(a.id) ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4 text-neutral-500" />}
              </button>
              <Link to={assetHref(a)} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (selected.size > 0 || selectMode) { e.preventDefault(); toggleSelect(a.id); } }} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-14 w-20 overflow-hidden rounded-lg bg-neutral-100">
                  {a?.editor_state?.kind === "logotype" ? <Logotype state={a.editor_state} fit="contain" /> :
                    a.image_url ? <img src={a.image_url} alt={a.title} className="h-full w-full object-cover" /> :
                    isBrandAsset(a) ? <BrandCover asset={a} /> :
                    <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-neutral-500"><div className="line-clamp-3 whitespace-pre-wrap">{(a.content || "").slice(0, 80)}</div></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-neutral-900">{a.title}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{a.asset_type} · {designStatus(a)} · {new Date(a.created_at).toLocaleDateString()}</div>
                </div>
              </Link>
              <button onClick={() => removeAsset(a.id)} className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100" title="Remove from project"><Trash2 className="h-4 w-4 text-red-600" /></button>
            </div>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 shadow-lg">
            <span className="pl-2 pr-1 text-sm font-medium">{selected.size} selected</span>
            <button onClick={() => selectAllVisible(visibleSorted)} className="rounded-full px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100">Select all</button>
            <button onClick={bulkRemoveFromProject} className="rounded-full border border-neutral-200 px-3 py-1 text-xs hover:bg-neutral-50">Remove from project</button>
            <button onClick={bulkTrash} className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700">Move to Trash</button>
            <button onClick={clearSelection} className="rounded-full px-2 py-1 text-neutral-500 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setPicking(false)}>
          <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Add existing asset</h2>
            {allAssets.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-500">No unassigned assets.</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {allAssets.map(a => (
                  <button key={a.id} onClick={() => addAsset(a.id)} className="overflow-hidden rounded-lg border border-neutral-200 text-left hover:border-brand">
                    <div className="aspect-square w-full bg-neutral-50">
                      {a.image_url ? <img src={a.image_url} alt="" className="h-full w-full object-cover" /> : <div className="p-2 text-[10px] text-neutral-500 line-clamp-5">{a.content || ""}</div>}
                    </div>
                    <div className="border-t border-neutral-100 p-2 text-xs truncate">{a.title}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {pickingDesign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setPickingDesign(false)}>
          <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Add design</h2>
            <p className="mt-1 text-xs text-neutral-500">Choose from your designs not yet attached to a project.</p>
            {allDesigns.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-500">No unassigned designs.</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {allDesigns.map(a => (
                  <button key={a.id} onClick={async () => { await addAsset(a.id); setPickingDesign(false); }} className="overflow-hidden rounded-lg border border-neutral-200 text-left hover:border-brand">
                    <div className="aspect-square w-full bg-neutral-50">
                      {a?.editor_state?.kind === "logotype" ? <Logotype state={a.editor_state} fit="contain" /> :
                        a.image_url ? <img src={a.image_url} alt="" className="h-full w-full object-cover" /> :
                        <div className="p-2 text-[10px] text-neutral-500 line-clamp-5">{a.content || ""}</div>}
                    </div>
                    <div className="border-t border-neutral-100 p-2 text-xs truncate">{a.title}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {completePanelOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-80 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium"><Zap className="h-4 w-4 text-brand" /> Completing brand kit</div>
            <div className="flex items-center gap-1">
              {!completing && Object.values(completionStatus).some(s => s === "error") && (
                <button
                  onClick={retryAllFailed}
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] hover:bg-neutral-50"
                  title="Retry all failed"
                >
                  <RefreshCw className="h-3 w-3" /> Retry failed
                </button>
              )}
              <button onClick={() => setCompletePanelOpen(false)} className="rounded p-1 text-neutral-500 hover:bg-neutral-100"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="max-h-72 overflow-auto p-2">
            {Object.entries(completionStatus).map(([type, s]) => {
              const label = CORE_KIT.find(k => k.type === type)?.label || type;
              return (
                <div key={type} className="px-2 py-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-neutral-700">{label}</span>
                    <div className="flex items-center gap-1.5">
                      {s === "pending" && <span className="text-xs text-neutral-400">queued</span>}
                      {s === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}
                      {s === "done" && <Check className="h-4 w-4 text-emerald-600" />}
                      {s === "error" && (
                        <>
                          <span className="text-xs text-red-600">failed</span>
                          <button
                            onClick={() => retryOne(type)}
                            disabled={completing}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] hover:bg-neutral-50 disabled:opacity-50"
                          >
                            <RefreshCw className="h-2.5 w-2.5" /> Retry
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {s === "error" && completionErrors[type] && (
                    <div className="mt-0.5 truncate pr-2 text-[10px] text-red-500" title={completionErrors[type]}>
                      {completionErrors[type]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetail;
