import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export default function WeeklyEmailPreference() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (!user) { setLoading(false); return; }
    void db.from("weekly_email_preferences").select("enabled")
      .eq("user_id", user.id).maybeSingle().then(({ data, error: loadError }: any) => {
        if (!active) return;
        if (loadError) setError("Couldn't load weekly email preference. Refresh to try again.");
        else setEnabled(data?.enabled ?? false);
        setLoading(false);
      }).catch(() => {
        if (active) { setError("Couldn't load weekly email preference. Refresh to try again."); setLoading(false); }
      });
    return () => { active = false; };
  }, [user?.id]);
  const toggle = async () => {
    if (!user || loading || saving || error) return;
    setSaving(true);
    const next = !enabled;
    try {
      const { error: saveError } = await db.from("weekly_email_preferences")
        .upsert({ user_id: user.id, enabled: next }, { onConflict: "user_id" });
      if (saveError) throw saveError;
      setEnabled(next);
    } catch {
      setError("Couldn't save weekly email preference. Refresh to try again.");
    } finally { setSaving(false); }
  };
  return <div className="mt-6 border-t border-neutral-200 pt-5 dark:border-neutral-700">
    <div className="flex items-center justify-between gap-4">
      <div>
        <p id="weekly-email-label" className="text-sm text-neutral-700 dark:text-neutral-200">Weekly Rocket emails</p>
        <p id="weekly-email-description" className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Get a weekly reason to return, with app discovery and optional verification tips. Off until you turn it on. Unsubscribe anytime.</p>
      </div>
      <button type="button" role="switch" aria-checked={enabled} aria-labelledby="weekly-email-label"
        aria-describedby="weekly-email-description" disabled={!user || loading || saving || !!error}
        onClick={() => void toggle()}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${enabled ? "bg-brand" : "bg-neutral-300 dark:bg-neutral-600"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
  </div>;
}
