import { useNavigate } from "@/lib/router-compat";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import { Bookmark, LoaderCircle } from "lucide-react";

type Props = { appId: string; saved: boolean; onChange: (saved: boolean) => void; light?: boolean; compact?: boolean };

export default function SaveAppButton({ appId, saved, onChange, light = false, compact = false }: Props) {
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
    try {
      const result = saved
        ? await supabase.from("saved_apps").delete().eq("user_id", user.id).eq("app_id", appId)
        : await supabase.from("saved_apps").insert({ user_id: user.id, app_id: appId });
      if (result.error && !(result.error.code === "23505" && !saved)) setError(true);
      else {
        onChange(!saved);
        track(saved ? "app_unsaved" : "app_saved", { app_id: appId });
        if (!saved) navigate("/saved-apps");
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return <button type="button" aria-label={saved ? "Unsave app" : "Save app"}
    aria-pressed={saved} disabled={busy} onClick={toggle}
    title={error ? "Could not update Saved Apps. Try again." : saved ? "Remove from Saved Apps" : "Save app"}
    className={`inline-flex ${compact ? "h-11 w-11 sm:h-9 sm:w-9 rounded-lg" : "h-11 w-11 rounded-xl"} shrink-0 items-center justify-center border bg-transparent transition disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${light ? "border-white/80 text-white hover:bg-white/10" : saved ? "border-[#167ac6] text-[#167ac6] dark:text-[#dcefff]" : "border-neutral-200 text-neutral-600 hover:border-[#167ac6] hover:text-[#167ac6] dark:border-neutral-700 dark:text-neutral-200"}`}>
    {busy ? <LoaderCircle aria-hidden="true" className={`${compact ? "h-4 w-4" : "h-5 w-5"} animate-spin`} /> : <Bookmark aria-hidden="true" className={compact ? "h-4 w-4" : "h-5 w-5"} fill={saved ? "currentColor" : "none"} />}
  </button>;
}
