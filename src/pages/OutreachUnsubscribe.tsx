import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import SiteHeader from "@/components/SiteHeader";

export default function OutreachUnsubscribe() {
  const [message, setMessage] = useState("Processing your request…");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token") || "";
    window.history.replaceState(window.history.state, "", url.pathname);
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setMessage("This unsubscribe link is incomplete. Contact Rocket if you need help.");
      return;
    }
    const unsubscribe = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, string>) => Promise<{
      error: { message: string } | null;
    }>;
    void unsubscribe("rocket_unsubscribe_founder_outreach", { p_token: token })
      .then(({ error }) => setMessage(error
        ? "We couldn't process your request right now. Please try again."
        : "You won't receive further Rocket founder-outreach emails. Account, security, billing, and purchase messages are unaffected."))
      .catch(() => setMessage("We couldn't process your request right now. Please try again."));
  }, []);
  return <div className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-[#0f0f0f] dark:text-white">
    <SiteHeader />
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Founder outreach preferences</h1>
      <p className="mt-6 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-700" role="status">{message}</p>
    </main>

  </div>;
}
