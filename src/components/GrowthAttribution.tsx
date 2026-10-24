import { useEffect } from "react";
import { useLocation } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { syncGrowthAttribution } from "@/lib/growthTracking";
export default function GrowthAttribution() {
  const {pathname, search} = useLocation();
  const {user} = useAuth();
  useEffect(() => { void syncGrowthAttribution(pathname, search, Boolean(user?.email_confirmed_at),user?.user_metadata?.rocket_growth_referral); }, [pathname, search, user?.id, user?.email_confirmed_at, user?.user_metadata?.rocket_growth_referral]);
  return null;
}
