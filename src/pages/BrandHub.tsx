import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { assetHref, isBrandAsset, isDesignAsset, normalizeAssetType } from "@/lib/assetExperience";
import { ensureActiveWorkspaceId } from "@/lib/workspace";
import BrandCover from "@/components/brand/BrandCover";
import { ArrowRight, Check, Download, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Logotype } from "@/components/Logotype";

const supabase = _sb as any;

const MARK_TYPES = new Set(["logo", "logotype", "wordmark", "brandmark", "icon", "app_icon", "favicon", "graphic", "photo", "image"]);

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return message.includes(column.toLowerCase()) && (
    message.includes("column")
    || message.includes("schema cache")
    || message.includes("could not find")
  );
};

type Category = { key: string; label: string; types: string[] };

const CATEGORIES: Category[] = [
  { key: "guidelines", label: "Guidelines", types: ["brand_guidelines"] },
  { key: "logos", label: "Logos", types: ["logo", "logotype", "wordmark", "brandmark", "icon", "app_icon", "favicon", "graphic"] }, // shown as "quick link" tile
  { key: "colors", label: "Colors", types: ["color_system"] },
  { key: "fonts", label: "Fonts", types: ["font_system", "typography_system"] },
  { key: "voice", label: "Brand voice", types: ["brand_voice", "tone_of_voice"] },
  { key: "positioning", label: "Positioning", types: ["positioning", "value_proposition", "messaging_framework"] },
  { key: "launch", label: "Launch copy", types: ["launch_copy", "product_hunt_copy", "ph_copy"] },
  { key: "social", label: "Social", types: ["social_post", "social_copy"] },
  { key: "bios", label: "Bios", types: ["founder_bio", "company_bio", "press_bio"] },
  { key: "website", label: "Website & email", types: ["website_copy", "email_copy"] },
];

const CORE_CATEGORY_KEYS = new Set(["logos", "colors", "fonts", "voice"]);

const KIT_ESSENTIALS = [
  { key: "logo", label: "Logo", types: ["logo", "logotype", "wordmark", "brandmark", "icon", "app_icon", "favicon", "graphic"], prompt: (name: string) => `A polished logo mark for ${name}.` },
  { key: "colors", label: "Colours", types: ["color_system"], prompt: (name: string) => `A cohesive color system for ${name}.` },
  { key: "fonts", label: "Typography", types: ["font_system", "typography_system"], prompt: (name: string) => `A font pairing for ${name}.` },
  { key: "voice", label: "Brand voice", types: ["brand_voice", "tone_of_voice"], prompt: (name: string) => `Brand voice and tone guidelines for ${name}.` },
  { key: "guidelines", label: "Guidelines", types: ["brand_guidelines"], prompt: (name: string) => `Brand guidelines for ${name}.` },
] as const;

export default function BrandHub() {
  const { user } = useAuth();
  
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [completingKit, setCompletingKit] = useState(false);
  const [kitProgress, setKitProgress] = useState("");
  const [assets, setAssets] = useState<any[]>([]);
  const [allDesigns, setAllDesigns] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProject, setActiveProject] = useState<string>(params.get("project") || "");

  const refreshAssets = useCallback(async () => {
    if (!user) return;
    let q = supabase
      .from("assets")
      .select("id,title,asset_type,project_id,content,image_url,thumbnail_url,editor_state,prompt,created_at,meta")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(400);
    const { data } = await q;
    const all = data || [];
    setAllDesigns(all);
    setAssets(all.filter(isBrandAsset));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const workspaceId = await ensureActiveWorkspaceId();
      const loadAssets = async () => {
        let q = supabase
          .from("assets")
          .select("id,title,asset_type,project_id,content,image_url,thumbnail_url,editor_state,prompt,created_at,meta")
          .eq("user_id", user.id);
        if (workspaceId) q = q.eq("workspace_id", workspaceId);
        let result = await q.order("created_at", { ascending: false }).limit(400);
        if (result.error && workspaceId && isMissingColumnError(result.error, "workspace_id")) {
          result = await supabase
            .from("assets")
            .select("id,title,asset_type,project_id,content,image_url,thumbnail_url,editor_state,prompt,created_at,meta")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(400);
        }
        return result.data || [];
      };
      const loadProjects = async () => {
        const result = await supabase
          .from("projects")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100);

        if (result.error) {
          console.error("Failed to load brands", result.error);
          return [];
        }

        return (result.data || []).filter((project: any) => {
          if (project?.deleted_at) return false;
          if (!workspaceId || !Object.prototype.hasOwnProperty.call(project, "workspace_id")) return true;
          return !project.workspace_id || project.workspace_id === workspaceId;
        });
      };
      const [a, p] = await Promise.all([loadAssets(), loadProjects()]);
      if (cancel) return;
      const loadedProjects = (p || []).filter(Boolean);
      const all = (a || []).filter(Boolean);
      setAllDesigns(all);
      setAssets(all.filter(isBrandAsset));
      setProjects(loadedProjects);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user]);

  useEffect(() => {
    setActiveProject(params.get("project") || "");
  }, [params]);

  const selectedProjectId = activeProject || "all";
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;

  const filtered = useMemo(() => {
    if (selectedProjectId === "all") return assets;
    return assets.filter((a) => a?.project_id === selectedProjectId);
  }, [assets, selectedProjectId]);

  const byCategory = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const c of CATEGORIES) map.set(c.key, []);
    for (const a of filtered) {
      if (!a) continue;
      const t = normalizeAssetType(a.asset_type);
      const cat = CATEGORIES.find((c) => c.types.includes(t));
      if (cat) map.get(cat.key)!.push(a);
    }
    return map;
  }, [filtered]);

  const selectedStyle = useMemo(() => {
    const directionId = params.get("direction");
    if (directionId) return allDesigns.find((design) => design.id === directionId) || null;
    const relevantDesigns = selectedProjectId === "all"
      ? allDesigns
      : allDesigns.filter((design) => design.project_id === selectedProjectId);
    return relevantDesigns.find((design) => design.meta?.selected_as_direction) || null;
  }, [allDesigns, params, selectedProjectId]);

  const selectedProjectDesigns = useMemo(() => {
    if (!selectedProject) return [];
    return allDesigns.filter((design) => design.project_id === selectedProject.id);
  }, [allDesigns, selectedProject]);

  const missingEssentials = useMemo(() => {
    const availableTypes = new Set(selectedProjectDesigns.map((design) => normalizeAssetType(design?.asset_type)));
    if (selectedStyle && selectedProject && selectedStyle.project_id === selectedProject.id) {
      availableTypes.add(normalizeAssetType(selectedStyle.asset_type));
    }
    return KIT_ESSENTIALS.filter((essential) => !essential.types.some((type) => availableTypes.has(type)));
  }, [selectedProject, selectedProjectDesigns, selectedStyle]);

  const choosingDirection = Boolean(params.get("direction") && selectedStyle && selectedProject);
  const showKitSetup = choosingDirection && missingEssentials.length > 0;
  const selectedStyleIsLogo = MARK_TYPES.has(normalizeAssetType(selectedStyle?.asset_type));
  const brandKitComplete = Boolean(selectedProject && missingEssentials.length === 0);
  const completedEssentialCount = KIT_ESSENTIALS.length - missingEssentials.length;
  const completeKitHref = selectedProject && selectedStyle
    ? `/brands?${new URLSearchParams({ project: selectedProject.id, direction: selectedStyle.id }).toString()}`
    : "/designs";
  const kitStepComplete = (key: string) => key === "logo"
    ? Boolean(selectedStyleIsLogo || selectedProjectDesigns.some((design) => KIT_ESSENTIALS[0].types.some((type) => type === normalizeAssetType(design.asset_type))))
    : !missingEssentials.some((essential) => essential.key === key);

  const completeBrandKit = async () => {
    if (!selectedProject || !user || completingKit || !missingEssentials.length) return;
    setCompletingKit(true);
    const context = {
      ...(selectedStyle?.meta?.brand_context || selectedStyle?.meta?.brandContext || {}),
      productName: selectedProject.name || selectedStyle?.meta?.brand_context?.productName || "",
    };
    const directionInstruction = selectedStyle
      ? `Use the chosen direction, “${selectedStyle.title || "Untitled design"}”, as the visual foundation. ${selectedStyle.prompt ? `Original brief: ${selectedStyle.prompt}` : ""}`
      : "";
    const results: { essential: typeof missingEssentials[number]; error: unknown }[] = [];
    for (const [index, essential] of missingEssentials.entries()) {
      setKitProgress(`Creating ${essential.label} (${index + 1} of ${missingEssentials.length})`);
      try {
        const { data, error } = await supabase.functions.invoke("generate-asset", {
          body: {
            prompt: `${essential.prompt(selectedProject.name || "this brand")} ${directionInstruction}`.trim(),
            asset_type: essential.types[0],
            project_id: selectedProject.id,
            brand_context: context,
          },
        });
        results.push({ essential, error: error || data?.error || (data?.refused ? new Error(data.message || "Generation refused") : null) });
      } catch (error) {
        results.push({ essential, error });
      }
    }
    const failed = results.filter((result) => result.error);
    await refreshAssets();
    setCompletingKit(false);
    setKitProgress("");
    if (failed.length) {
      toast({
        title: "Some brand essentials could not be created",
        description: `${failed.map((result) => result.essential.label).join(", ")} can be retried from this brand.`,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Your brand kit is ready", description: "Download it whenever you are ready to use it." });
  };

  const createWithStyleHref = (assetType: string, prompt: string) => selectedStyle
    ? `/create?${new URLSearchParams({
      direction: selectedStyle.id,
      ...(selectedStyle.project_id ? { project: selectedStyle.project_id } : {}),
      asset_type: assetType,
      prompt,
    }).toString()}`
    : "/designs";

  const projectLink = (cat: Category) => {
    // Prefer a project that has assets in this category, otherwise the first project.
    const withHit = filtered.find((a) => cat.types.includes(normalizeAssetType(a.asset_type)));
    const pid = withHit?.project_id || (selectedProjectId !== "all" ? selectedProjectId : projects[0]?.id);
    return pid ? `/brands/${pid}?cat=${cat.types[0]}` : `/projects`;
  };
  const coreCategories = CATEGORIES.filter((category) => CORE_CATEGORY_KEYS.has(category.key));
  const supportingCategories = CATEGORIES.filter((category) => !CORE_CATEGORY_KEYS.has(category.key));
  const createOnBrandHref = selectedStyle
    ? createWithStyleHref("graphic", "Create a new design for our brand.")
    : selectedProject
      ? `/create?${new URLSearchParams({ project: selectedProject.id }).toString()}`
      : "/create";

  const refreshableDesigns = useMemo(() => {
    if (!selectedStyle || !selectedProject) return [];
    const directionChosenAt = Date.parse(selectedStyle.meta?.selected_as_direction_at || "");
    if (!Number.isFinite(directionChosenAt)) return [];
    return selectedProjectDesigns.filter((design) =>
      design.id !== selectedStyle.id
      && isDesignAsset(design)
      && Date.parse(design.created_at || "") < directionChosenAt,
    );
  }, [selectedProject, selectedProjectDesigns, selectedStyle]);

  const refreshSuggestions = [
    { assetType: "social_graphic", label: "Refresh a social graphic", prompt: "Create a refreshed social graphic using our current approved brand direction." },
    { assetType: "launch_graphic", label: "Refresh a launch graphic", prompt: "Create a refreshed launch graphic using our current approved brand direction." },
    { assetType: "template", label: "Refresh a template", prompt: "Create a refreshed reusable template using our current approved brand direction." },
  ];


  const projectDesignCount = (projectId: string) =>
    allDesigns.filter((design) => design.project_id === projectId && Boolean(design?.meta?.saved_at)).length;

  // Pre-index designs by project once, so card rendering is O(P) not O(P*A).
  const designsByProject = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const d of allDesigns) {
      if (!d?.project_id) continue;
      let bucket = map.get(d.project_id);
      if (!bucket) { bucket = []; map.set(d.project_id, bucket); }
      bucket.push(d);
    }
    return map;
  }, [allDesigns]);
  const projectLogos = useMemo(() => {
    const map = new Map<string, any>();
    for (const [pid, list] of designsByProject.entries()) {
      const isMark = (d: any) => MARK_TYPES.has(normalizeAssetType(d.asset_type)) || d?.editor_state?.kind === "logotype";
      const hit = list.find(isMark) || list.find((d: any) => d?.image_url || d?.editor_state);
      if (hit) map.set(pid, hit);
    }
    return map;
  }, [designsByProject]);

  const projectKitProgress = (projectId: string) => {
    const types = new Set(allDesigns
      .filter((design) => design.project_id === projectId)
      .map((design) => normalizeAssetType(design.asset_type)));
    return KIT_ESSENTIALS.filter((essential) => essential.types.some((type) => types.has(type))).length;
  };

  if (!activeProject && !params.get("direction")) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Brand Kits</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">Every brand kit you've saved.</p>
        </div>

        {loading ? (
          <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-neutral-200 bg-white">
                <div className="aspect-square rounded-t-2xl bg-neutral-100" />
                <div className="p-4"><div className="h-3.5 w-2/3 rounded bg-neutral-100" /></div>
              </div>
            ))}
          </section>
        ) : projects.length ? (
          <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((project) => {
              const logo = projectLogos.get(project.id);
              const preview = logo?.thumbnail_url || logo?.image_url || project?.cover_url;
              const logoState = logo?.editor_state?.kind === "logotype" ? logo.editor_state : null;
              const designCount = designsByProject.get(project.id)?.length || 0;
              return (
                <div key={project.id} className="group relative">
                  <Link
                    to={`/brands/${project.id}`}
                    className="block overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
                  >
                  <div className="flex aspect-square items-center justify-center bg-neutral-50 p-6">
                    {logoState ? (
                      <Logotype state={logoState} fit="contain" />
                    ) : preview ? (
                      <img src={preview} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-neutral-900 text-lg font-semibold text-white">
                        {String(project.name || "B").trim().slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-neutral-100 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900">{project.name || "Untitled brand"}</p>
                      <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                        {designCount} design{designCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  </Link>
                  <button
                    type="button"
                    title="Move to Trash"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      await supabase.from("projects").update({ deleted_at: new Date().toISOString() }).eq("id", project.id);
                      setProjects((prev) => prev.filter((p) => p.id !== project.id));
                      toast({ title: "Moved to Trash" });
                    }}
                    className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white/90 text-red-600 opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
            <h2 className="text-lg font-semibold text-neutral-900">No brands yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">Start with a logo, then Rocket builds the colours, type and voice around it.</p>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {activeProject && <Link to="/brands" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900">← All brands</Link>}
          <h1 className="text-3xl font-semibold tracking-tight">{selectedProject?.name || "Your brand"}</h1>
          <p className="mt-1 text-sm text-neutral-500">Logo, colours, typography and every future design in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          {!choosingDirection && (
            <>
              <Link
                to="/trash"
                title="Trash"
                aria-label="Trash"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
              >
                <Trash2 className="h-4 w-4" />
              </Link>
              {selectedProject && (
                <Link
                  to={`/projects/${selectedProject.id}/hub`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
                >
                  <Download className="h-4 w-4" /> Download
                </Link>
              )}
              <Link to={createOnBrandHref} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:bg-brand-hover">
                <Sparkles className="h-4 w-4" /> Create on-brand
              </Link>
            </>
          )}
        </div>
      </div>

      {choosingDirection && (
        <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand/25 bg-brand/5 px-5 py-5 shadow-sm">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">{selectedStyleIsLogo ? "Logo chosen" : "Style chosen"}</p>
              <p className="mt-1 text-sm text-neutral-600">
                <span className="font-medium text-neutral-900">{selectedStyle.title || "This design"}</span> will guide your {selectedStyleIsLogo ? "colours, typography, voice and guidelines" : "logo, colours, typography, voice and guidelines"}.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {KIT_ESSENTIALS.map((essential) => {
                  const complete = kitStepComplete(essential.key);
                  return (
                    <span key={essential.key} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 bg-white text-neutral-500"}`}>
                      {complete ? <Check className="h-3 w-3" /> : <span className="grid h-3 w-3 place-items-center rounded-full border border-current text-[8px]">{KIT_ESSENTIALS.indexOf(essential) + 1}</span>}
                      {essential.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          {missingEssentials.length > 0 ? (
            <button
              type="button"
              onClick={() => void completeBrandKit()}
              disabled={completingKit}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:bg-brand-hover disabled:opacity-60"
            >
              {completingKit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {completingKit ? kitProgress || "Completing your brand kit…" : "Complete your brand kit"}
            </button>
          ) : (
            <Link
              to={`/projects/${selectedProject.id}/hub`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:bg-brand-hover"
            >
              <Download className="h-4 w-4" /> Download
            </Link>
          )}
        </section>
      )}

      {!showKitSetup && !activeProject && projects.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">Choose a brand</h2>
              <p className="mt-1 text-sm text-neutral-500">Open the brand system you want to work on.</p>
            </div>
            {selectedProject && <span className="text-xs font-medium text-neutral-500">Working in {selectedProject.name}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const isActive = project.id === selectedProjectId;
              const count = projectDesignCount(project.id);
              return (
                <Link
                  key={project.id}
                  to={`/brands?project=${project.id}`}
                  className={`group rounded-2xl border p-4 transition ${isActive ? "border-brand bg-brand/5 shadow-sm" : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">{project.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">{count} {count === 1 ? "design" : "designs"}</p>
                    </div>
                    <ArrowRight className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? "text-brand" : "text-neutral-400 group-hover:text-neutral-900"}`} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!showKitSetup && <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white px-5 py-4 shadow-sm">
        {selectedStyle ? (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Your style</p>
              <p className="truncate text-sm font-medium text-neutral-900">{selectedStyle.title || "Untitled design"}</p>
            </div>
            <Link to={assetHref(selectedStyle)} className="ml-1 shrink-0 text-sm font-medium text-neutral-600 hover:text-neutral-900">Change</Link>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Your style</p>
              <p className="text-sm text-neutral-600">Choose a design you like to guide future work.</p>
            </div>
            <Link to="/designs" className="ml-1 shrink-0 text-sm font-medium text-neutral-600 hover:text-neutral-900">Choose</Link>
          </div>
        )}
        {selectedProject && (
          <div className="flex min-w-0 items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${brandKitComplete ? "bg-emerald-500 text-white" : "bg-brand/10 text-brand"}`}>
              {brandKitComplete ? <Check className="h-4 w-4" /> : completedEssentialCount}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-neutral-900">{brandKitComplete ? "Brand kit ready" : `${completedEssentialCount} of ${KIT_ESSENTIALS.length} essentials ready`}</p>
              <p className="text-[11px] text-neutral-500">{brandKitComplete ? "Download everything together." : "Complete your kit to make this style reusable."}</p>
            </div>
            <Link
              to={brandKitComplete ? `/projects/${selectedProject.id}/hub` : completeKitHref}
              className="ml-1 shrink-0 text-sm font-medium text-brand hover:text-brand-hover"
            >
              {brandKitComplete ? "Download" : "Continue"}
            </Link>
          </div>
        )}
      </section>}

      {!showKitSetup && refreshableDesigns.length > 0 && selectedProject && (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                <RefreshCw className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">Your brand direction changed</p>
                <p className="mt-1 max-w-2xl text-sm text-neutral-600">
                  {refreshableDesigns.length} existing {refreshableDesigns.length === 1 ? "design was" : "designs were"} made before you chose <span className="font-medium text-neutral-900">{selectedStyle.title || "this direction"}</span>. Create refreshed versions instead of overwriting the originals.
                </p>
              </div>
            </div>
            <Link to={`/projects/${selectedProject.id}`} className="shrink-0 text-sm font-medium text-neutral-700 hover:text-neutral-900">View designs</Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {refreshSuggestions.map((suggestion) => (
              <Link
                key={suggestion.assetType}
                to={createWithStyleHref(suggestion.assetType, suggestion.prompt)}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 transition hover:border-amber-400 hover:bg-amber-100"
              >
                <RefreshCw className="h-3.5 w-3.5 text-amber-700" /> {suggestion.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {!showKitSetup && <div className="mt-8 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Core identity</h2>
          <p className="mt-1 text-sm text-neutral-500">The essentials every new design should follow.</p>
        </div>
      </div>}
      {!showKitSetup && <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {coreCategories.map((cat) => {
          const items = byCategory.get(cat.key) || [];
          const isLogos = cat.key === "logos"; // logos live in Designs, not Brand — link there
          return (
            <Link
              key={cat.key}
              to={isLogos ? "/designs?type=logotype" : projectLink(cat)}
              className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:shadow-md"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-50">
                {items.length === 0 ? (
                  <div className="flex h-full w-full items-center justify-center text-neutral-300">
                    <Plus className="h-8 w-8" />
                  </div>
                ) : items.length === 1 ? (
                  <BrandCover asset={items[0]} />
                ) : (
                  <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5 bg-neutral-100">
                    {items.slice(0, 4).map((a) => (
                      <div key={a.id} className="overflow-hidden bg-white">
                        <BrandCover asset={a} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-neutral-100 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-neutral-900">{cat.label}</div>
                  <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                    {items.length === 0 ? "Not chosen yet" : `${items.length} ${items.length === 1 ? "design" : "designs"}`}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400 transition group-hover:text-neutral-900" />
              </div>
            </Link>
          );
        })}
      </div>}

      {!showKitSetup && <section className="mt-8 border-t border-neutral-200 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Supporting material</h2>
            <p className="mt-1 text-sm text-neutral-500">Guidance and launch work built from your core identity.</p>
          </div>
          <Link to="/designs" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">View all designs</Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {supportingCategories.map((cat) => {
            const items = byCategory.get(cat.key) || [];
            return (
              <Link key={cat.key} to={projectLink(cat)} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-400 hover:text-neutral-900">
                {cat.label}
                {items.length > 0 && <span className="text-xs text-neutral-400">{items.length}</span>}
                <ArrowRight className="h-3.5 w-3.5 text-neutral-400" />
              </Link>
            );
          })}
        </div>
      </section>}

      {!showKitSetup && !loading && assets.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">Start your brand</h2>
          <p className="mt-1 text-sm text-neutral-500">Create a logo, then choose the colours, type and voice that fit it.</p>
          <Link to="/create" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover">
            <Sparkles className="h-4 w-4" /> Create your first design
          </Link>
        </div>
      )}

    </div>
  );
}
