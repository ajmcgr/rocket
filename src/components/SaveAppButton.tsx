import { useNavigate } from "@/lib/router-compat";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

type Props = { appId: string; saved: boolean; onChange: (saved: boolean) => void };

export default function SaveAppButton({ appId, saved, onChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/apps/${appId}?save=1`)}`);
      return;
    }
    setBusy(true);
    setError(false);
    const result = saved
      ? await supabase.from("saved_apps").delete().eq("user_id", user.id).eq("app_id", appId)
      : await supabase.from("saved_apps").insert({ user_id: user.id, app_id: appId });
    if (result.error && !(result.error.code === "23505" && !saved)) setError(true);
    else { onChange(!saved); track(saved ? "app_unsaved" : "app_saved", { app_id: appId }); }
    setBusy(false);
  };

  return <button type="button" aria-label={saved ? "Unsave app" : "Save app"}
    aria-pressed={saved} disabled={busy} onClick={toggle}
    title={error ? "Could not update Saved Apps. Try again." : saved ? "Remove from Saved Apps" : "Save app"}
    className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${saved ? "border-sky-300 bg-sky-50 text-sky-700" : "border-neutral-200 bg-white text-neutral-700 hover:border-sky-300 hover:text-sky-700"}`}>
    <span aria-hidden="true">{saved ? "🔖" : "📑"}</span>{saved ? "Saved" : "Save"}
  </button>;
}
