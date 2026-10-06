import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { myProfileHref } from "@/lib/myProfileNavigation";

// Auth metadata can contain a username before a public profile is published.
// Only an owner-scoped saved profile is evidence for a public destination.
export function useMyProfileHref(user: User | null) {
  const [resolved, setResolved] = useState<{ userId: string; href: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setResolved(null);
    if (!user) return;
    (supabase as any).from("member_public_profiles").select("username")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data, error }: any) => {
        if (alive) setResolved({ userId: user.id, href: error ? "/settings/profile" : myProfileHref(data) });
      })
      .catch(() => { if (alive) setResolved({ userId: user.id, href: "/settings/profile" }); });
    return () => { alive = false; };
  }, [user]);
  return user && resolved?.userId === user.id ? resolved.href : "/settings/profile";
}
