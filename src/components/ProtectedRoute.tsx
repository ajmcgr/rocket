import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  const provider = (user?.app_metadata as { provider?: string } | undefined)?.provider || "email";
  const isOAuth = provider !== "email";
  // Supabase Auth is the source of truth: a populated email_confirmed_at means verified.
  const authConfirmed = isOAuth || !!user?.email_confirmed_at;

  const [verified, setVerified] = useState<boolean | null>(authConfirmed ? true : null);

  useEffect(() => {
    if (!user) return;
    if (authConfirmed) { setVerified(true); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (k: string, v: string) => {
              maybeSingle: () => Promise<{ data: { email_verified?: boolean } | null }>;
            };
          };
        };
      }).from("profiles").select("email_verified").eq("user_id", user.id).maybeSingle();
      if (!cancelled) setVerified(!!data?.email_verified);
    })();
    return () => { cancelled = true; };
  }, [user, authConfirmed]);

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-white text-sm text-neutral-500" aria-busy="true">
      Loading your account…
    </div>
  );
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (verified === null) return (
    <div className="flex min-h-screen items-center justify-center bg-white text-sm text-neutral-500" aria-busy="true">
      Checking your account…
    </div>
  );
  if (!verified) return <Navigate to={`/verify-email?email=${encodeURIComponent(user.email || "")}`} replace />;
  return <>{children}</>;
};

export default ProtectedRoute;
