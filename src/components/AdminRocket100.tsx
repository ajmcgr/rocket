import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";

type Member = { user_id: string; username: string; name: string; founding_number: number; awarded_at: string; revoked_at: string | null; revocation_reason: string | null; qualified: boolean; verified_apps: { id: string; name: string }[] | null; rank: number | null; score: number | null };
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
export default function AdminRocket100() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const result = await rpc("rocket100_admin_snapshot");
    if (result.error) { setError(result.error.message); return; }
    setMembers(Array.isArray(result.data?.members) ? result.data.members : []);
  };
  useEffect(() => { void refresh(); }, []);
  const revoke = async (member: Member) => {
    const reason = window.prompt(`Document why Founding Builder #${String(member.founding_number).padStart(3,"0")} should be revoked:`)?.trim();
    if (!reason) return;
    setBusy(true); setError("");
    const result = await rpc("rocket100_admin_revoke", { p_user_id: member.user_id, p_reason: reason });
    if (result.error) setError(result.error.message);
    else await refresh();
    setBusy(false);
  };
  return <section className="rocket-admin-panel"><h2>Rocket 100</h2><p className="rocket-admin-muted">Founding numbers are assigned automatically after public-profile and verified-app checks. Admins can review evidence and revoke abuse; they cannot award places or set ranks.</p>{error && <p className="rocket-admin-error" role="alert">{error}</p>}
    {members.length ? <div className="rocket-admin-list">{members.map((member) => <article key={member.user_id}><strong>#{String(member.founding_number).padStart(3,"0")} · <Link to={`/@${member.username}`}>{member.name || `@${member.username}`}</Link></strong><p>@{member.username} · awarded {new Date(member.awarded_at).toLocaleString()} · {member.revoked_at ? "Revoked" : `rank #${member.rank ?? "—"}, score ${member.score ?? "—"}`} · current qualification {member.qualified ? "valid" : "changed"}</p><p>Verified apps: {member.verified_apps?.map((app) => app.name).join(", ") || "None currently"}</p>{member.revoked_at ? <p>Revoked: {member.revocation_reason}</p> : <button disabled={busy} onClick={() => void revoke(member)}>Revoke for documented abuse</button>}</article>)}</div> : <p className="rocket-admin-muted">No founding numbers have been awarded.</p>}
  </section>;
}
