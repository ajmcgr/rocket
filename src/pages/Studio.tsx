import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "@/lib/router-compat";
import { ArrowLeft, Loader2 } from "@/components/EmojiIcons";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import BrandContextStrip from "@/components/BrandContextStrip";
import CurrentDeliverable from "@/components/studio/CurrentDeliverable";
import VariationStrip from "@/components/studio/VariationStrip";
import RelatedAssetsRail from "@/components/studio/RelatedAssetsRail";
import RightInspector from "@/components/studio/RightInspector";
import StudioLeftPanel from "@/components/studio/StudioLeftPanel";
import { getProjectBrandContext, refreshBrandContext } from "@/lib/brandContext";
import { getActiveWorkspaceIdSync } from "@/lib/workspace";
import { handleAiError } from "@/lib/aiErrors";

const supabase = _sb as any;

function inferAssetType(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/(favicon|app icon|monochrome|dark version|icon)/.test(p)) return "logo";
  if (/(logotype|wordmark|text logo)/.test(p)) return "logo";
  if (/(color|palette)/.test(p)) return "color_system";
  if (/(font|typograph)/.test(p)) return "font_system";
  if (/(voice|tone)/.test(p)) return "brand_voice";
  if (/(guideline|brand book)/.test(p)) return "brand_guidelines";
  if (/(product hunt|ph launch)/.test(p)) return "product_hunt_copy";
  if (/(launch copy|announcement)/.test(p)) return "launch_copy";
  if (/(tweet|thread|linkedin|social)/.test(p)) return "social_post";
  if (/(pitch|deck|presentation|slides)/.test(p)) return "presentation";
  if (/(founder bio|bio)/.test(p)) return "founder_bio";
  return "logo";
}

export default function Studio() {
  const { id: projectId } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();

  const [project, setProject] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [ctx, setCtx] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeId = params.get("asset") || undefined;
  const active = useMemo(
    () => assets.find((a) => a.id === activeId) || assets[0] || null,
    [assets, activeId],
  );

  const variations = useMemo(() => {
    if (!active) return [] as any[];
    return assets.filter((a) => a.asset_type === active.asset_type);
  }, [assets, active]);

  const load = useCallback(async () => {
    if (!projectId || !user) return;
    const [p, a, c] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase
        .from("assets")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      getProjectBrandContext(projectId),
    ]);
    setProject(p.data);
    setAssets(a.data || []);
    setCtx(c);
  }, [projectId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectAsset = (a: any) => {
    const next = new URLSearchParams(params);
    next.set("asset", a.id);
    setParams(next, { replace: true });
  };

  const handleRefreshCtx = async () => {
    if (!ctx?.url || !projectId) return;
    setRefreshing(true);
    const next = await refreshBrandContext(projectId, ctx.url);
    if (next) setCtx(next);
    setRefreshing(false);
  };

  const handleSend = async (prompt: string) => {
    if (!projectId) return;
    setBusy(true);
    try {
      const asset_type = inferAssetType(prompt);
      const { data, error } = await supabase.functions.invoke("generate-asset", {
        body: {
          prompt,
          asset_type,
          project_id: projectId,
          brand_context: ctx || undefined,
          workspace_id: getActiveWorkspaceIdSync() ?? undefined,
        },
      });
      const d: any = data;
      const aiErr = handleAiError(d, error, toast);
      if (aiErr) throw new Error(aiErr.message);
      if (d?.refused) throw new Error(d.message || "Refused");
      window.dispatchEvent(new Event("credits:refresh"));
      await load();
      const newId = d?.asset_ids?.[0];
      if (newId) {
        const next = new URLSearchParams(params);
        next.set("asset", newId);
        setParams(next, { replace: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVariation = async () => {
    if (!active) return;
    await handleSend(
      `Create another variation of "${active.title || active.asset_type}", keep the same creative direction.`,
    );
  };

  const handleDuplicate = async () => {
    if (!active || !projectId) return;
    const { data, error } = await supabase
      .from("assets")
      .insert({
        user_id: user!.id,
        project_id: projectId,
        asset_type: active.asset_type,
        title: `${active.title || active.asset_type} (copy)`,
        prompt: active.prompt,
        content: active.content,
        image_url: active.image_url,
        editor_state: active.editor_state,
        source_url: active.source_url,
        meta: {
          ...(active.meta || {}),
          parent_id: active.id,
          family_id: active.meta?.family_id || active.id,
        },
      })
      .select("id")
      .single();
    if (error) {
      toast({ title: "Duplicate failed", description: error.message, variant: "destructive" });
      return;
    }
    await load();
    const next = new URLSearchParams(params);
    next.set("asset", (data as any).id);
    setParams(next, { replace: true });
  };

  const handleExport = () => {
    if (!active) return;
    window.open(`/editor?id=${active.id}`, "_blank", "noopener,noreferrer");
  };

  if (!project) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)] w-full overflow-hidden bg-neutral-50">
      <StudioLeftPanel projectId={projectId!} busy={busy} onSend={handleSend} />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-neutral-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <Link
              to={`/projects/${projectId}`}
              className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Project
            </Link>
            <div>
              <div className="text-[10px] font-semibold normal-case tracking-[0.18em] text-neutral-500">
                Brand Studio
              </div>
              <h1 className="text-lg font-semibold text-neutral-900">{project.name}</h1>
            </div>
          </div>
        </div>
        <div className="space-y-6 px-6 py-6">
          {ctx && (
            <BrandContextStrip ctx={ctx} onRefresh={handleRefreshCtx} refreshing={refreshing} />
          )}
          <CurrentDeliverable
            asset={active}
            onVariation={active ? handleVariation : undefined}
            onDuplicate={active ? handleDuplicate : undefined}
            onExport={active ? handleExport : undefined}
          />
          <VariationStrip
            variations={variations}
            activeId={active?.id}
            onSelect={selectAsset}
            onCreate={active ? handleVariation : undefined}
          />
          <RelatedAssetsRail assets={assets} activeId={active?.id} onSelect={selectAsset} />
        </div>
      </main>
      <RightInspector asset={active} />
    </div>
  );
}
