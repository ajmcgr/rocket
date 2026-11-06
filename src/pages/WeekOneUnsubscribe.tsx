import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import SiteHeader from "@/components/SiteHeader";

export default function WeekOneUnsubscribe() {
  const [message, setMessage] = useState("Processing your request…");
  const [weeklyToken, setWeeklyToken] = useState("");
  const started = useRef(false);
  const unsubscribe = (token: string, weekly: boolean) => {
    setMessage("Processing your request…");
    void Promise.resolve(supabase.rpc((weekly ? "unsubscribe_weekly_email" : "unsubscribe_week_one_email") as never, { p_token: token } as never))
      .then(({ data, error }) => {
        if (!error && data) setWeeklyToken("");
        setMessage(error || !data
          ? "We couldn't process your request right now. Please try again."
          : `You won't receive Rocket's ${weekly ? "weekly emails" : "one-week follow-up email"}. Account, security, and purchase messages are unaffected.`);
      })
      .catch(() => setMessage("We couldn't process your request right now. Please try again."));
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token") || "";
    const weekly = url.searchParams.get("kind") === "weekly";
    window.history.replaceState(window.history.state, "", url.pathname);
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setMessage("This unsubscribe link is incomplete. Contact Rocket if you need help.");
      return;
    }
    if (weekly) {
      setWeeklyToken(token);
      setMessage("Confirm that you want to stop receiving weekly Rocket emails.");
      return;
    }
    unsubscribe(token, false);
  }, []);
  return <div className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-[#0f0f0f] dark:text-white">
    <SiteHeader />
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Email preferences</h1>
      <p className="mt-6 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-700" role="status">{message}</p>
      {weeklyToken && <button type="button" onClick={() => unsubscribe(weeklyToken, true)} className="mt-4 rounded-lg bg-neutral-900 px-5 py-3 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">Unsubscribe from weekly emails</button>}
    </main>
  </div>;
}
