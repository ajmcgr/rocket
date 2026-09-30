import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Outlet, useParams } from "@/lib/router-compat";
import {
  Image as ImageIcon,
  BookOpen,
  Palette as PaletteIcon,
  Type,
  Download,
  Loader2,
  Pencil,
  Check as CheckIcon,
  X as XIcon,
  Share2,
} from "lucide-react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { downloadCompleteBrandKit } from "@/lib/brandKitDownload";
import { sendBrandKitEmail } from "@/lib/kitEmails";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "@/lib/router-compat";

const supabase = _sb as any;

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return message.includes(column.toLowerCase()) && (
    message.includes("column") || message.includes("schema cache") || message.includes("could not find")
  );
};

type NavKey = "logo-files" | "social-icons" | "palette" | "fonts" | "brand-book";

export default function BrandLayout() {
  const { id: projectId } = useParams();
  const { toast } = useToast();
  const { isPro, loading: subLoading } = useSubscription();
  const navigate = useNavigate();
  if (!projectId) return <Navigate to="/brands" replace />;

  const [project, setProject] = useState<any>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [zipping, setZipping] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("projects").select("id,name,user_id").eq("id", projectId).maybeSingle();
      if (!cancelled) setProject(data || null);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const startRename = () => { setNameDraft(project?.name || ""); setRenaming(true); };
  const cancelRename = () => { setRenaming(false); setNameDraft(""); };
  const commitRename = async () => {
    const name = nameDraft.trim();
    if (!name || name === project?.name) { cancelRename(); return; }
    setSavingName(true);
    const { error } = await supabase.from("projects").update({ name }).eq("id", projectId);
    setSavingName(false);
    if (error) return toast({ title: "Rename failed", description: error.message, variant: "destructive" });
    setProject((p: any) => ({ ...(p || {}), name }));
    setRenaming(false);
  };

  const downloadBrandKit = async () => {
    if (!subLoading && !isPro) {
      toast({
        title: "Pro feature",
        description: "Brand kit downloads are available on the Pro plan.",
      });
      navigate("/pricing");
      return;
    }
    setZipping(true);
    try {
      const result = await downloadCompleteBrandKit({ supabase, projectId, project });
      toast({ title: "Brand kit downloaded", description: `${result.included} files packed.` });
      void sendBrandKitEmail("brand_kit_downloaded", {
        brand_name: project?.name || "your brand",
        brand_url: `https://tryrocket.ai/brands/${projectId}`,
        file_count: result.included,
      });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setZipping(false);
    }
  };

  const nav: { key: NavKey; label: string; icon: React.ComponentType<{ className?: string }>; to: string; end?: boolean }[] = useMemo(() => ([
    { key: "logo-files", label: "Logo/Icon Files", icon: ImageIcon, to: `/brands/${projectId}`, end: true },
    { key: "social-icons", label: "Social Icons", icon: Share2, to: `/brands/${projectId}/social-icons` },
    { key: "palette", label: "Palette", icon: PaletteIcon, to: `/brands/${projectId}/palette` },
    { key: "fonts", label: "Fonts", icon: Type, to: `/brands/${projectId}/fonts` },
    { key: "brand-book", label: "Brand Book", icon: BookOpen, to: `/brands/${projectId}/brand-book` },
  ]), [projectId]);

  return (
    <div className="flex h-[calc(100vh-56px)] w-full overflow-hidden bg-neutral-50 font-body">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <div className="px-4 pt-4">
          <button
            onClick={downloadBrandKit}
            disabled={zipping}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground transition hover:bg-brand-hover disabled:opacity-60"
          >
            {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
            {!subLoading && !isPro && (
              <span className="ml-1 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Pro</span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") cancelRename(); }}
                  className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-900 outline-hidden focus:border-brand"
                />
                <button onClick={commitRename} disabled={savingName} className="rounded-md p-1 text-emerald-600 hover:bg-emerald-50"><CheckIcon className="h-3.5 w-3.5" /></button>
                <button onClick={cancelRename} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100"><XIcon className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <button onClick={startRename} className="group flex w-full items-center gap-1 truncate text-left text-base font-semibold text-neutral-900" title="Rename brand">
                <span className="truncate">{project?.name || "Untitled brand"}</span>
                <Pencil className="h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-70" />
              </button>
            )}
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-neutral-100 font-medium text-neutral-900"
                      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}