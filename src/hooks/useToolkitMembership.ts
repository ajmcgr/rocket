import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// The server repeats this check for every privileged toolkit action. This hook
// only controls the presentation of paid controls in an owner's browser.
export function useToolkitMembership() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<{ owner: string; active: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    setState(null);
    if (!user) return () => { alive = false; };
    supabase.functions.invoke("rocket-developer-membership", { method: "GET" })
      .then(({ data, error }) => { if (alive) setState({ owner: user.id, active: !error && data?.active === true }); })
      .catch(() => { if (alive) setState({ owner: user.id, active: false }); });
    return () => { alive = false; };
  }, [user?.id]);
  return { active: Boolean(user && state?.owner === user.id && state.active), loading: authLoading || Boolean(user && state?.owner !== user.id) };
}
