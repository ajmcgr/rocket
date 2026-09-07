import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { assetHref, isBrandAsset } from "@/lib/assetExperience";
import BrandCover from "@/components/brand/BrandCover";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  Trash2,
  MoreHorizontal,
  Edit3,
  FolderPlus,
  Download,
  CheckSquare,
  Square,
  X,
  LayoutGrid,
  List,
  ArrowUpDown,
  Share2,
  Lock,
  Compass,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { AssetGridSkeleton } from "@/components/Skeletons";
import { Logotype } from "@/components/Logotype";
import CanvasAssetPreview from "@/components/CanvasAssetPreview";
import { type CanvasElement } from "@/lib/canvasAsset";
import { defaultLogotypeState, pickLogotypeText } from "@/lib/logotype";
import { packAssetsZip } from "@/lib/exporters/zipPack";
import { getDesignFolderId, withDesignFolderId } from "@/lib/designFolders";
import { CollectionView, DesignSort, sortByOption } from "@/lib/designCollections";
import { matchesDesignQuery, rankDesignsByRelevance } from "@/lib/searchRelevance";

const supabase = _sb as any;

const ASSET_TYPE_LABELS: Record<string, string> = {
  logo: "Logo",
  graphic: "Graphic",
  icon: "Icon",
  photo: "Photo",
  template: "Template",
  presentation: "Presentation",
};

const ALL_TYPES = Object.keys(ASSET_TYPE_LABELS);

const GENERIC_LOGOTYPE_TITLE = /^logotype(?:\s+\d+)?$/i;

type DesignPreviewAsset = {
  title?: string | null;
  content?: string | null;
  prompt?: string | null;
  asset_type?: string | null;
  editor_state?: unknown;
  image_url?: string | null;
  thumbnail_url?: string | null;
  source_url?: string | null;
  meta?: {
    kind?: string | null;
    asset_kind?: string | null;
    brand_context?: { productName?: string | null; name?: string | null; url?: string | null; colors?: string[] | null } | null;
    brandContext?: { productName?: string | null; name?: string | null; url?: string | null; colors?: string[] | null } | null;
  } | null;
};

const hasRenderableCanvasElements = (value: unknown): value is CanvasElement[] => {
  if (!Array.isArray(value)) return false;
  return value.some((item) => {
    if (!item || typeof item !== "object") return false;
    const el = item as { kind?: string; visible?: boolean; text?: unknown; src?: unknown; w?: unknown; h?: unknown };
    if (el.visible === false || typeof el.kind !== "string") return false;
    if ((el.kind === "text" || el.kind === "sticky") && String(el.text || "").trim()) return true;
    if (el.kind === "image" && String(el.src || "").trim()) return true;
    if (el.kind === "line") return Boolean(Number(el.w) || Number(el.h));
    return ["rect", "circle", "triangle", "star", "table"].includes(el.kind);
  });
};

const firstCanvasText = (value: unknown) => {
  if (!Array.isArray(value)) return "";
  const textElement = value.find((item) => {
    if (!item || typeof item !== "object") return false;
    const el = item as { kind?: string; visible?: boolean; text?: unknown };
    return el.visible !== false && (el.kind === "text" || el.kind === "sticky") && String(el.text || "").trim();
  }) as { text?: unknown } | undefined;
  return String(textElement?.text || "").trim();
};

const firstCanvasImage = (value: unknown) => {
  if (!Array.isArray(value)) return "";
  const image = value.find((item) => {
    if (!item || typeof item !== "object") return false;
    const el = item as { kind?: string; visible?: boolean; src?: unknown };
    return el.visible !== false && el.kind === "image" && String(el.src || "").trim();
  }) as { src?: unknown } | undefined;
  return String(image?.src || "").trim();
};

const safePreviewText = (asset: DesignPreviewAsset) => {
  const title = String(asset?.title || "").trim();
  const content = String(asset?.content || "").trim();
  const prompt = String(asset?.prompt || "").trim();
  return content || prompt || title;
};

const isLogotypeState = (value: unknown): value is { kind: "logotype" } =>
  Boolean(value && typeof value === "object" && (value as { kind?: unknown }).kind === "logotype");

const isLogotypeLikeDesign = (asset: DesignPreviewAsset) => {
  const title = String(asset?.title || "");
  const prompt = String(asset?.prompt || "");
  const content = String(asset?.content || "");
  const metaKind = String(asset?.meta?.kind || asset?.meta?.asset_kind || "");
  return (
    asset?.asset_type === "logo" &&
    (isLogotypeState(asset?.editor_state) ||
      GENERIC_LOGOTYPE_TITLE.test(title.trim()) ||
      /\b(logotype|wordmark|word mark)\b/i.test(`${prompt} ${content} ${metaKind}`))
  );
};

const logotypePreviewState = (asset: DesignPreviewAsset) => {
  const brandContext = asset?.meta?.brand_context || asset?.meta?.brandContext || {};
  const canvasText = firstCanvasText(asset?.editor_state);
  const fallback = GENERIC_LOGOTYPE_TITLE.test(String(asset?.title || "").trim())
    ? canvasText || asset?.prompt || asset?.content
    : canvasText || asset?.title || asset?.prompt || asset?.content;
  const text = pickLogotypeText({
    prompt: asset?.prompt || canvasText,
    productName: brandContext?.productName || brandContext?.name,
    url: brandContext?.url || asset?.source_url,
    fallback,
  }) || canvasText || String(asset?.title || "Design").trim();
  return defaultLogotypeState(text, Array.isArray(brandContext?.colors) ? brandContext.colors[0] || "#0A0A0A" : "#0A0A0A");
};

const Assets = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const highlight = (params.get("highlight") || "").split(",").filter(Boolean);
  const folderParam = params.get("folder") || "";

  const [assets, setAssets] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<CollectionView>("card");
  const [sort, setSort] = useState<DesignSort>("date");
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
    const ws = await ensureActiveWorkspaceId();
    // Rows created before workspaces were introduced have no workspace_id.
    // They remain account-owned (and RLS-enforced), so include them alongside
    // the active workspace rather than making a user's existing library vanish.
    const scope = (q: any) => ws ? q.or(`workspace_id.eq.${ws},workspace_id.is.null`) : q;
    const [a, p, f] = await Promise.all([
      scope(supabase.from("assets").select("*").eq("user_id", user.id)).is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
      scope(supabase.from("projects").select("id,name").eq("user_id", user.id)).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
      scope(supabase.from("folders").select("id,name").eq("user_id", user.id)).order("created_at", { ascending: false }).limit(100),
    ]);
    const { data, error } = a;
    const firstError = error || p.error || f.error;
    if (firstError) {
      console.error("Failed to load design library", firstError);
      toast({ title: "Failed to load designs", description: firstError.message, variant: "destructive" });
    }
    setAssets(data || []);
    setProjects(p.data || []);
    setFolders(f.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const visible = assets.filter((asset) => {
      if (isBrandAsset(asset)) return false;
      if (filter !== "all" && asset.asset_type !== filter) return false;
      if (folderParam && getDesignFolderId(asset) !== folderParam) return false;
      if (!matchesDesignQuery(asset, q)) return false;
      return true;
    });
    return q.trim()
      ? rankDesignsByRelevance(visible, q)
      : sortByOption(visible, sort, (asset) => asset.title, (asset) => asset.created_at);
  }, [assets, filter, q, folderParam, sort]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelected(new Set(filtered.map((asset) => asset.id)));
  const clearSelection = () => setSelected(new Set());

  const downloadZip = async () => {
    const items = assets.filter((asset) => selected.has(asset.id));
    if (!items.length) return;
    setZipping(true);
    try {
      await packAssetsZip(items, `rocket-pack-${items.length}-assets.zip`);
      toast({ title: `Packed ${items.length} designs` });
    } catch (e: any) {
      toast({ title: "Pack failed", description: e?.message, variant: "destructive" });
    } finally {
      setZipping(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Move this design to Trash?")) return;
    setAssets((prev) => prev.filter((asset) => asset.id !== id));
    await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Move ${ids.length} designs to Trash? Restore anytime from /trash.`)) return;
    setAssets((prev) => prev.filter((asset) => !selected.has(asset.id)));
    clearSelection();
    const { error } = await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).in("id", ids);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      load();
      return;
    }
    toast({ title: `Moved ${ids.length} designs to Trash` });
  };

  const bulkAssignToProject = async (projectId: string | null) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { error } = await supabase.from("assets").update({ project_id: projectId }).in("id", ids);
    if (error) {
      toast({ title: "Move failed", description: error.message, variant: "destructive" });
      return;
    }
    setAssets((prev) => prev.map((asset) => selected.has(asset.id) ? { ...asset, project_id: projectId } : asset));
    toast({ title: projectId ? `Moved ${ids.length} designs to project` : `Removed ${ids.length} designs from project` });
    clearSelection();
  };

  const bulkAssignToFolder = async (folderId: string | null) => {
    const rows = assets.filter((asset) => selected.has(asset.id));
    if (!rows.length) return;
    const results = await Promise.all(
      rows.map((asset) => supabase.from("assets").update({ meta: withDesignFolderId(asset.meta, folderId) }).eq("id", asset.id)),
    );
    const firstError = results.find((r: any) => r.error)?.error;
    if (firstError) {
      toast({ title: "Move failed", description: firstError.message, variant: "destructive" });
      return;
    }
    setAssets((prev) => prev.map((asset) => selected.has(asset.id) ? { ...asset, meta: withDesignFolderId(asset.meta, folderId) } : asset));
    toast({ title: folderId ? `Moved ${rows.length} designs to folder` : `Removed ${rows.length} designs from folder` });
    clearSelection();
  };

  const assignToProject = async (assetId: string, projectId: string | null) => {
    const { error } = await supabase.from("assets").update({ project_id: projectId }).eq("id", assetId);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setAssets((prev) => prev.map((asset) => asset.id === assetId ? { ...asset, project_id: projectId } : asset));
    toast({ title: projectId ? "Added design to project" : "Removed design from project" });
  };

  const assignToFolder = async (asset: any, folderId: string | null) => {
    const nextMeta = withDesignFolderId(asset.meta, folderId);
    const { error } = await supabase.from("assets").update({ meta: nextMeta }).eq("id", asset.id);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setAssets((prev) => prev.map((row) => row.id === asset.id ? { ...row, meta: nextMeta } : row));
    toast({ title: folderId ? "Moved design to folder" : "Removed design from folder" });
  };

  const makePublic = async (asset: any) => {
    const publicUrl = asset.share_token ? `${window.location.origin}/share/asset/${asset.share_token}` : "";
    if (!asset.share_token) {
      const token = crypto.randomUUID();
      const { error } = await supabase.from("assets").update({ share_token: token }).eq("id", asset.id);
      if (error) {
        toast({ title: "Make public failed", description: error.message, variant: "destructive" });
        return;
      }
      setAssets((prev) => prev.map((row) => row.id === asset.id ? { ...row, share_token: token } : row));
      toast({ title: "Added to Templates", description: "This design is now public." });
      return;
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
      toast({ title: "Public link copied" });
    } catch {
      toast({ title: "Public link ready", description: publicUrl });
    }
  };

  const makePrivate = async (asset: any) => {
    const { error } = await supabase.from("assets").update({ share_token: null }).eq("id", asset.id);
    if (error) {
      toast({ title: "Make private failed", description: error.message, variant: "destructive" });
      return;
    }
    setAssets((prev) => prev.map((row) => row.id === asset.id ? { ...row, share_token: null } : row));
    toast({ title: "Removed from Templates", description: "This design is now private." });
  };

  const updateDesignMeta = async (asset: any, patch: Record<string, unknown>) => {
    const meta = { ...(asset.meta || {}), ...patch };
    const { error } = await supabase.from("assets").update({ meta }).eq("id", asset.id);
    if (error) {
      toast({ title: "Could not update design", description: error.message, variant: "destructive" });
      return false;
    }
    setAssets((prev) => prev.map((row) => row.id === asset.id ? { ...row, meta } : row));
    return true;
  };

  const useAsBrandDirection = async (asset: any) => {
    const previousStyles = assets.filter((row) =>
      row.id !== asset.id &&
      row.meta?.selected_as_direction &&
      (row.project_id || null) === (asset.project_id || null),
    );
    const resetResults = await Promise.all(previousStyles.map(async (row) => {
      const meta = { ...(row.meta || {}), selected_as_direction: false };
      return supabase.from("assets").update({ meta }).eq("id", row.id);
    }));
    const resetError = resetResults.find((result) => result.error)?.error;
    if (resetError) {
      toast({ title: "Could not update style", description: resetError.message, variant: "destructive" });
      return;
    }
    const updated = await updateDesignMeta(asset, {
      direction_feedback: "kept",
      selected_as_direction: true,
      selected_as_direction_at: new Date().toISOString(),
    });
    if (!updated) return;
    if (previousStyles.length) {
      setAssets((prev) => prev.map((row) =>
        previousStyles.some((style) => style.id === row.id)
          ? { ...row, meta: { ...(row.meta || {}), selected_as_direction: false } }
          : row,
      ));
    }
    const next = new URLSearchParams({ direction: asset.id });
    if (asset.project_id) next.set("project", asset.project_id);
    toast({ title: "Style selected", description: "Choose what to create next from your Brand page." });
    nav(`/brands?${next.toString()}`);
  };

  const createProjectAndAssign = async (assetId: string) => {
    const name = window.prompt("New project name");
    if (!name?.trim() || !user) return;
    const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
    const workspace_id = await ensureActiveWorkspaceId();
    const { data, error } = await supabase.from("projects").insert({ user_id: user.id, workspace_id, name: name.trim() } as any).select().single();
    if (error || !data) {
      toast({ title: "Failed", description: error?.message, variant: "destructive" });
      return;
    }
    setProjects((prev) => [data, ...prev]);
    await assignToProject(assetId, data.id);
  };

  const createFolderAndAssign = async (asset: any) => {
    const name = window.prompt("New folder name");
    if (!name?.trim() || !user) return;
    const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
    const workspace_id = await ensureActiveWorkspaceId();
    const { data, error } = await supabase.from("folders").insert({ user_id: user.id, workspace_id, name: name.trim() } as any).select().single();
    if (error || !data) {
      toast({ title: "Failed", description: error?.message, variant: "destructive" });
      return;
    }
    setFolders((prev) => [data, ...prev]);
    await assignToFolder(asset, data.id);
  };

  const activeFolderName = folders.find((folder) => folder.id === folderParam)?.name;

  const DesignPreview = ({ asset }: { asset: DesignPreviewAsset }) => {
    const [rasterFailed, setRasterFailed] = useState(false);
    const isLogotype = isLogotypeState(asset?.editor_state);
    const isEditedCanvas = Array.isArray(asset?.editor_state) && hasRenderableCanvasElements(asset.editor_state);
    const canvasImage = firstCanvasImage(asset.editor_state);
    const rasterPreview = asset.image_url || canvasImage || asset.thumbnail_url;
    const fallbackLogotype = !isLogotype && isLogotypeLikeDesign(asset);
    const isCanvas = !isLogotype && isEditedCanvas && !canvasImage;
    const isImage = !!rasterPreview && !rasterFailed && !isLogotype && (!fallbackLogotype || isEditedCanvas) && !isCanvas;
    const fallbackText = safePreviewText(asset);
    const brand = !isLogotype && !isCanvas && !fallbackLogotype && !isImage && isBrandAsset(asset);

    useEffect(() => {
      setRasterFailed(false);
    }, [rasterPreview]);

    return (
      <>
        {isLogotype ? <Logotype state={asset.editor_state as any} fit="contain" /> : fallbackLogotype ? <Logotype state={logotypePreviewState(asset)} fit="contain" /> : isImage ? <img src={rasterPreview} alt={asset.title} className="h-full w-full object-contain" loading="lazy" onError={() => setRasterFailed(true)} /> : isCanvas ? <CanvasAssetPreview elements={asset.editor_state as any} className="h-full w-full" /> : brand ? <BrandCover asset={asset} /> : (
          <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-neutral-500">
            <div className="line-clamp-6 whitespace-pre-wrap">{fallbackText ? fallbackText.slice(0, 200) : "No preview available"}</div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Designs</h1>
          <p className="mt-1 text-sm text-neutral-500">{assets.length} total · every generated design is saved here.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/trash"
            title="Trash"
            aria-label="Trash"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
          >
            <Trash2 className="h-4 w-4" />
          </Link>
          <Link to="/logos" className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:bg-brand-hover">
            <Plus className="h-4 w-4" /> New Design
          </Link>
        </div>
      </div>

      {folderParam && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600">
          <span>Folder:</span>
          <span className="font-medium text-neutral-900">{activeFolderName || "Unknown folder"}</span>
          <Link to="/designs" className="text-neutral-500 hover:text-neutral-900">Clear</Link>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search designs…  ( / )"
            className="h-9 w-full min-w-0 rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-neutral-400 sm:w-64"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setFilter("all")} className={`rounded-full border px-3 py-1 text-xs transition ${filter === "all" ? "border-brand bg-brand text-brand-foreground" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}>All</button>
          {ALL_TYPES.map((type) => (
            <button key={type} onClick={() => setFilter(type)} className={`rounded-full border px-3 py-1 text-xs transition ${filter === type ? "border-brand bg-brand text-brand-foreground" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}>
              {ASSET_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
          <button
            onClick={() => { setSelectMode((value) => !value); clearSelection(); }}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${selectMode ? "border-brand bg-brand/10 text-brand" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}
          >
            {selectMode ? <X className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />} {selectMode ? "Cancel" : "Select"}
          </button>
        </div>
      </div>

      {selectMode && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-xs">
          <span className="font-medium text-neutral-700">{selected.size} selected</span>
          <button onClick={selectAllVisible} className="rounded-full border border-neutral-200 bg-white px-2 py-1 hover:bg-neutral-50">Select all visible</button>
          <button onClick={clearSelection} className="rounded-full border border-neutral-200 bg-white px-2 py-1 hover:bg-neutral-50">Clear</button>
          <div className="ml-auto" />
          <button
            onClick={downloadZip}
            disabled={!selected.size || zipping}
            className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> {zipping ? "Packing…" : "Download .zip"}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button disabled={!selected.size} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                <FolderPlus className="h-3.5 w-3.5" /> Move
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-white">
              <DropdownMenuLabel className="text-[10px] uppercase text-neutral-500">Move {selected.size} designs to…</DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">Project</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-56 bg-white">
                    <DropdownMenuLabel className="text-[10px] uppercase text-neutral-500">Projects</DropdownMenuLabel>
                    {projects.length === 0 ? <div className="px-2 py-2 text-xs text-neutral-500">No projects yet.</div> : projects.map((project) => (
                      <DropdownMenuItem key={project.id} onClick={() => bulkAssignToProject(project.id)} className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">
                        {project.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => bulkAssignToProject(null)} className="cursor-pointer text-neutral-600 focus:bg-neutral-100 focus:text-neutral-900">Remove from project</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">Folder</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-56 bg-white">
                    <DropdownMenuLabel className="text-[10px] uppercase text-neutral-500">Folders</DropdownMenuLabel>
                    {folders.length === 0 ? <div className="px-2 py-2 text-xs text-neutral-500">No folders yet.</div> : folders.map((folder) => (
                      <DropdownMenuItem key={folder.id} onClick={() => bulkAssignToFolder(folder.id)} className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">
                        {folder.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => bulkAssignToFolder(null)} className="cursor-pointer text-neutral-600 focus:bg-neutral-100 focus:text-neutral-900">Remove from folder</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={bulkDelete}
            disabled={!selected.size}
            className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}

      {loading ? (
        <AssetGridSkeleton />
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-neutral-300 bg-gradient-to-b from-white to-neutral-50 p-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <Plus className="h-6 w-6" />
          </div>
          {assets.length === 0 ? (
            <>
              <h2 className="text-lg font-semibold text-neutral-900">No designs yet.</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">
                Your designs will appear here. Start with a logo, brand kit, social graphic, presentation, or launch asset.
              </p>
              <Link to="/logos" className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover">
                <Plus className="h-3.5 w-3.5" /> Create your first design
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-neutral-900">No matches</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">Try a different type, folder, or clear the search to see everything.</p>
            </>
          )}
        </div>
      ) : view === "card" ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((asset) => {
            const isHighlighted = highlight.includes(asset.id);
            const isSelected = selected.has(asset.id);
            const currentFolderId = getDesignFolderId(asset);
            const isCurrentStyle = asset.meta?.selected_as_direction === true;

            return (
              <div key={asset.id} className={`group relative overflow-hidden rounded-2xl border bg-white transition hover:shadow-md ${isSelected ? "border-brand ring-2 ring-brand/40" : isHighlighted ? "border-brand ring-2 ring-brand/30" : "border-neutral-200"}`}>
                {selectMode && (
                  <button
                    onClick={(e) => { e.preventDefault(); toggleSelect(asset.id); }}
                    className="absolute left-2 top-2 z-10 rounded-md bg-white/95 p-1 shadow-sm"
                    aria-label="Select"
                  >
                    {isSelected ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4 text-neutral-500" />}
                  </button>
                )}

                {selectMode ? (
                  <button onClick={() => toggleSelect(asset.id)} className="block w-full text-left">
                    <div className="aspect-square w-full overflow-hidden bg-neutral-50">
                      <DesignPreview asset={asset} />
                    </div>
                    <div className="border-t border-neutral-100 p-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{asset.title}</div>
                        {isCurrentStyle && <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">Your style</span>}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] text-neutral-500">{ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}</span>
                        <span className="shrink-0 text-[10px] text-neutral-400">{new Date(asset.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </button>
                ) : (
                  <Link to={assetHref(asset)} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="aspect-square w-full overflow-hidden bg-neutral-50">
                      <DesignPreview asset={asset} />
                    </div>
                    <div className="border-t border-neutral-100 p-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{asset.title}</div>
                        {isCurrentStyle && <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">Your style</span>}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] text-neutral-500">{ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}</span>
                        <span className="shrink-0 text-[10px] text-neutral-400">{new Date(asset.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </Link>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="absolute right-2 top-2 rounded-md bg-white/90 p-1 opacity-0 transition group-hover:opacity-100" aria-label="Actions">
                      <MoreHorizontal className="h-4 w-4 text-neutral-700" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white">
                    <DropdownMenuItem asChild className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">
                      <Link to={assetHref(asset)} target="_blank" rel="noopener noreferrer"><Edit3 className="mr-2 h-4 w-4" /> Open design</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => makePublic(asset)}
                      className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900"
                    >
                      <Share2 className="mr-2 h-4 w-4" /> {asset.share_token ? "Public link" : "Make Public"}
                    </DropdownMenuItem>
                    {asset.share_token && (
                      <DropdownMenuItem
                        onClick={() => makePrivate(asset)}
                        className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900"
                      >
                        <Lock className="mr-2 h-4 w-4" /> Make Private
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => useAsBrandDirection(asset)}
                      className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900"
                    >
                      <Compass className="mr-2 h-4 w-4" /> Make this my style
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900 data-[state=open]:bg-neutral-100 data-[state=open]:text-neutral-900">
                        <FolderPlus className="mr-2 h-4 w-4" /> {asset.project_id ? "Move design to project" : "Add design to project"}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-56 bg-white">
                          <DropdownMenuLabel className="text-[10px] uppercase text-neutral-500">Projects</DropdownMenuLabel>
                          {projects.length === 0 ? <div className="px-2 py-2 text-xs text-neutral-500">No projects yet.</div> : projects.map((project) => (
                            <DropdownMenuItem key={project.id} onClick={() => assignToProject(asset.id, project.id)} className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">
                              {project.name}{asset.project_id === project.id ? " ✓" : ""}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => createProjectAndAssign(asset.id)} className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">+ New project…</DropdownMenuItem>
                          {asset.project_id && <DropdownMenuItem onClick={() => assignToProject(asset.id, null)} className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700">Remove design from project</DropdownMenuItem>}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900 data-[state=open]:bg-neutral-100 data-[state=open]:text-neutral-900">
                        <FolderPlus className="mr-2 h-4 w-4" /> {currentFolderId ? "Move design to folder" : "Add design to folder"}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-56 bg-white">
                          <DropdownMenuLabel className="text-[10px] uppercase text-neutral-500">Folders</DropdownMenuLabel>
                          {folders.length === 0 ? <div className="px-2 py-2 text-xs text-neutral-500">No folders yet.</div> : folders.map((folder) => (
                            <DropdownMenuItem key={folder.id} onClick={() => assignToFolder(asset, folder.id)} className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">
                              {folder.name}{currentFolderId === folder.id ? " ✓" : ""}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => createFolderAndAssign(asset)} className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">+ New folder…</DropdownMenuItem>
                          {currentFolderId && <DropdownMenuItem onClick={() => assignToFolder(asset, null)} className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700">Remove design from folder</DropdownMenuItem>}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700" onClick={() => del(asset.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {filtered.map((asset) => {
            const isSelected = selected.has(asset.id);
            const isCurrentStyle = asset.meta?.selected_as_direction === true;
            return (
              <div key={asset.id} className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0">
                {selectMode && (
                  <button onClick={() => toggleSelect(asset.id)}>
                    {isSelected ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4 text-neutral-500" />}
                  </button>
                )}
                <Link to={assetHref(asset)} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-lg bg-neutral-50">
                    <DesignPreview asset={asset} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-neutral-900">{asset.title}</div>
                      {isCurrentStyle && <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">Your style</span>}
                    </div>
                    <div className="text-xs text-neutral-500">{ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}</div>
                  </div>
                  <div className="shrink-0 text-xs text-neutral-400">{new Date(asset.created_at).toLocaleDateString()}</div>
                </Link>
                <button
                  onClick={() => useAsBrandDirection(asset)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
                  title="Make this my style"
                  aria-label="Make this my style"
                >
                  <Compass className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Assets;
