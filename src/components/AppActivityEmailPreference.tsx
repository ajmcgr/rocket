import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export default function AppActivityEmailPreference() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (!user)
      return () => {
        active = false;
      };
    void (async () => {
      try {
        const result = await db
          .from("app_activity_email_preferences")
          .select("enabled")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!active) return;
        if (result.error) throw result.error;
        setEnabled(result.data?.enabled ?? true);
      } catch {
        if (active)
          setError(
            "Couldn't load app activity email preferences. Refresh to try again.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);
  const toggle = async () => {
    if (!user || loading || saving || error) return;
    setSaving(true);
    try {
      const next = !enabled;
      const result = await db
        .from("app_activity_email_preferences")
        .upsert({ user_id: user.id, enabled: next }, { onConflict: "user_id" });
      if (result.error) throw result.error;
      setEnabled(next);
    } catch {
      setError(
        "Couldn't save app activity email preferences. Refresh to try again.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-6 border-t border-neutral-200 pt-5 dark:border-neutral-700">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p
            id="app-activity-emails-label"
            className="text-sm text-neutral-700 dark:text-neutral-200"
          >
            App activity emails
          </p>
          <p
            id="app-activity-emails-description"
            className="mt-1 text-xs text-neutral-500 dark:text-neutral-400"
          >
            Email me when someone saves my app or adds it to a collection.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="app-activity-emails-label"
          aria-describedby="app-activity-emails-description"
          disabled={!user || loading || saving || !!error}
          onClick={() => void toggle()}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${enabled ? "bg-brand" : "bg-neutral-300 dark:bg-neutral-600"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? "left-[22px]" : "left-0.5"}`}
          />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
