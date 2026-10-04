import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/** One saved-state lookup per visible app collection, never one request per card. */
export function useSavedAppControls(appIds: string[]) {
  const { user } = useAuth();
  const userId = user?.id;
  const ids = [...new Set(appIds)].sort().join(",");
  const [state, setState] = useState<{ owner?: string; ids: Set<string> }>({ ids: new Set() });
  useEffect(() => {
    let active = true;
    if (!userId || !ids) return;
    Promise.resolve(supabase.from("saved_apps").select("app_id").eq("user_id", userId).in("app_id", ids.split(",")))
      .then(({ data, error }) => {
        if (active && !error) setState({ owner: userId, ids: new Set((data || []).map((row) => row.app_id)) });
      }).catch(() => { /* Keep the current state on a transient read failure. */ });
    return () => { active = false; };
  }, [userId, ids]);
  return (appId: string) => ({
    saved: Boolean(userId && state.owner === userId && state.ids.has(appId)),
    onSave: (saved: boolean) => setState((current) => {
      const next = new Set(current.owner === userId ? current.ids : []);
      if (saved) next.add(appId); else next.delete(appId);
      return { owner: userId, ids: next };
    }),
  });
}
