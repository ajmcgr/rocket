import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { assetHref, isBrandAsset } from "@/lib/assetExperience";
import { designSearchText, rankDesignsByRelevance, rankProjectsByRelevance } from "@/lib/searchRelevance";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sparkles, LayoutGrid, LineChart, Settings, CreditCard,
  LogOut, FileText, Palette, Bell, BookOpen,
} from "lucide-react";

const supabase = _sb as any;

type AssetRow = {
  id: string;
  title: string;
  asset_type: string | null;
  prompt: string | null;
  content: string | null;
  meta: unknown;
  created_at: string | null;
};
type ProjectRow = { id: string; name: string; description: string | null; created_at: string | null };

const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const nav = useNavigate();
  const { user, signOut } = useAuth();

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lazy-load user's assets + projects when palette opens
  useEffect(() => {
    if (!open || !user?.id) return;
    let cancel = false;
    (async () => {
      const [{ data: a }, { data: p }] = await Promise.all([
        supabase.from("assets").select("id,title,asset_type,prompt,content,meta,created_at").eq("user_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(250),
        supabase.from("projects").select("id,name,description,created_at").eq("user_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
      ]);
      if (cancel) return;
      setAssets((a || []) as AssetRow[]);
      setProjects((p || []) as ProjectRow[]);
    })();
    return () => { cancel = true; };
  }, [open, user?.id]);

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    nav(path);
  };

  const searching_q = query.trim().length > 0;
  const mergedProjects = useMemo(() => rankProjectsByRelevance(projects, query), [projects, query]);
  const mergedAssets = useMemo(() => rankDesignsByRelevance(assets, query), [assets, query]);
  const brandItems = mergedAssets.filter((a) => isBrandAsset(a));
  const designItems = mergedAssets.filter((a) => !isBrandAsset(a));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search designs, projects, or jump to…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go("/logos")}><Sparkles /> Create new design</CommandItem>
          <CommandItem onSelect={() => go("/designs")}><LayoutGrid /> Browse all designs</CommandItem>
          <CommandItem onSelect={() => go("/insights")}><LineChart /> Insights</CommandItem>
          <CommandItem onSelect={() => go("/notifications")}><Bell /> Notifications</CommandItem>
        </CommandGroup>
        {mergedProjects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={searching_q ? "Matching projects" : "Projects"}>
              {mergedProjects.map((p) => (
                <CommandItem key={p.id} value={`project ${p.name}`} onSelect={() => go(`/projects/${p.id}`)}>
                  <Palette /> {p.name || "Untitled project"}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {designItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={searching_q ? "Matching designs" : "Recent designs"}>
              {designItems.map((a) => (
                <CommandItem key={a.id} value={`design ${designSearchText(a)}`} onSelect={() => go(assetHref(a))}>
                  <FileText />
                  <span className="truncate">{a.title || "Untitled"}</span>
                  {a.asset_type && <span className="ml-auto text-xs text-neutral-400">{a.asset_type.replace(/_/g, " ")}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {brandItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={searching_q ? "Matching brand" : "Brand"}>
              {brandItems.map((a) => (
                <CommandItem key={a.id} value={`brand ${a.title} ${a.asset_type || ""}`} onSelect={() => go(assetHref(a))}>
                  <BookOpen />
                  <span className="truncate">{a.title || "Untitled"}</span>
                  {a.asset_type && <span className="ml-auto text-xs text-neutral-400">{a.asset_type.replace(/_/g, " ")}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem onSelect={() => go("/settings")}><Settings /> Settings</CommandItem>
          <CommandItem onSelect={() => go("/pricing")}><CreditCard /> Plans & billing</CommandItem>
          <CommandItem onSelect={async () => { setOpen(false); await signOut(); nav("/"); }}>
            <LogOut /> Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/70 px-3 py-1.5 text-[10px] text-neutral-500">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><kbd className="rounded border border-neutral-200 bg-white px-1 font-mono">↑↓</kbd> navigate</span>
          <span className="inline-flex items-center gap-1"><kbd className="rounded border border-neutral-200 bg-white px-1 font-mono">↵</kbd> open</span>
          <span className="inline-flex items-center gap-1"><kbd className="rounded border border-neutral-200 bg-white px-1 font-mono">esc</kbd> close</span>
        </div>
        <span className="inline-flex items-center gap-1"><kbd className="rounded border border-neutral-200 bg-white px-1 font-mono">⌘K</kbd> anywhere</span>
      </div>
    </CommandDialog>
  );
};

export default CommandPalette;
