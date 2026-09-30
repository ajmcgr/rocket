import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { invalidateWorkspacesCache, setActiveWorkspaceId } from "@/lib/workspace";

const sb = supabase as any;

const AcceptInvite = () => {
  const { token } = useParams();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [invite, setInvite] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data } = await sb.from("workspace_invites")
        .select("email, role, accepted_at, workspaces(name)")
        .eq("token", token)
        .maybeSingle();
      setInvite(data);
    })();
  }, [token]);

  const accept = async () => {
    if (!token) return;
    setState("loading");
    try {
      const { data, error } = await sb.rpc("accept_workspace_invite", { _token: token });
      if (error) throw error;
      const wid = typeof data === "string" ? data : data?.workspace_id;
      if (wid) { invalidateWorkspacesCache(); setActiveWorkspaceId(wid); }
      setState("success");
      setTimeout(() => nav("/projects"), 900);
    } catch (e: any) {
      setState("error");
      setMessage(e.message || "Could not accept invite.");
    }
  };

  if (authLoading) return <div className="min-h-screen bg-white" />;

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-6 py-20">
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-xs">
          <h1 className="text-2xl font-semibold tracking-tight">Workspace invitation</h1>
          {invite ? (
            invite.accepted_at ? (
              <p className="mt-3 text-neutral-600">This invite has already been accepted.</p>
            ) : (
              <p className="mt-3 text-neutral-600">You've been invited to join <strong>{invite.workspaces?.name || "a workspace"}</strong> as <strong>{invite.role}</strong>.</p>
            )
          ) : (
            <p className="mt-3 text-neutral-500">Checking invite…</p>
          )}

          {!user ? (
            <div className="mt-6 space-y-2">
              <p className="text-sm text-neutral-600">Sign in or create an account{invite?.email ? <> with <strong>{invite.email}</strong></> : ""} to accept.</p>
              <div className="flex gap-2">
                <Button asChild><Link to={`/login?next=/invite/${token}`}>Log in</Link></Button>
                <Button asChild variant="outline"><Link to={`/signup?next=/invite/${token}`}>Sign up</Link></Button>
              </div>
            </div>
          ) : state === "success" ? (
            <div className="mt-6 flex items-center gap-2 text-emerald-600"><Check className="h-4 w-4" /> Joined! Redirecting…</div>
          ) : state === "error" ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-red-600"><X className="h-4 w-4" /> {message}</div>
              <Button onClick={accept} variant="outline">Try again</Button>
            </div>
          ) : (
            <div className="mt-6">
              <Button onClick={accept} disabled={state === "loading" || !invite || !!invite?.accepted_at}>
                {state === "loading" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Accept invitation
              </Button>
              {user.email && invite?.email && user.email.toLowerCase() !== invite.email.toLowerCase() && (
                <p className="mt-3 text-xs text-amber-600">Note: you're signed in as {user.email} but the invite was sent to {invite.email}.</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AcceptInvite;