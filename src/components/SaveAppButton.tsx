import { Bookmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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
    else onChange(!saved);
    setBusy(false);
  };

  return <button type="button" aria-label={saved ? "Unsave app" : "Save app"}
    aria-pressed={saved} disabled={busy} onClick={toggle}
    title={error ? "Could not update Saved Apps. Try again." : saved ? "Remove from Saved Apps" : "Save app"}
    className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-xs disabled:opacity-50 ${saved ? "border-sky-300 bg-sky-50 text-sky-700" : "border-neutral-200 bg-white text-neutral-600 hover:border-sky-300"}`}>
    <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}
  </button>;
}
