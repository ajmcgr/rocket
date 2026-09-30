import { X as ControlX, UserPlus as ControlUserPlus, Copy as ControlCopy, Trash2 as ControlTrash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Copy, Crown, Mail, Trash2, UserPlus, X } from "@/components/EmojiIcons";
import { useToast } from "@/hooks/use-toast";

export type CollabRole = "viewer" | "editor";
export type Collaborator = {
  id: string;
  email: string;
  role: CollabRole;
  status: "active" | "pending";
  invitedAt: number;
};

const keyFor = (projectId: string) => `rocket.collaborators.${projectId}`;

export const loadCollaborators = (projectId: string): Collaborator[] => {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    return raw ? (JSON.parse(raw) as Collaborator[]) : [];
  } catch { return []; }
};

const saveCollaborators = (projectId: string, list: Collaborator[]) => {
  try { localStorage.setItem(keyFor(projectId), JSON.stringify(list)); } catch {}
};

const initials = (email: string) => {
  const name = email.split("@")[0] || "";
  const parts = name.split(/[._-]/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
};

const colorFor = (email: string) => {
  const palette = ["bg-rose-100 text-rose-700","bg-amber-100 text-amber-700","bg-emerald-100 text-emerald-700","bg-sky-100 text-sky-700","bg-violet-100 text-violet-700","bg-fuchsia-100 text-fuchsia-700"];
  let h = 0; for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  projectName: string;
  ownerEmail?: string;
  shareUrl?: string | null;
  onChange?: (list: Collaborator[]) => void;
};

const CollaboratorsModal = ({ open, onOpenChange, projectId, projectName, ownerEmail, shareUrl, onChange }: Props) => {
  const { toast } = useToast();
  const [list, setList] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollabRole>("editor");

  useEffect(() => { if (open) setList(loadCollaborators(projectId)); }, [open, projectId]);

  const persist = (next: Collaborator[]) => {
    setList(next); saveCollaborators(projectId, next); onChange?.(next);
  };

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast({ title: "Enter a valid email", variant: "destructive" }); return;
    }
    if (list.some(c => c.email === value)) {
      toast({ title: "Already invited" }); return;
    }
    const item: Collaborator = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      email: value, role, status: "pending", invitedAt: Date.now(),
    };
    persist([item, ...list]);
    setEmail("");
    toast({ title: "Invite sent", description: `${value} can join ${projectName} as ${role}.` });
    try {
      window.dispatchEvent(new CustomEvent("rocket:notify", { detail: {
        kind: "project", title: `Invited ${value}`, body: `${role} on ${projectName}`, href: `/projects/${projectId}`,
      }}));
    } catch {}
  };

  const setRoleFor = (id: string, r: CollabRole) => persist(list.map(c => c.id === id ? { ...c, role: r } : c));
  const activate = (id: string) => persist(list.map(c => c.id === id ? { ...c, status: "active" } : c));
  const remove = (id: string) => persist(list.filter(c => c.id !== id));

  const copyInvite = async (c: Collaborator) => {
    const base = shareUrl || `${window.location.origin}/projects/${projectId}`;
    const url = `${base}${base.includes("?") ? "&" : "?"}invite=${c.id}`;
    try { await navigator.clipboard.writeText(url); toast({ title: "Invite link copied" }); } catch {}
  };

  const sorted = useMemo(() => [...list].sort((a, b) => b.invitedAt - a.invitedAt), [list]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Collaborators</h2>
            <p className="text-xs text-neutral-500">Invite people to view or edit “{projectName}”.</p>
          </div>
          <button onClick={() => onOpenChange(false)} aria-label="Close" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"><ControlX className="h-4 w-4" /></button>
        </div>

        <form onSubmit={invite} className="flex flex-wrap items-center gap-2 px-5 py-4">
          <div className="flex flex-1 items-center rounded-lg border border-neutral-200 bg-white px-3 focus-within:border-neutral-400">
            <Mail className="h-4 w-4 text-neutral-400" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@team.com"
              className="ml-2 h-9 flex-1 bg-transparent text-sm outline-hidden placeholder:text-neutral-400" />
          </div>
          <select value={role} onChange={e => setRole(e.target.value as CollabRole)} className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-sm">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-brand-foreground hover:bg-brand-hover">
            <ControlUserPlus className="h-4 w-4" /> Invite
          </button>
        </form>

        <div className="max-h-[55vh] overflow-y-auto px-2 pb-4">
          {ownerEmail && (
            <div className="flex items-center gap-3 rounded-xl px-3 py-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${colorFor(ownerEmail)}`}>{initials(ownerEmail)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{ownerEmail}</div>
                <div className="text-[11px] text-neutral-500">You</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"><Crown className="h-3 w-3" /> Owner</span>
            </div>
          )}
          {sorted.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-neutral-500">No collaborators yet. Invite teammates above.</p>
          ) : sorted.map(c => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-neutral-50">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${colorFor(c.email)}`}>{initials(c.email)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.email}</div>
                <div className="text-[11px] text-neutral-500">
                  {c.status === "pending" ? "Pending invite" : "Active"} · invited {new Date(c.invitedAt).toLocaleDateString()}
                </div>
              </div>
              <select value={c.role} onChange={e => setRoleFor(c.id, e.target.value as CollabRole)} className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              {c.status === "pending" ? (
                <button onClick={() => activate(c.id)} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] hover:bg-neutral-100" title="Mark as accepted">Accept</button>
              ) : null}
              <button onClick={() => copyInvite(c)} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100" title="Copy invite link"><ControlCopy className="h-4 w-4" /></button>
              <button onClick={() => remove(c.id)} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-600" title="Remove"><ControlTrash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        <div className="border-t border-neutral-100 bg-neutral-50/60 px-5 py-3 text-[11px] text-neutral-500">
          Editors can change designs and run workflows. Viewers see designs and comments only.
        </div>
      </div>
    </div>
  );
};

export default CollaboratorsModal;
