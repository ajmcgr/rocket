import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import SiteHeader from "@/components/SiteHeader";

const storageKey = "rocket:founder-claim-invitation";
type Invitation = { token: string; appId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenPattern = /^[0-9a-f]{64}$/;

export default function ClaimInvitation() {
  const { user, loading } = useAuth();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const redeeming = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token") || "";
    const appId = url.searchParams.get("app") || "";
    if (token || appId) {
      window.history.replaceState(window.history.state, "", url.pathname);
      if (tokenPattern.test(token) && uuid.test(appId)) {
        sessionStorage.setItem(storageKey, JSON.stringify({ token, appId }));
      } else {
        sessionStorage.removeItem(storageKey);
      }
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null") as Invitation | null;
      if (saved && tokenPattern.test(saved.token) && uuid.test(saved.appId)) setInvitation(saved);
      else setMessage("This invitation link is invalid or incomplete.");
    } catch { setMessage("This invitation link is invalid."); }
  }, []);

  useEffect(() => {
    if (loading || !user || !invitation || redeeming.current) return;
    redeeming.current = true;
    setMessage("Confirming your Launch founder invitation…");
    const redeem = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, string>) => Promise<{
      data: { app_id?: string } | null; error: { message: string } | null;
    }>;
    void redeem("rocket_redeem_claim_invitation", {
      p_token: invitation.token, p_app_id: invitation.appId,
    }).then(({ data, error }) => {
      if (error || !data?.app_id) {
        setMessage("We couldn't complete this claim. Sign in with the confirmed email address that owns the Launch listing, or request a new invitation.");
        redeeming.current = false;
        return;
      }
      sessionStorage.removeItem(storageKey);
      setDone(true);
      setMessage("Your app is now claimed on Rocket. Domain, traffic, revenue, and usage verification are separate checks.");
    }).catch(() => {
      setMessage("We couldn't reach Rocket. Please try this link again shortly.");
      redeeming.current = false;
    });
  }, [invitation, loading, user]);

  return <div className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-[#0f0f0f] dark:text-white"><SiteHeader /><main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
    <h1 className="text-4xl font-bold tracking-tight">Claim your app on Rocket</h1>
    <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-300">
      This invitation is for the confirmed email address associated with a Launch product owner.
    </p>
    {message && <p className="mt-6 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-700" role="status">{message}</p>}
    {!loading && !user && invitation && <Link
      to="/login?next=%2Fclaim-invitation"
      className="mt-6 inline-flex rounded-xl bg-[#167ac6] px-5 py-3 font-semibold text-white"
    >Sign in to claim</Link>}
    {done && invitation && <Link to={`/apps/${invitation.appId}`} className="mt-6 inline-flex rounded-xl border border-[#167ac6] px-5 py-3 font-semibold text-[#167ac6] dark:text-sky-300">View your app</Link>}
  </main></div>;
}
