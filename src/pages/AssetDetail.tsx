import { History as ControlHistory, Wand2 as ControlWand2, Loader2 as ControlLoader2, Share2 as ControlShare2, Check as ControlCheck, Edit3 as ControlEdit3, Play as ControlPlay, FileCode as ControlFileCode, Copy as ControlCopy, Trash2 as ControlTrash2, Files as ControlFiles, X as ControlX, Save as ControlSave, Pencil as ControlPencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@/lib/router-compat";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, Download, Edit3, History, Share2, Trash2, RotateCcw, Check, Wand2, Loader2, Pencil, X, Save, FileCode, Play, Files, ChevronLeft, ChevronRight } from "@/components/EmojiIcons";
import { imageUrlToSvg, downloadSvg } from "@/lib/vectorize";
const supabase = _sb as any;
import OutOfCreditsModal from "@/components/OutOfCreditsModal";
import ShareExportModal from "@/components/ShareExportModal";
import AddToProjectMenu from "@/components/AddToProjectMenu";
import VersionHistoryDrawer from "@/components/VersionHistoryDrawer";
import { Skeleton } from "@/components/ui/skeleton";
import { LogotypeEditor } from "@/components/LogotypeEditor";
import { isLogotype, pickLogotypeText, type LogotypeState } from "@/lib/logotype";
import LogotypeExportBar from "@/components/LogotypeExportBar";
import TextAssetExportBar, { hasMarkdownExport } from "@/components/TextAssetExportBar";
import AssetVisual, { hasVisualRenderer } from "@/components/visuals/AssetVisual";
import BrandContextStrip from "@/components/BrandContextStrip";
import RelatedVariantsGrid from "@/components/RelatedVariantsGrid";
import ImageSetGallery from "@/components/visuals/ImageSetGallery";
import { tryJson } from "@/lib/assetSchemas";
import RegenerateFeedbackBar from "@/components/RegenerateFeedbackBar";
import { handleAiError } from "@/lib/aiErrors";
import { track } from "@/lib/analytics";
import CommentsPanel from "@/components/CommentsPanel";

const VARIATION_PRESETS = ["Bolder", "More minimal", "Friendlier tone", "More technical", "Different color direction", "Tighter / shorter"];

const ASSET_TYPE_LABELS: Record<string, string> = {
  logo: "Logo", brand_guidelines: "Brand Guidelines", color_system: "Color System",
  font_system: "Font System", brand_voice: "Brand Voice", graphic: "Graphic",
  icon: "Icon", photo: "Photo", template: "Template", launch_copy: "Launch Copy",
  product_hunt_copy: "Product Hunt Copy", social_post: "Social Post", founder_bio: "Founder Bio",
  presentation: "Presentation", other: "Other",
};

function withResolvedLogotypeText(asset: any): LogotypeState {
  const state = asset.editor_state as LogotypeState;
  const current = String(state?.text || "").trim();
  const isGeneric = /^(brand|logo|logotype|wordmark|text logo)$/i.test(current);
  if (!isGeneric) return state;
  const ctx = asset?.meta?.brand_context || {};
  const resolved = pickLogotypeText({
    prompt: asset?.prompt,
    productName: ctx.productName,
    url: ctx.url || asset?.source_url,
  });
  return resolved ? { ...state, text: resolved, color: state.color || ctx.colors?.[0] } : state;
}

const AssetDetail = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [varyOpen, setVaryOpen] = useState(false);
  const [tweak, setTweak] = useState("");
  const [varying, setVarying] = useState(false);
  const [outOfCredits, setOutOfCredits] = useState<{ needed?: number; remaining?: number } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [refreshingCtx, setRefreshingCtx] = useState(false);

  const load = async () => {
    if (!id) return;
    const [a, v] = await Promise.all([
      supabase.from("assets").select("*").eq("id", id).maybeSingle(),
      supabase.from("asset_versions").select("id, label, created_at").eq("asset_id", id).order("created_at", { ascending: false }),
    ]);
    setAsset(a.data); setVersions(v.data || []); setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  // Load sibling asset ids for prev/next navigation (scoped to the same project if any)
  useEffect(() => {
    if (!asset?.user_id) return;
    let cancelled = false;
    (async () => {
      let q = supabase.from("assets").select("id").eq("user_id", asset.user_id).order("created_at", { ascending: false }).limit(500);
      if (asset.project_id) q = q.eq("project_id", asset.project_id);
      const { data } = await q;
      if (!cancelled && data) setSiblings(data.map((r: any) => r.id));
    })();
    return () => { cancelled = true; };
  }, [asset?.user_id, asset?.project_id]);

  const sibIndex = id ? siblings.indexOf(id) : -1;
  const prevId = sibIndex > 0 ? siblings[sibIndex - 1] : null;
  const nextId = sibIndex >= 0 && sibIndex < siblings.length - 1 ? siblings[sibIndex + 1] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && prevId) { e.preventDefault(); nav(`/designs/${prevId}`); }
      else if (e.key === "ArrowRight" && nextId) { e.preventDefault(); nav(`/designs/${nextId}`); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevId, nextId, nav]);

  if (loading) return (
    <div className="rocket-skeleton-surface mx-auto max-w-5xl space-y-4 rounded-2xl p-10">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="aspect-video w-full" />
    </div>
  );
  if (!asset) return <div className="p-10 text-center text-sm text-neutral-500">Design not found.</div>;

  const isLogo = isLogotype(asset);
  const isImage = !!asset.image_url && !isLogo;
  const hasVisual = hasVisualRenderer(asset);
  const editorHref = `/editor?id=${asset.id}`;
  const logotypeState = isLogo ? withResolvedLogotypeText(asset) : null;
  const brandCtx = asset?.meta?.brand_context || null;
  // JSON asset types that SHOULD parse into a structured visual but currently don't
  // (older assets, half-broken JSON from the model, etc). We offer a one-click rebuild.
  const isStructuredType = [
    "color_system","font_system","brand_voice","brand_guidelines",
    "launch_copy","product_hunt_copy","social_post","founder_bio",
    "presentation","template",
  ].includes(asset.asset_type);
  const parsedOk = isStructuredType ? !!tryJson(asset.content || "") : true;
  const needsRebuild = isStructuredType && !parsedOk && !!asset.content;

  const rebuildAsStructured = async () => {
    setRebuilding(true);
    try {
      const instruction = `Regenerate this ${asset.asset_type.replace(/_/g, " ")} and return STRICT JSON ONLY that matches Rocket's schema for this asset type. No markdown fences, no preamble, no commentary.`;
      const { data, error } = await supabase.functions.invoke("regenerate-asset", {
        body: { asset_id: asset.id, instruction },
      });
      const err = handleAiError(data, error, toast);
      if (err?.kind === "no_credits") { setOutOfCredits({ needed: err.needed, remaining: err.remaining }); return; }
      if (err) return;
      window.dispatchEvent(new Event("credits:refresh"));
      toast({ title: "Rebuilt as structured deliverable" });
      load();
    } catch (e: any) {
      toast({ title: "Rebuild failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setRebuilding(false);
    }
  };

  const startEdit = () => {
    setDraftTitle(asset.title || "");
    setDraftContent(asset.content || "");
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = async () => {
    setSavingEdit(true);
    // snapshot current as a version before overwriting
    await supabase.from("asset_versions").insert({
      asset_id: asset.id, user_id: asset.user_id, label: "Auto-saved before edit",
      snapshot: { editor_state: asset.editor_state, content: asset.content, image_url: asset.image_url, title: asset.title },
    });
    const { error } = await supabase.from("assets").update({
      title: draftTitle.trim() || asset.title,
      content: draftContent,
    }).eq("id", asset.id);
    setSavingEdit(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saved" });
    setEditing(false);
    load();
  };

  const shareUrl = asset.share_token ? `${window.location.origin}/share/asset/${asset.share_token}` : null;

  const saveLogotype = async (state: LogotypeState) => {
    setSavingEdit(true);
    await supabase.from("asset_versions").insert({
      asset_id: asset.id, user_id: asset.user_id, label: "Auto-saved before edit",
      snapshot: { editor_state: asset.editor_state, content: asset.content, image_url: asset.image_url, title: asset.title },
    });
    const { error } = await supabase.from("assets").update({ editor_state: state }).eq("id", asset.id);
    setSavingEdit(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saved" });
    load();
  };

  const copy = () => { navigator.clipboard.writeText(asset.content || ""); toast({ title: "Copied" }); };
  const del = async () => {
    if (!confirm("Move this asset to Trash?")) return;
    const { error } = await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).eq("id", asset.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Moved to Trash", description: "Restore anytime from /trash" });
    nav("/designs");
  };

  const duplicate = async () => {
    setDuplicating(true);
    try {
      const { id: _id, created_at: _c, updated_at: _u, share_token: _s, ...rest } = asset;
      const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
      const workspace_id = await ensureActiveWorkspaceId();
      const insertRow: any = {
        ...rest,
        workspace_id: workspace_id || (rest as any).workspace_id,
        title: `${asset.title || "Untitled"} (copy)`,
        share_token: null,
      };
      const { data, error } = await supabase.from("assets").insert(insertRow).select("id").maybeSingle();
      if (error) { toast({ title: "Duplicate failed", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Duplicated" });
      if (data?.id) nav(`/designs/${data.id}`);
    } finally {
      setDuplicating(false);
    }
  };

  const toggleShare = async () => {
    setSharing(true);
    if (asset.share_token) {
      await supabase.from("assets").update({ share_token: null }).eq("id", asset.id);
      toast({ title: "Share link disabled" });
    } else {
      const token = crypto.randomUUID();
      await supabase.from("assets").update({ share_token: token }).eq("id", asset.id);
      track("asset_shared", { asset_id: asset.id, asset_type: asset.asset_type });
    }
    await load();
    setSharing(false);
  };

  const createShareLink = async (): Promise<string | null> => {
    if (asset.share_token) return `${window.location.origin}/share/asset/${asset.share_token}`;
    const token = crypto.randomUUID();
    const { error } = await supabase.from("assets").update({ share_token: token }).eq("id", asset.id);
    if (error) return null;
    await load();
    track("asset_shared", { asset_id: asset.id, asset_type: asset.asset_type });
    return `${window.location.origin}/share/asset/${token}`;
  };

  const copyShare = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast({ title: "Share link copied" });
  };

  const restore = async (versionId: string) => {
    if (!confirm("Restore this version? Current state will be saved as a new version first.")) return;
    const { data: cur } = await supabase.from("assets").select("editor_state, content, image_url, title, user_id").eq("id", asset.id).maybeSingle();
    if (cur) {
      await supabase.from("asset_versions").insert({
        asset_id: asset.id, user_id: cur.user_id, label: "Auto-saved before restore",
        snapshot: { editor_state: cur.editor_state, content: cur.content, image_url: cur.image_url, title: cur.title },
      });
    }
    const { data: v } = await supabase.from("asset_versions").select("snapshot").eq("id", versionId).maybeSingle();
    if (v?.snapshot) {
      await supabase.from("assets").update({
        editor_state: v.snapshot.editor_state ?? null,
        content: v.snapshot.content ?? null,
        image_url: v.snapshot.image_url ?? null,
        title: v.snapshot.title ?? asset.title,
      }).eq("id", asset.id);
      toast({ title: "Version restored" });
      load();
    }
  };

  const generateVariation = async (preset?: string) => {
    const instruction = (preset || tweak).trim();
    if (!instruction) return;
    setVarying(true);
    try {
      const variationPrompt = `${asset.prompt || asset.title} — variation: ${instruction}`;
      const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
      const workspace_id = asset.workspace_id || await ensureActiveWorkspaceId();
      const { data, error } = await supabase.functions.invoke("generate-asset", {
        body: {
          prompt: variationPrompt,
          asset_type: asset.asset_type,
          project_id: asset.project_id || undefined,
          workspace_id: workspace_id || undefined,
          brand_context: asset.meta?.brand_context || undefined,
          count: 1,
        },
      });
      const d: any = data;
      const aiErr = handleAiError(d, error, toast);
      if (aiErr?.kind === "no_credits") { setOutOfCredits({ needed: aiErr.needed, remaining: aiErr.remaining }); return; }
      if (aiErr) return;
      window.dispatchEvent(new Event("credits:refresh"));
      const newId = d?.asset_ids?.[0];
      if (newId) { toast({ title: "Variation created" }); setVaryOpen(false); setTweak(""); nav(`/designs/${newId}`); }
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setVarying(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <Link to="/designs" className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> Assets
          </Link>
          {(prevId || nextId) && (
            <div className="ml-3 flex items-center gap-1">
              <button
                onClick={() => prevId && nav(`/designs/${prevId}`)}
                disabled={!prevId}
                title="Previous asset (←)"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => nextId && nav(`/designs/${nextId}`)}
                disabled={!nextId}
                title="Next asset (→)"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {sibIndex >= 0 && (
                <span className="ml-1 text-[11px] text-neutral-400">{sibIndex + 1} / {siblings.length}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
            <ControlHistory className="h-4 w-4" /> Versions {versions.length > 0 && <span className="rounded-full bg-neutral-100 px-1.5 text-[10px]">{versions.length}</span>}
          </button>
          <div className="relative">
            <button onClick={() => setVaryOpen(v => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
              <ControlWand2 className="h-4 w-4" /> Variation
            </button>
            {varyOpen && (
              <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
                <div className="mb-2 text-xs font-medium text-neutral-700">Generate a variation</div>
                <div className="flex flex-wrap gap-1.5">
                  {VARIATION_PRESETS.map(p => (
                    <button key={p} disabled={varying} onClick={() => generateVariation(p)} className="rounded-full border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50">{p}</button>
                  ))}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <input value={tweak} onChange={e => setTweak(e.target.value)} placeholder="Custom tweak…" disabled={varying} className="flex-1 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-hidden focus:border-brand" />
                  <button onClick={() => generateVariation()} disabled={varying || !tweak.trim()} className="rounded-md bg-brand px-2 py-1 text-xs text-brand-foreground disabled:opacity-50">
                    {varying ? <ControlLoader2 className="h-3 w-3 animate-spin" /> : "Go"}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-neutral-500">Creates a new asset, original is preserved.</p>
              </div>
            )}
          </div>
          <button onClick={() => setShareOpen(true)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm ${asset.share_token ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-neutral-200 bg-white hover:bg-neutral-50"}`}>
            <ControlShare2 className="h-4 w-4" /> Share & export
          </button>
          <AddToProjectMenu assetId={asset.id} currentProjectId={asset.project_id} onChanged={(pid) => setAsset((a: any) => ({ ...a, project_id: pid }))} />
          {asset.share_token && (
            <button onClick={toggleShare} disabled={sharing} title="Disable public link" className="inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white p-2 text-xs text-neutral-500 hover:bg-neutral-50">
              <ControlCheck className="h-3.5 w-3.5 text-emerald-600" />
            </button>
          )}
          <Link
            to={editorHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
          >
            <ControlEdit3 className="h-4 w-4" /> Open in Editor
          </Link>
          {asset.asset_type === "presentation" && (
            <Link
              to={`/present?id=${asset.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
              title="Present fullscreen"
            >
              <ControlPlay className="h-4 w-4" /> Present
            </Link>
          )}
          {isImage && (
            <a href={asset.image_url} download className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
              <Download className="h-4 w-4" />
            </a>
          )}
          {isImage && (
            <button
              onClick={async () => {
                try {
                  const svg = await imageUrlToSvg(asset.image_url);
                  downloadSvg(svg, (asset.title || "asset").replace(/[^\w-]+/g, "_"));
                  toast({ title: "SVG downloaded" });
                } catch (e: any) {
                  toast({ title: "Vectorize failed", description: e?.message || "Could not convert image to SVG.", variant: "destructive" });
                }
              }}
              title="Download as SVG (vectorized)"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
            >
              <ControlFileCode className="h-4 w-4" /> SVG
            </button>
          )}
          {!isImage && !isLogo && (
            <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
              <ControlCopy className="h-4 w-4" />
            </button>
          )}
          <button onClick={del} className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            <ControlTrash2 className="h-4 w-4" />
          </button>
          <button onClick={duplicate} disabled={duplicating} title="Duplicate as new asset" className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">
            {duplicating ? <ControlLoader2 className="h-4 w-4 animate-spin" /> : <ControlFiles className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {shareUrl && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          <span className="flex-1 truncate font-mono text-emerald-900">{shareUrl}</span>
          <button onClick={copyShare} className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs hover:bg-emerald-100">Copy</button>
        </div>
      )}

      <div className="mb-4">
        <div className="text-xs normal-case tracking-wider text-neutral-500">{ASSET_TYPE_LABELS[asset.asset_type]}</div>
        {editing ? (
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-2xl font-semibold outline-hidden focus:border-brand"
          />
        ) : (
          <h1 className="mt-1 text-2xl font-semibold">{asset.title}</h1>
        )}
        {asset.prompt && <p className="mt-1 text-sm text-neutral-500">Prompt: {asset.prompt}</p>}
      </div>

      {brandCtx && (
        <div className="mb-4">
          <BrandContextStrip
            ctx={brandCtx}
            refreshing={refreshingCtx}
            onRefresh={async () => {
              const url = brandCtx.url || brandCtx.source_url || asset.source_url;
              if (!url) return;
              setRefreshingCtx(true);
              try {
                const { data, error } = await supabase.functions.invoke("scrape-url", { body: { url } });
                if (error) throw error;
                const nextCtx = { ...(brandCtx || {}), ...(data || {}), url };
                const nextMeta = { ...(asset.meta || {}), brand_context: nextCtx };
                const { error: uErr } = await supabase.from("assets").update({ meta: nextMeta }).eq("id", asset.id);
                if (uErr) throw uErr;
                setAsset((a: any) => ({ ...a, meta: nextMeta }));
                toast({ title: "Brand context refreshed" });
              } catch (e: any) {
                toast({ title: "Refresh failed", description: e?.message || String(e), variant: "destructive" });
              } finally {
                setRefreshingCtx(false);
              }
            }}
          />
        </div>
      )}

      {hasMarkdownExport(asset) && (
        <div className="mb-4">
          <TextAssetExportBar asset={asset} />
        </div>
      )}

      {isImage && (asset.asset_type === "logo"
        ? <RelatedVariantsGrid asset={asset} />
        : <ImageSetGallery asset={asset} />
      )}

      <div className="mb-4">
        <RegenerateFeedbackBar
          asset={asset}
          onDone={load}
          onNoCredits={(info) => setOutOfCredits(info)}
        />
      </div>

      {needsRebuild && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <div className="font-medium text-amber-900">This asset didn't parse into its visual view.</div>
            <div className="mt-0.5 text-xs text-amber-800/80">
              Rebuild it as a structured deliverable so you get the designed layout, editable sections, and clean export.
            </div>
          </div>
          <button
            onClick={rebuildAsStructured}
            disabled={rebuilding}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {rebuilding ? <ControlLoader2 className="h-3.5 w-3.5 animate-spin" /> : <ControlWand2 className="h-3.5 w-3.5" />} Rebuild as structured
          </button>
        </div>
      )}

      <div className="grid gap-6">
        {isLogo ? (
          <div className="space-y-3">
            {logotypeState && <LogotypeExportBar state={logotypeState} name={asset.title} />}
            <LogotypeEditor
              initial={logotypeState}
              defaultText={logotypeState?.text || asset.title || "Brand"}
              saving={savingEdit}
              onSave={saveLogotype}
            />
          </div>
        ) : (!isImage && !editing && hasVisual) ? null : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {isImage ? (
            <div className="flex items-center justify-center bg-neutral-50 p-8">
              <img src={asset.image_url} alt={asset.title} className="max-h-[640px] w-auto" />
            </div>
          ) : editing ? (
            <div className="p-4">
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                className="min-h-[480px] w-full resize-y rounded-lg border border-neutral-200 bg-white p-4 font-sans text-sm leading-relaxed text-neutral-800 outline-hidden focus:border-brand"
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button onClick={cancelEdit} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">
                  <ControlX className="h-4 w-4" /> Cancel
                </button>
                <button onClick={saveEdit} disabled={savingEdit} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-50">
                  {savingEdit ? <ControlLoader2 className="h-4 w-4 animate-spin" /> : <ControlSave className="h-4 w-4" />} Save
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={startEdit}
                className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white/90 px-2.5 py-1 text-xs text-neutral-600 backdrop-blur-sm hover:bg-neutral-50"
                title="Edit source"
              >
                <ControlPencil className="h-3.5 w-3.5" /> Edit
              </button>
              <div className="p-6"><AssetVisual asset={asset} /></div>
            </div>
          )}
        </div>
        )}
        {!isLogo && !isImage && !editing && hasVisual && (
          <div className="space-y-3">
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowRaw((v) => !v)}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
              >
                {showRaw ? "Visual view" : "Raw"}
              </button>
              <button
                onClick={startEdit}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
              >
                <ControlPencil className="h-3 w-3" /> Edit source
              </button>
            </div>
            {showRaw ? (
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <pre className="whitespace-pre-wrap p-8 font-mono text-xs leading-relaxed text-neutral-700">{asset.content || ""}</pre>
              </div>
            ) : (
              <AssetVisual asset={asset} />
            )}
          </div>
        )}
      </div>

      <OutOfCreditsModal open={!!outOfCredits} onClose={() => setOutOfCredits(null)} needed={outOfCredits?.needed} remaining={outOfCredits?.remaining} />
      <ShareExportModal open={shareOpen} onOpenChange={setShareOpen} asset={asset} onCreateShareLink={createShareLink} />
      <VersionHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} asset={asset} onRestored={load} />
      <div className="mt-8">
        <CommentsPanel assetId={asset.id} />
      </div>
    </div>
  );
};

export default AssetDetail;
