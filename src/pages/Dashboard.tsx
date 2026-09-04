import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Folder,
  MoreHorizontal,
  Trash2,
  Pencil,
  ImageIcon,
  X,
  Share2,
  Link2,
  Copy,
  Check,
  LayoutGrid,
  List,
  ArrowUpDown,
  CheckSquare,
  Square,
  FolderPlus,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProjectGridSkeleton } from "@/components/Skeletons";
import { Logotype } from "@/components/Logotype";
import { getDesignFolderId, withDesignFolderId } from "@/lib/designFolders";
import { CollectionView, DesignSort, isUploadedImageDesign, sortByOption } from "@/lib/designCollections";

const supabase = _sb as any;

const Projects = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [projects, setProjects] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [allAssets, setAllAssets] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [latestImages, setLatestImages] = useState<Record<string, string>>({});
  const [latestLogotypes, setLatestLogotypes] = useState<Record<string, any>>({});
  const [latestFolderImages, setLatestFolderImages] = useState<Record<string, string>>({});
  const [latestFolderLogotypes, setLatestFolderLogotypes] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [renaming, setRenaming] = useState<any | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<any | null>(null);
  const [renameFolderVal, setRenameFolderVal] = useState("");

  const [coverPicker, setCoverPicker] = useState<any | null>(null);
  const [coverChoices, setCoverChoices] = useState<any[]>([]);
  const [sharing, setSharing] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const [view, setView] = useState<CollectionView>("card");
  const [sort, setSort] = useState<DesignSort>("date");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selKey = (kind: "project" | "folder" | "upload", id: string) => `${kind}:${id}`;

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
      const ws = await ensureActiveWorkspaceId();
      // Include account-owned records created before workspace_id existed.
      const scope = (q: any) => ws ? q.or(`workspace_id.eq.${ws},workspace_id.is.null`) : q;
      const [projectsResult, foldersResult, assetsResult] = await Promise.all([
        scope(supabase.from("projects").select("*").eq("user_id", user.id)).order("created_at", { ascending: false }),
        scope(supabase.from("folders").select("*").eq("user_id", user.id)).order("created_at", { ascending: false }),
        scope(supabase.from("assets").select("*").eq("user_id", user.id)).is("deleted_at", null).order("created_at", { ascending: false }),
      ]);

      const firstError = projectsResult.error || foldersResult.error || assetsResult.error;
      if (firstError) {
        toast({ title: "Projects could not load", description: firstError.message, variant: "destructive" });
      }

      const list = (projectsResult.data || []).filter(Boolean);
      const folderList = (foldersResult.data || []).filter(Boolean);
      const items = (assetsResult.data || []).filter(Boolean);

      setProjects(list);
      setFolders(folderList);
      setAllAssets(items);

      const nextCounts: Record<string, number> = {};
      const nextFolderCounts: Record<string, number> = {};
      const nextImages: Record<string, string> = {};
      const nextLogotypes: Record<string, any> = {};
      const nextFolderImages: Record<string, string> = {};
      const nextFolderLogotypes: Record<string, any> = {};

      items.forEach((asset: any) => {
        if (!asset) return;
        const img = asset.thumbnail_url || asset.image_url;

        if (asset.project_id) {
          nextCounts[asset.project_id] = (nextCounts[asset.project_id] || 0) + 1;
          if (img && !nextImages[asset.project_id]) nextImages[asset.project_id] = img;
          if (!img && asset.editor_state?.kind === "logotype" && !nextLogotypes[asset.project_id]) {
            nextLogotypes[asset.project_id] = asset.editor_state;
          }
        }

        const folderId = getDesignFolderId(asset);
        if (folderId) {
          nextFolderCounts[folderId] = (nextFolderCounts[folderId] || 0) + 1;
          if (img && !nextFolderImages[folderId]) nextFolderImages[folderId] = img;
          if (!img && asset.editor_state?.kind === "logotype" && !nextFolderLogotypes[folderId]) {
            nextFolderLogotypes[folderId] = asset.editor_state;
          }
        }
      });

      setCounts(nextCounts);
      setFolderCounts(nextFolderCounts);
      setLatestImages(nextImages);
      setLatestLogotypes(nextLogotypes);
      setLatestFolderImages(nextFolderImages);
      setLatestFolderLogotypes(nextFolderLogotypes);
    } catch (error: any) {
      toast({ title: "Projects could not load", description: error?.message || "Try refreshing the page.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const uploads = useMemo(
    () => allAssets.filter((asset) => isUploadedImageDesign(asset)),
    [allAssets],
  );

  const sortedProjects = useMemo(
    () => sortByOption(projects, sort, (project) => project.name, (project) => project.created_at),
    [projects, sort],
  );
  const sortedFolders = useMemo(
    () => sortByOption(folders, sort, (folder) => folder.name, (folder) => folder.created_at),
    [folders, sort],
  );
  const sortedUploads = useMemo(
    () => sortByOption(uploads, sort, (asset) => asset.title, (asset) => asset.created_at),
    [uploads, sort],
  );

  const selectedProjects = Array.from(selected).filter((key) => key.startsWith("project:")).map((key) => key.replace("project:", ""));
  const selectedFolders = Array.from(selected).filter((key) => key.startsWith("folder:")).map((key) => key.replace("folder:", ""));
  const selectedUploads = Array.from(selected).filter((key) => key.startsWith("upload:")).map((key) => key.replace("upload:", ""));

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
    const workspace_id = await ensureActiveWorkspaceId();
    const { data, error } = await supabase.from("projects").insert({ user_id: user!.id, workspace_id, name } as any).select().single();
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setProjects((prev) => [data, ...prev]);
    setCreating(false);
    setNewName("");
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
    const workspace_id = await ensureActiveWorkspaceId();
    const { data, error } = await supabase.from("folders").insert({ user_id: user!.id, workspace_id, name } as any).select().single();
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setFolders((prev) => [data, ...prev]);
    setCreatingFolder(false);
    setNewFolderName("");
  };

  const rename = async () => {
    if (!renaming || !renameVal.trim()) return;
    const id = renaming.id;
    const name = renameVal.trim();
    setProjects((prev) => prev.map((project) => project.id === id ? { ...project, name } : project));
    setRenaming(null);
    await supabase.from("projects").update({ name }).eq("id", id);
  };

  const renameFolder = async () => {
    if (!renamingFolder || !renameFolderVal.trim()) return;
    const id = renamingFolder.id;
    const name = renameFolderVal.trim();
    setFolders((prev) => prev.map((folder) => folder.id === id ? { ...folder, name } : folder));
    setRenamingFolder(null);
    await supabase.from("folders").update({ name }).eq("id", id);
  };

  const del = async (id: string, skipConfirm = false) => {
    if (!skipConfirm && !confirm("Delete this project? Designs and assets inside will be uncategorized but not deleted.")) return false;
    setProjects((prev) => prev.filter((project) => project.id !== id));
    await supabase.from("projects").delete().eq("id", id);
    return true;
  };

  const delFolder = async (folder: any, skipConfirm = false) => {
    if (!skipConfirm && !confirm(`Delete folder "${folder.name}"? Designs and assets in it will be removed from the folder but not deleted.`)) return false;
    const linked = allAssets.filter((asset: any) => getDesignFolderId(asset) === folder.id);
    await Promise.all(linked.map((asset: any) => supabase.from("assets").update({ meta: withDesignFolderId(asset.meta, null) }).eq("id", asset.id)));
    setFolders((prev) => prev.filter((item) => item.id !== folder.id));
    await supabase.from("folders").delete().eq("id", folder.id);
    setFolderCounts((prev) => {
      const next = { ...prev };
      delete next[folder.id];
      return next;
    });
    return true;
  };

  const delUpload = async (id: string, skipConfirm = false) => {
    if (!skipConfirm && !confirm("Move this uploaded design to Trash?")) return false;
    setAllAssets((prev) => prev.filter((asset) => asset.id !== id));
    await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    return true;
  };

  const duplicateUpload = async (asset: any) => {
    const { id: _id, created_at: _created, updated_at: _updated, deleted_at: _deleted, share_token: _share, ...rest } = asset;
    const payload = {
      ...rest,
      title: asset.title ? `${asset.title} (copy)` : "Uploaded design (copy)",
    };
    const { data: dupRow, error } = await supabase.from("assets").insert(payload).select("id").single();
    if (error) {
      toast({ title: "Copy failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Design copied" });
    window.dispatchEvent(new CustomEvent("rocket:notify", { detail: {
      kind: "asset",
      title: "Upload duplicated",
      body: payload.title || "Copy saved to uploads.",
      href: dupRow?.id ? `/editor?id=${dupRow.id}` : "/projects",
    }}));
    load();
  };

  const assignUploadToFolder = async (asset: any, folderId: string | null) => {
    const nextMeta = withDesignFolderId(asset.meta, folderId);
    const { error } = await supabase.from("assets").update({ meta: nextMeta }).eq("id", asset.id);
    if (error) {
      toast({ title: "Move failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: folderId ? "Moved file to folder" : "Removed file from folder" });
    load();
  };

  const bulkAssignUploadsToFolder = async (folderId: string | null) => {
    const rows = allAssets.filter((asset) => selectedUploads.includes(asset.id));
    if (!rows.length) return;
    const results = await Promise.all(rows.map((asset) => supabase.from("assets").update({ meta: withDesignFolderId(asset.meta, folderId) }).eq("id", asset.id)));
    const firstError = results.find((result: any) => result.error)?.error;
    if (firstError) {
      toast({ title: "Move failed", description: firstError.message, variant: "destructive" });
      return;
    }
    toast({ title: folderId ? `Moved ${rows.length} files to folder` : `Removed ${rows.length} files from folder` });
    clearSelection();
    load();
  };

  const createFolderAndAssignUpload = async (asset: any) => {
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
    await assignUploadToFolder(asset, data.id);
  };

  const bulkDeleteSelected = async () => {
    if (!selected.size) return;
    const ok = confirm(`Delete ${selected.size} selected item${selected.size === 1 ? "" : "s"}?`);
    if (!ok) return;
    for (const id of selectedProjects) await del(id, true);
    for (const id of selectedFolders) {
      const folder = folders.find((row) => row.id === id);
      if (folder) await delFolder(folder, true);
    }
    for (const id of selectedUploads) await delUpload(id, true);
    clearSelection();
    toast({ title: "Selection updated" });
    load();
  };

  const openCoverPicker = async (project: any) => {
    setCoverPicker(project);
    setCoverChoices([]);
    const { data } = await supabase
      .from("assets")
      .select("id,title,image_url,thumbnail_url,created_at")
      .eq("project_id", project.id)
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    setCoverChoices(data || []);
  };

  const setCover = async (url: string | null) => {
    if (!coverPicker) return;
    const id = coverPicker.id;
    setProjects((prev) => prev.map((project) => project.id === id ? { ...project, cover_url: url } : project));
    setCoverPicker(null);
    await supabase.from("projects").update({ cover_url: url }).eq("id", id);
  };

  const shareUrl = (token?: string | null) => token ? `${window.location.origin}/share/project/${token}` : "";

  const enableShare = async (project: any) => {
    let token = project.share_token;
    if (!token) {
      token = (crypto as any).randomUUID();
      const { error } = await supabase.from("projects").update({ share_token: token }).eq("id", project.id);
      if (error) {
        toast({ title: "Failed to enable sharing", description: error.message, variant: "destructive" });
        return;
      }
      setProjects((prev) => prev.map((item) => item.id === project.id ? { ...item, share_token: token } : item));
    }
    setSharing({ ...project, share_token: token });
  };

  const disableShare = async (project: any) => {
    setProjects((prev) => prev.map((item) => item.id === project.id ? { ...item, share_token: null } : item));
    setSharing(null);
    await supabase.from("projects").update({ share_token: null }).eq("id", project.id);
    toast({ title: "Public link disabled" });
  };

  const copyShare = async () => {
    if (!sharing?.share_token) return;
    await navigator.clipboard.writeText(shareUrl(sharing.share_token));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const renderCardPreview = (image?: string, logotype?: any) => {
    if (image) {
      return (
        <div className="aspect-[16/9] w-full overflow-hidden bg-neutral-100">
          <img src={image} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
        </div>
      );
    }
    if (logotype) {
      return (
        <div className="aspect-[16/9] w-full overflow-hidden bg-neutral-50">
          <Logotype state={logotype} fit="contain" />
        </div>
      );
    }
    return (
      <div className="grid aspect-[16/9] w-full place-items-center bg-neutral-50">
        <Folder className="h-8 w-8 text-neutral-300" />
      </div>
    );
  };

  const SectionToolbar = ({ total, title }: { total: number; title: string }) => (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {total > 0 && <span className="text-xs text-neutral-500">{total} total</span>}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-neutral-500">Keep every design, upload and brand decision in one workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/trash"
            title="Trash"
            aria-label="Trash"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
          >
            <Trash2 className="h-4 w-4" />
          </Link>
          <button onClick={() => setCreatingFolder(true)} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium hover:bg-neutral-50">
            <Folder className="h-4 w-4" /> New folder
          </button>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:bg-brand-hover">
            <Plus className="h-4 w-4" /> New Project
          </button>
        </div>
      </div>

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
          <button onClick={clearSelection} className="rounded-full border border-neutral-200 bg-white px-2 py-1 hover:bg-neutral-50">Clear</button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button disabled={!selectedUploads.length} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                <FolderPlus className="h-3.5 w-3.5" /> Move files to folder
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-white" align="start">
              <DropdownMenuLabel className="text-[10px] uppercase text-neutral-500">Folders</DropdownMenuLabel>
              {folders.length === 0 ? <div className="px-2 py-2 text-xs text-neutral-500">No folders yet.</div> : folders.map((folder) => (
                <DropdownMenuItem key={folder.id} onClick={() => bulkAssignUploadsToFolder(folder.id)} className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">
                  {folder.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => bulkAssignUploadsToFolder(null)} className="cursor-pointer text-neutral-600 focus:bg-neutral-100 focus:text-neutral-900">Remove from folder</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={bulkDeleteSelected}
            disabled={!selected.size}
            className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}

      {loading ? (
        <ProjectGridSkeleton />
      ) : (
        <div className="mt-8 space-y-10">
          <section>
            <SectionToolbar title="Projects" total={sortedProjects.length} />
            {sortedProjects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
                <Folder className="mx-auto h-8 w-8 text-neutral-300" />
                <p className="mt-3 text-sm text-neutral-500">No projects yet. Create one to organize your brand and designs.</p>
                <button onClick={() => setCreating(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm text-brand-foreground hover:bg-brand-hover">
                  <Plus className="h-3.5 w-3.5" /> New Project
                </button>
              </div>
            ) : view === "card" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sortedProjects.map((project) => {
                  const isSelected = selected.has(selKey("project", project.id));
                  return (
                    <div key={project.id} className={`group relative overflow-hidden rounded-2xl border bg-white transition hover:shadow-md ${isSelected ? "border-brand ring-2 ring-brand/30" : "border-neutral-200"}`}>
                      {selectMode && (
                        <button onClick={() => toggleSelected(selKey("project", project.id))} className="absolute left-2 top-2 z-10 rounded-md bg-white/95 p-1 shadow-sm">
                          {isSelected ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4 text-neutral-500" />}
                        </button>
                      )}
                      {selectMode ? (
                        <button onClick={() => toggleSelected(selKey("project", project.id))} className="block w-full text-left">
                          {renderCardPreview(project.cover_url || latestImages[project.id], !project.cover_url ? latestLogotypes[project.id] : null)}
                          <div className="flex items-start gap-3 p-4">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-neutral-900">{project.name}</div>
                              <div className="mt-0.5 text-xs text-neutral-500">{counts[project.id] || 0} designs · {new Date(project.created_at).toLocaleDateString()}</div>
                            </div>
                          </div>
                        </button>
                      ) : (
                        <Link to={counts[project.id] ? `/projects/${project.id}` : `/create?project=${project.id}`} className="block">
                          {renderCardPreview(project.cover_url || latestImages[project.id], !project.cover_url ? latestLogotypes[project.id] : null)}
                          <div className="flex items-start gap-3 p-4">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-neutral-900">{project.name}</div>
                              <div className="mt-0.5 text-xs text-neutral-500">{counts[project.id] || 0} designs · {new Date(project.created_at).toLocaleDateString()}</div>
                            </div>
                          </div>
                        </Link>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition group-hover:opacity-100 hover:bg-neutral-100"><MoreHorizontal className="h-4 w-4 text-neutral-600" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => { setRenameVal(project.name); setRenaming(project); }}><Pencil className="mr-2 h-4 w-4" /> Rename</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openCoverPicker(project)}><ImageIcon className="mr-2 h-4 w-4" /> Change cover</DropdownMenuItem>
                          {project.cover_url && (
                            <DropdownMenuItem onClick={async () => { setProjects((prev) => prev.map((item) => item.id === project.id ? { ...item, cover_url: null } : item)); await supabase.from("projects").update({ cover_url: null }).eq("id", project.id); }}><X className="mr-2 h-4 w-4" /> Reset cover</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => enableShare(project)}><Share2 className="mr-2 h-4 w-4" /> {project.share_token ? "Manage public link" : "Share publicly"}</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => del(project.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                {sortedProjects.map((project) => {
                  const isSelected = selected.has(selKey("project", project.id));
                  return (
                    <div key={project.id} className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0">
                      {selectMode && (
                        <button onClick={() => toggleSelected(selKey("project", project.id))}>
                          {isSelected ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4 text-neutral-500" />}
                        </button>
                      )}
                      <Link to={counts[project.id] ? `/projects/${project.id}` : `/create?project=${project.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="h-14 w-20 overflow-hidden rounded-lg bg-neutral-100">
                          {renderCardPreview(project.cover_url || latestImages[project.id], !project.cover_url ? latestLogotypes[project.id] : null)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-neutral-900">{project.name}</div>
                          <div className="text-xs text-neutral-500">{counts[project.id] || 0} designs · {new Date(project.created_at).toLocaleDateString()}</div>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <SectionToolbar title="Folders" total={sortedFolders.length} />
            {sortedFolders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
                <Folder className="mx-auto h-8 w-8 text-neutral-300" />
                <p className="mt-3 text-sm text-neutral-500">No folders yet. Create one to group related designs outside a full project.</p>
                <button onClick={() => setCreatingFolder(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm hover:bg-neutral-50">
                  <Plus className="h-3.5 w-3.5" /> New folder
                </button>
              </div>
            ) : view === "card" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sortedFolders.map((folder) => {
                  const isSelected = selected.has(selKey("folder", folder.id));
                  return (
                    <div key={folder.id} className={`group relative overflow-hidden rounded-2xl border bg-white transition hover:shadow-md ${isSelected ? "border-brand ring-2 ring-brand/30" : "border-neutral-200"}`}>
                      {selectMode && (
                        <button onClick={() => toggleSelected(selKey("folder", folder.id))} className="absolute left-2 top-2 z-10 rounded-md bg-white/95 p-1 shadow-sm">
                          {isSelected ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4 text-neutral-500" />}
                        </button>
                      )}
                      {selectMode ? (
                        <button onClick={() => toggleSelected(selKey("folder", folder.id))} className="block w-full text-left">
                          {renderCardPreview(latestFolderImages[folder.id], latestFolderLogotypes[folder.id])}
                          <div className="flex items-start gap-3 p-4">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-neutral-900">{folder.name}</div>
                              <div className="mt-0.5 text-xs text-neutral-500">{folderCounts[folder.id] || 0} designs · {new Date(folder.created_at).toLocaleDateString()}</div>
                            </div>
                          </div>
                        </button>
                      ) : (
                        <Link to={`/designs?folder=${folder.id}`} className="block">
                          {renderCardPreview(latestFolderImages[folder.id], latestFolderLogotypes[folder.id])}
                          <div className="flex items-start gap-3 p-4">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-neutral-900">{folder.name}</div>
                              <div className="mt-0.5 text-xs text-neutral-500">{folderCounts[folder.id] || 0} designs · {new Date(folder.created_at).toLocaleDateString()}</div>
                            </div>
                          </div>
                        </Link>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition group-hover:opacity-100 hover:bg-neutral-100"><MoreHorizontal className="h-4 w-4 text-neutral-600" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => { setRenameFolderVal(folder.name); setRenamingFolder(folder); }}><Pencil className="mr-2 h-4 w-4" /> Rename</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => delFolder(folder)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                {sortedFolders.map((folder) => {
                  const isSelected = selected.has(selKey("folder", folder.id));
                  return (
                    <div key={folder.id} className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0">
                      {selectMode && (
                        <button onClick={() => toggleSelected(selKey("folder", folder.id))}>
                          {isSelected ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4 text-neutral-500" />}
                        </button>
                      )}
                      <Link to={`/designs?folder=${folder.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="h-14 w-20 overflow-hidden rounded-lg bg-neutral-100">
                          {renderCardPreview(latestFolderImages[folder.id], latestFolderLogotypes[folder.id])}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-neutral-900">{folder.name}</div>
                          <div className="text-xs text-neutral-500">{folderCounts[folder.id] || 0} designs · {new Date(folder.created_at).toLocaleDateString()}</div>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <SectionToolbar title="Uploads" total={sortedUploads.length} />
            {sortedUploads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-neutral-300" />
                <p className="mt-3 text-sm text-neutral-500">No uploaded files yet. Upload images in the editor to see them here.</p>
              </div>
            ) : view === "card" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sortedUploads.map((asset) => {
                  const isSelected = selected.has(selKey("upload", asset.id));
                  return (
                    <div key={asset.id} className={`group relative overflow-hidden rounded-2xl border bg-white transition hover:shadow-md ${isSelected ? "border-brand ring-2 ring-brand/30" : "border-neutral-200"}`}>
                      {selectMode && (
                        <button onClick={() => toggleSelected(selKey("upload", asset.id))} className="absolute left-2 top-2 z-10 rounded-md bg-white/95 p-1 shadow-sm">
                          {isSelected ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4 text-neutral-500" />}
                        </button>
                      )}
                      <Link to={`/editor?id=${asset.id}`} target="_blank" rel="noopener noreferrer" className="block">
                        <div className="aspect-[16/9] w-full overflow-hidden bg-neutral-100">
                          <img src={asset.thumbnail_url || asset.image_url} alt={asset.title || ""} className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
                        </div>
                        <div className="p-4">
                          <div className="truncate text-sm font-medium text-neutral-900">{asset.title || "Untitled upload"}</div>
                          <div className="mt-0.5 text-xs text-neutral-500">{new Date(asset.created_at).toLocaleDateString()}</div>
                        </div>
                      </Link>
                      {!selectMode && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="absolute right-2 top-2 rounded-md bg-white/95 p-1 opacity-0 shadow-sm transition group-hover:opacity-100 hover:bg-neutral-100"><MoreHorizontal className="h-4 w-4 text-neutral-600" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => duplicateUpload(asset)}><Copy className="mr-2 h-4 w-4" /> Duplicate</DropdownMenuItem>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger className="cursor-pointer"><FolderPlus className="mr-2 h-4 w-4" /> Move to folder</DropdownMenuSubTrigger>
                              <DropdownMenuPortal>
                                <DropdownMenuSubContent className="bg-white">
                                  {folders.length === 0 ? <div className="px-2 py-2 text-xs text-neutral-500">No folders yet.</div> : folders.map((folder) => (
                                    <DropdownMenuItem key={folder.id} onClick={() => assignUploadToFolder(asset, folder.id)} className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900">
                                      {folder.name}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => createFolderAndAssignUpload(asset)} className="cursor-pointer focus:bg-neutral-100 focus:text-neutral-900"><Plus className="mr-2 h-4 w-4" /> New folder…</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => assignUploadToFolder(asset, null)} className="cursor-pointer text-neutral-600 focus:bg-neutral-100 focus:text-neutral-900">Remove from folder</DropdownMenuItem>
                                </DropdownMenuSubContent>
                              </DropdownMenuPortal>
                            </DropdownMenuSub>
                            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => delUpload(asset.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                {sortedUploads.map((asset) => {
                  const isSelected = selected.has(selKey("upload", asset.id));
                  return (
                    <div key={asset.id} className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0">
                      <button onClick={() => toggleSelected(selKey("upload", asset.id))}>
                        {isSelected ? <CheckSquare className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4 text-neutral-500" />}
                      </button>
                      <Link to={`/editor?id=${asset.id}`} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="h-14 w-20 overflow-hidden rounded-lg bg-neutral-100">
                          <img src={asset.thumbnail_url || asset.image_url} alt={asset.title || ""} className="h-full w-full object-cover" loading="lazy" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-neutral-900">{asset.title || "Untitled upload"}</div>
                          <div className="text-xs text-neutral-500">{new Date(asset.created_at).toLocaleDateString()}</div>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      )}

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Project name" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={creatingFolder} onOpenChange={(open) => !open && setCreatingFolder(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
          <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createFolder()} placeholder="Folder name" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingFolder(false)}>Cancel</Button>
            <Button onClick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename project</DialogTitle></DialogHeader>
          <Input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button onClick={rename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renamingFolder} onOpenChange={(open) => !open && setRenamingFolder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename folder</DialogTitle></DialogHeader>
          <Input value={renameFolderVal} onChange={(e) => setRenameFolderVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && renameFolder()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFolder(null)}>Cancel</Button>
            <Button onClick={renameFolder}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!coverPicker} onOpenChange={(open) => !open && setCoverPicker(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Choose cover image</DialogTitle></DialogHeader>
          {coverChoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">No image designs and assets in this project yet.</p>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto py-2 sm:grid-cols-4">
              {coverChoices.map((asset) => {
                const url = asset.image_url || asset.thumbnail_url;
                const isActive = coverPicker?.cover_url === url;
                return (
                  <button key={asset.id} onClick={() => setCover(url)} className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition ${isActive ? "border-brand" : "border-transparent hover:border-neutral-300"}`}>
                    <img src={asset.thumbnail_url || asset.image_url} alt={asset.title} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!sharing} onOpenChange={(open) => !open && setSharing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Share “{sharing?.name}” publicly</DialogTitle></DialogHeader>
          <p className="text-sm text-neutral-600">Anyone with this link can view the project and its designs and assets. No login required.</p>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
            <Link2 className="h-4 w-4 shrink-0 text-neutral-500" />
            <span className="flex-1 truncate font-mono text-xs text-neutral-800">{shareUrl(sharing?.share_token)}</span>
            <button onClick={copyShare} className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-100">
              {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={() => sharing && disableShare(sharing)}>Disable link</Button>
            <Button onClick={() => setSharing(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Projects;
