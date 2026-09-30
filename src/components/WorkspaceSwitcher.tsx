import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Plus, Users, Lock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import {
  createWorkspace,
  ensureActiveWorkspaceId,
  getActiveWorkspaceIdSync,
  invalidateWorkspacesCache,
  listWorkspaces,
  setActiveWorkspaceId,
  type Workspace,
} from "@/lib/workspace";

const WorkspaceSwitcher = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isPro, loading: subLoading } = useSubscription();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(getActiveWorkspaceIdSync());
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listWorkspaces(true);
      setWorkspaces(list);
      const id = await ensureActiveWorkspaceId();
      setActiveId(id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    refresh();
    const onChange = () => setActiveId(getActiveWorkspaceIdSync());
    window.addEventListener("workspace:changed", onChange);
    return () => window.removeEventListener("workspace:changed", onChange);
  }, [user?.id]);

  const active = workspaces.find(w => w.id === activeId) || workspaces[0];

  const pick = (id: string) => {
    if (id === activeId) return;
    setActiveWorkspaceId(id);
    setActiveId(id);
    // Full reload — many pages cache scoped data.
    setTimeout(() => window.location.reload(), 30);
  };

  const create = async () => {
    if (!isPro) {
      toast({ title: "Pro plan required", description: "Upgrade to create additional workspaces.", variant: "destructive" });
      navigate("/pricing");
      return;
    }
    const name = window.prompt("Workspace name")?.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await createWorkspace(name, { userId: user!.id });
      invalidateWorkspacesCache();
      await refresh();
      pick(created.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      toast({ title: "Failed to create workspace", description: message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex max-w-[180px] items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-700 outline-hidden hover:bg-neutral-50 focus:ring-2 focus:ring-neutral-300">
        <Users className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        <span className="truncate font-medium">{loading ? "Loading…" : active?.name || "Workspace"}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-neutral-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
        <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Workspaces</div>
        {workspaces.length === 0 && !loading ? (
          <div className="px-2 py-2 text-sm text-neutral-500">No workspaces yet.</div>
        ) : null}
        {workspaces.map(w => (
          <DropdownMenuItem
            key={w.id}
            onSelect={() => pick(w.id)}
            className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {w.id === activeId ? <Check className="h-4 w-4 shrink-0 text-brand" /> : <span className="w-4" />}
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.is_personal && <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">Personal</span>}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={create}
          disabled={creating || subLoading}
          className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900"
          title={!isPro ? "Pro plan required" : undefined}
        >
          {isPro ? <Plus className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4 text-neutral-400" />}
          <span className="flex-1">New workspace</span>
          {!isPro && <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">Pro</span>}
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900">
          <Link to="/settings/team"><Users className="mr-2 h-4 w-4" /> Manage team</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WorkspaceSwitcher;
