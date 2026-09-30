import { FolderPlus as ControlFolderPlus, Check as ControlCheck, Loader2 as ControlLoader2, Plus as ControlPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FolderPlus, Check, Plus, Loader2 } from "@/components/EmojiIcons";
const supabase = _sb as any;

type Props = {
  assetId: string;
  currentProjectId?: string | null;
  onChanged?: (projectId: string | null) => void;
  variant?: "button" | "icon";
  className?: string;
};

export default function AddToProjectMenu({ assetId, currentProjectId, onChanged, variant = "button", className }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    (async () => {
      const { data } = await supabase.from("projects").select("id,name").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
      setProjects(data || []);
    })();
  }, [user, open]);

  const assign = async (projectId: string | null) => {
    setBusy(true);
    const { error } = await supabase.from("assets").update({ project_id: projectId }).eq("id", assetId);
    setBusy(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: projectId ? "Added to project" : "Removed from project" });
    onChanged?.(projectId);
    setOpen(false);
  };

  const createAndAssign = async () => {
    const name = window.prompt("New project name");
    if (!name?.trim() || !user) return;
    setCreating(true);
    const { data, error } = await supabase.from("projects").insert({ user_id: user.id, name: name.trim() }).select().single();
    setCreating(false);
    if (error || !data) { toast({ title: "Failed", description: error?.message, variant: "destructive" }); return; }
    await assign(data.id);
  };

  const currentName = projects.find(p => p.id === currentProjectId)?.name;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <button title="Add to project" className={className || "inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white p-2 text-sm hover:bg-neutral-50"}>
            <ControlFolderPlus className="h-4 w-4" />
          </button>
        ) : (
          <button className={className || "inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50"}>
            <ControlFolderPlus className="h-4 w-4" />
            {currentProjectId ? (currentName ? `In: ${currentName}` : "In project") : "Add to project"}
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-white">
        <DropdownMenuLabel className="text-xs text-neutral-500">Add to project</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.length === 0 ? (
          <div className="px-2 py-3 text-xs text-neutral-500">No projects yet.</div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {projects.map(p => (
              <DropdownMenuItem key={p.id} disabled={busy} onClick={() => assign(p.id)} className="flex items-center justify-between cursor-pointer">
                <span className="truncate">{p.name}</span>
                {p.id === currentProjectId && <ControlCheck className="h-3.5 w-3.5 text-emerald-600" />}
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={createAndAssign} disabled={creating} className="cursor-pointer">
          {creating ? <ControlLoader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ControlPlus className="mr-2 h-3.5 w-3.5" />} New project…
        </DropdownMenuItem>
        {currentProjectId && (
          <DropdownMenuItem onClick={() => assign(null)} disabled={busy} className="text-red-600 focus:text-red-600 cursor-pointer">
            Remove from project
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
