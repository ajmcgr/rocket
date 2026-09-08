import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { seedDemoBrandOnce } from "@/lib/seedDemoBrand";

type Ctx = { user: User | null; session: Session | null; loading: boolean; signOut: () => Promise<void> };
const AuthContext = createContext<Ctx>({ user: null, session: null, loading: true, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("rocket:ref", ref);
    } catch {}
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user?.id) {
        setTimeout(() => { seedDemoBrandOnce(s.user!.id); }, 0);
      }
    });
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session?.user?.id) {
          setTimeout(() => { seedDemoBrandOnce(data.session!.user.id); }, 0);
        }
      })
      .catch((error) => {
        // A transient auth/bootstrap failure must not leave every protected route
        // behind its loading screen forever. The auth listener can still restore
        // a later session after a reconnect.
        console.warn("Unable to restore session", error);
        setSession(null);
      })
      .finally(() => setLoading(false));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signOut: async () => {
          try { await supabase.auth.signOut({ scope: "local" }); } catch (e) { console.warn("signOut error", e); }
          setSession(null);
          try {
            Object.keys(localStorage)
              .filter((k) => k.startsWith("sb-") || k.includes("supabase.auth"))
              .forEach((k) => localStorage.removeItem(k));
          } catch {}
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
