import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type ConnectDetails = { client: { name: string; icon_url?: string | null }; scopes: string[] };
const scopeLabel: Record<string, string> = {
  openid: "Confirm your Rocket identity",
  profile: "View your basic profile",
  email: "View your email address",
};

export default function RocketConnectAuthorize() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<ConnectDetails | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const request = useMemo(
    () => (typeof window === "undefined" ? {} : Object.fromEntries(new URLSearchParams(window.location.search))),
    [],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      navigate(`/login?next=${encodeURIComponent(`/connect/authorize${window.location.search}`)}`, { replace: true });
      return;
    }
    supabase.functions.invoke("rocket-connect-authorize", { body: { ...request, action: "inspect" } })
      .then(({ data, error: invokeError }) => {
        if (invokeError || !data?.client) setError("This connection request is invalid or is no longer available.");
        else setDetails(data);
      })
      .catch(() => setError("We couldn't load this connection request."));
  }, [authLoading, navigate, request, session]);

  const respond = async (action: "approve" | "deny") => {
    setSubmitting(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("rocket-connect-authorize", { body: { ...request, action } });
      if (invokeError || !data?.redirect_to) throw invokeError || new Error("Authorization failed");
      window.location.assign(data.redirect_to);
    } catch {
      setError("We couldn't complete that request. Please return to the app and try again.");
      setSubmitting(false);
    }
  };

  if (authLoading || (!details && !error)) return <main className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-neutral-500" /></main>;
  if (error) return <main className="grid min-h-screen place-items-center p-6"><section className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-7 text-center"><h1 className="text-xl font-semibold">Connection unavailable</h1><p className="mt-2 text-sm text-neutral-600">{error}</p></section></main>;

  return <main className="grid min-h-screen place-items-center bg-neutral-50 p-5"><section className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-7 shadow-xs">
    <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-sky-50 text-sky-600">{details?.client.icon_url ? <img src={details.client.icon_url} className="h-full w-full object-cover" alt="" /> : <ShieldCheck className="h-5 w-5" />}</div><div><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Continue with Rocket</p><h1 className="text-lg font-semibold">{details?.client.name}</h1></div></div>
    <p className="mt-6 text-sm text-neutral-700"><span className="font-medium">{details?.client.name}</span> is asking to:</p>
    <ul className="mt-3 space-y-2">{details?.scopes.map((scope) => <li key={scope} className="flex items-center gap-2 text-sm text-neutral-600"><ShieldCheck className="h-4 w-4 text-emerald-600" />{scopeLabel[scope] || scope}</li>)}</ul>
    <p className="mt-5 text-xs leading-5 text-neutral-500">You can revoke this application at any time in Rocket Settings → Account.</p>
    <div className="mt-6 flex gap-3"><button disabled={submitting} onClick={() => respond("deny")} className="h-10 flex-1 rounded-lg border border-neutral-200 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60">Cancel</button><button disabled={submitting} onClick={() => respond("approve")} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-neutral-900 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}</button></div>
  </section></main>;
}
