import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { safeReturnPath } from "@/lib/navigation";

const AuthCallback = () => {
  const nav = useNavigate();
  const ran = useRef(false);
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const url = new URL(window.location.href);
        const next = safeReturnPath(url.searchParams.get("next"));
        const code = url.searchParams.get("code");
        const errDesc = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (errDesc) throw new Error(errDesc);

        // supabase-js may have already exchanged the PKCE code while initializing.
        // Only exchange a code that has not produced a session yet, and pass the
        // code itself (not the callback URL) to the Auth API.
        let session = (await supabase.auth.getSession()).data.session;
        if (code && !session) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          session = data.session;
        }

        // Older email confirmation flows put tokens in the hash. supabase-js
        // picks these up automatically via detectSessionInUrl on first load,
        // but we still wait briefly for the session to settle.
        for (let i = 0; i < 10 && !session; i++) {
          await new Promise((r) => setTimeout(r, 100));
          session = (await supabase.auth.getSession()).data.session;
        }
        if (!session) throw new Error("No session");

        // Clean the URL so refreshes don't re-trigger the exchange.
        window.history.replaceState({}, "", "/auth/callback");
        nav(next, { replace: true });
      } catch (e) {
        console.error("[auth/callback]", e);
        setMessage("Verification failed. Redirecting…");
        setTimeout(() => nav("/login?error=verification_failed", { replace: true }), 800);
      }
    })();
  }, [nav]);

  return (
    <div className="grid min-h-screen place-items-center bg-white text-sm text-neutral-500">{message}</div>
  );
};

export default AuthCallback;
