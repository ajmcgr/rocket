import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { acquisitionDb as db } from "@/lib/rocketAcquisition";

export default function InboxEmailPreference() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    let live = true;
    void db.from("rocket_inbox_email_preferences").select("enabled").eq("user_id", user.id).maybeSingle()
      .then(({ data, error: loadError }: any) => {
        if (!live) return;
        if (loadError) setError("Couldn't load message email preference.");
        else setEnabled(data?.enabled ?? true);
        setBusy(false);
      });
    return () => { live = false; };
  }, [user?.id]);
  const toggle = async () => {
    if (!user || busy) return;
    setBusy(true); setError("");
    const { error: saveError } = await db.from("rocket_inbox_email_preferences")
      .upsert({ user_id: user.id, enabled: !enabled }, { onConflict: "user_id" });
    if (saveError) setError("Couldn't save message email preference."); else setEnabled(!enabled);
    setBusy(false);
  };
  return <div className="mt-6 flex items-center justify-between gap-4 border-t border-neutral-200 pt-5">
    <div><p id="inbox-email-label" className="text-sm text-neutral-700">Message emails</p><p className="mt-1 text-xs text-neutral-500">Email me when I receive a Rocket message. Rapid messages are grouped.</p></div>
    <button type="button" role="switch" aria-checked={enabled} aria-labelledby="inbox-email-label" disabled={busy || !!error} onClick={() => void toggle()}
      className={`relative h-6 w-11 shrink-0 rounded-full disabled:opacity-50 ${enabled ? "bg-brand" : "bg-neutral-300"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white ${enabled ? "left-[22px]" : "left-0.5"}`} />
    </button>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </div>;
}
