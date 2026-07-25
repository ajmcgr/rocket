import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Pin, PinOff, Pencil, Trash2, Plus, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
const supabase = _sb as any;

export type Chat = {
  id: string;
  title: string;
  pinned: boolean;
  updated_at: string;
};

type ChatRow = Pick<Chat, "id" | "title" | "updated_at"> & {
  pinned?: boolean | null;
};

let chatSchemaMode: "unknown" | "current" | "legacy" = "unknown";

const normalizeChats = (rows: ChatRow[] | null | undefined): Chat[] =>
  (rows ?? []).map((chat) => ({
    id: chat.id,
    title: chat.title,
    pinned: Boolean(chat.pinned),
    updated_at: chat.updated_at,
  }));

const ChatsSidebar = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const activeChatId = params.get("chat");
  const [chats, setChats] = useState<Chat[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [tick, setTick] = useState(0);

  const load = async () => {
    if (!user) {
      setChats([]);
      return;
    }

    const loadLegacyChats = async () => {
      const { data, error } = await supabase
        .from("chats")
        .select("id,title,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(200);

      setChats(error ? [] : normalizeChats(data));
    };

    if (chatSchemaMode === "legacy") {
      await loadLegacyChats();
      return;
    }

    let workspaceId: string | null = null;
    try {
      const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
      workspaceId = await ensureActiveWorkspaceId();
    } catch {
      workspaceId = null;
    }

    const createCurrentQuery = () =>
      supabase
        .from("chats")
        .select("id,title,pinned,updated_at")
        .eq("user_id", user.id);

    let result = workspaceId
      ? await createCurrentQuery()
          .eq("workspace_id", workspaceId)
          .order("pinned", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(200)
      : await createCurrentQuery()
          .order("pinned", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(200);

    if (result.error && workspaceId) {
      result = await createCurrentQuery()
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(200);
    }

    if (!result.error) {
      chatSchemaMode = "current";
      setChats(normalizeChats(result.data));
      return;
    }

    chatSchemaMode = "legacy";
    await loadLegacyChats();
  };

  useEffect(() => { load(); }, [user, tick, location.pathname]);
  useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener("workspace:changed", h);
    return () => window.removeEventListener("workspace:changed", h);
  }, []);
  useEffect(() => {
    const h = () => setTick(t => t + 1);
    window.addEventListener("chats:refresh", h);
    return () => window.removeEventListener("chats:refresh", h);
  }, []);

  const togglePin = async (c: Chat) => {
    if (chatSchemaMode === "legacy") {
      toast({
        title: "Pinning is unavailable for older chats",
        description: "Your chat is still available in Recent.",
      });
      return;
    }

    const { error } = await supabase.from("chats").update({ pinned: !c.pinned }).eq("id", c.id);
    if (error) {
      chatSchemaMode = "legacy";
      toast({
        title: "Pinning is unavailable for older chats",
        description: "Your chat is still available in Recent.",
      });
    }
    load();
  };

  const remove = async (c: Chat) => {
    if (!confirm(`Delete chat "${c.title}"? Designs in it will be kept.`)) return;
    await supabase.from("chats").delete().eq("id", c.id);
    if (activeChatId === c.id) nav("/logos");
    load();
  };

  const startRename = (c: Chat) => { setRenamingId(c.id); setRenameValue(c.title); };
  const commitRename = async () => {
    if (!renamingId) return;
    const v = renameValue.trim();
    if (v) {
      const { error } = await supabase.from("chats").update({ title: v }).eq("id", renamingId);
      if (error) toast({ title: "Rename failed", variant: "destructive" });
    }
    setRenamingId(null);
    load();
  };

  const pinned = chats.filter(c => c.pinned);
  const recent = chats.filter(c => !c.pinned);

  const newChatPath = ["/logos", "/icons"].includes(location.pathname) ? location.pathname : "/logos";

  return (
    <aside data-tour="chats-sidebar" className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-3 pt-3">
        <Link
          to={newChatPath}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
        >
          <Plus className="h-4 w-4" /> New
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {pinned.length > 0 && (
          <Section label="Pinned">
            {pinned.map(c => renderItem(c))}
          </Section>
        )}
        {recent.length > 0 && (
          <Section label="Recent">
            {recent.map(c => renderItem(c))}
          </Section>
        )}
        {chats.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-neutral-400">No chats yet</p>
        )}
      </div>
    </aside>
  );

  function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="mb-3">
        <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{label}</div>
        <div className="flex flex-col">{children}</div>
      </div>
    );
  }

  function renderItem(c: Chat) {
    const active = c.id === activeChatId;
    const isRenaming = renamingId === c.id;
    return (
      <div
        key={c.id}
        className={`group relative flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${active ? "bg-neutral-100 text-neutral-900" : "text-neutral-700 hover:bg-neutral-50"}`}
      >
        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
            className="flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-sm outline-none focus:border-brand"
          />
        ) : (
          <Link to={`/create?chat=${c.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
            {c.pinned && <Pin className="h-3 w-3 shrink-0 text-brand" aria-label="Pinned" />}
            <span className="truncate">{c.title}</span>
          </Link>
        )}
        {!isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="rounded p-1 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-700 focus:opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100"
              aria-label="Chat actions"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-white p-1.5 shadow-lg">
              <DropdownMenuItem onClick={() => togglePin(c)} className="cursor-pointer rounded-md px-3 py-2 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900">
                {c.pinned ? <><PinOff className="mr-2 h-3.5 w-3.5" /> Unpin</> : <><Pin className="mr-2 h-3.5 w-3.5" /> Pin</>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => startRename(c)} className="cursor-pointer rounded-md px-3 py-2 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900">
                <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => remove(c)} className="cursor-pointer rounded-md px-3 py-2 text-sm text-red-600 focus:bg-red-50 focus:text-red-600">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }
};

export default ChatsSidebar;
