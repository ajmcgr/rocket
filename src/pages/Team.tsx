import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ensureActiveWorkspaceId, getActiveWorkspaceIdSync, listWorkspaces } from "@/lib/workspace";
import { Loader2, Trash2, Mail } from "lucide-react";

const sb = supabase as any;

type Role = "owner" | "admin" | "editor" | "viewer";
const ROLES: Role[] = ["owner", "admin", "editor", "viewer"];

type Member = { id: string; user_id: string; role: Role; email?: string; created_at: string };
type Invite = { id: string; email: string; role: Role; token: string; created_at: string; accepted_at: string | null };

const Team = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [workspaceId, setWorkspaceId] = useState<string | null>(getActiveWorkspaceIdSync());
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [sending, setSending] = useState(false);

  const canManage = myRole === "owner" || myRole === "admin";

  const load = async () => {
    setLoading(true);
    const wid = await ensureActiveWorkspaceId();
    setWorkspaceId(wid);
    if (!wid) { setLoading(false); return; }
    const [wRes, mRes, iRes, wsList] = await Promise.all([
      sb.from("workspaces").select("name").eq("id", wid).maybeSingle(),
      sb.from("workspace_members")
        .select("id, user_id, role, created_at, profiles:profiles!workspace_members_user_id_fkey(email, username)")
        .eq("workspace_id", wid)
        .order("created_at", { ascending: true }),
      sb.from("workspace_invites")
        .select("id, email, role, token, created_at, accepted_at")
        .eq("workspace_id", wid)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
      listWorkspaces(),
    ]);
    setWorkspaceName(wRes.data?.name || "");
    const mine = wsList.find(w => w.id === wid);
    setMyRole((mine?.role as Role) || null);
    setMembers((mRes.data || []).map((r: any) => ({
      id: r.id, user_id: r.user_id, role: r.role,
      email: r.profiles?.email || r.profiles?.username || r.user_id.slice(0, 8),
      created_at: r.created_at,
    })));
    setInvites(iRes.data || []);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user?.id]);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !workspaceId) return;
    setSending(true);
    try {
      const token = crypto.randomUUID();
      const { data, error } = await sb.from("workspace_invites").insert({
        workspace_id: workspaceId, email, role: inviteRole, token, invited_by: user!.id,
      }).select("*").single();
      if (error) throw error;
      try {
        await supabase.functions.invoke("send-email", {
          body: {
            template: "workspace_invite", invite_id: data.id,
          },
        });
      } catch (e) { console.warn("invite email failed", e); }
      setInvites(prev => [data, ...prev]);
      setInviteEmail("");
      toast({ title: "Invite sent", description: email });
    } catch (e: any) {
      toast({ title: "Invite failed", description: e.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const revokeInvite = async (id: string) => {
    if (!confirm("Revoke this invite?")) return;
    const { error } = await sb.from("workspace_invites").delete().eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setInvites(prev => prev.filter(i => i.id !== id));
  };

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
    toast({ title: "Link copied" });
  };

  const updateRole = async (memberId: string, role: Role) => {
    const { error } = await sb.from("workspace_members").update({ role }).eq("id", memberId);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m));
  };

  const removeMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === user?.id) return toast({ title: "You can't remove yourself here." });
    if (!confirm("Remove this member?")) return;
    const { error } = await sb.from("workspace_members").delete().eq("id", memberId);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setMembers(prev => prev.filter(m => m.id !== memberId));
  };

  if (loading) return <div className="flex items-center gap-2 py-16 text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading team…</div>;
  if (!workspaceId) return <p className="text-neutral-500">No active workspace.</p>;

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-xl font-semibold">{workspaceName || "Team"}</h2>
            <p className="mt-1 text-sm text-neutral-500">Manage members and invitations for this workspace.</p>
          </div>
          {myRole && <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">You: {myRole}</span>}
        </div>
      </section>

      {canManage && (
        <section>
          <h3 className="text-sm font-semibold text-neutral-900">Invite by email</h3>
          <form onSubmit={sendInvite} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@company.com"
              className="min-w-[240px] flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400" />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
              {ROLES.filter(r => r !== "owner").map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
              Send invite
            </Button>
          </form>
        </section>
      )}

      {invites.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-neutral-900">Pending invites</h3>
          <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {invites.map(i => (
              <li key={i.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-neutral-900">{i.email}</div>
                  <div className="text-xs text-neutral-500">Role: {i.role} · sent {new Date(i.created_at).toLocaleDateString()}</div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => copyLink(i.token)} className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50">Copy link</button>
                    <button onClick={() => revokeInvite(i.id)} className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold text-neutral-900">Members ({members.length})</h3>
        <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {members.map(m => (
            <li key={m.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-neutral-900">{m.email}{m.user_id === user?.id ? " (you)" : ""}</div>
                <div className="text-xs text-neutral-500">Joined {new Date(m.created_at).toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-2">
                {canManage && m.role !== "owner" && m.user_id !== user?.id ? (
                  <select value={m.role} onChange={(e) => updateRole(m.id, e.target.value as Role)} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs">
                    {ROLES.filter(r => r !== "owner").map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">{m.role}</span>
                )}
                {canManage && m.role !== "owner" && m.user_id !== user?.id && (
                  <button onClick={() => removeMember(m.id, m.user_id)} className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default Team;
