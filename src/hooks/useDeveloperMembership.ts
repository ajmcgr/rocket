import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useDeveloperMembership() {
  const { user, loading: authLoading } = useAuth();
  const query = useQuery({
    queryKey: ["developer-membership", user?.id],
    enabled: Boolean(user),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("rocket-developer-membership", { method: "GET" });
      if (error || typeof data?.active !== "boolean") throw new Error("Membership status is temporarily unavailable.");
      return data as { active: boolean; membership: { current_period_end: string } | null };
    },
  });
  return { active: Boolean(user && query.data?.active), loading: authLoading || Boolean(user && query.isPending), error: query.error, refresh: query.refetch };
}
