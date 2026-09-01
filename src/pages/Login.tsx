import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { safeReturnPath } from "@/lib/navigation";

const AUTH_CALLBACK_URL = `${window.location.origin}/auth/callback`;

const Login = ({ mode = "login" as "login" | "signup" }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const nav = useNavigate();
  const loc = useLocation() as ReturnType<typeof useLocation> & { state?: { from?: string } };
  const queryNext = new URLSearchParams(loc.search).get("next");
  const next = safeReturnPath(loc.state?.from || queryNext);
  const isSignup = mode === "signup";
  const authSwitchHref = `${isSignup ? "/login" : "/signup"}?next=${encodeURIComponent(next)}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignup) {
      const u = username.trim().replace(/^@/, "");
      if (!/^[a-zA-Z0-9_]{2,30}$/.test(u)) {
        toast({ title: "Invalid username", description: "2–30 letters, numbers, or underscores.", variant: "destructive" });
        return;
      }
    }
    setLoading(true);
    try {
      if (isSignup) {
        const ref = (() => { try { return new URLSearchParams(window.location.search).get("ref") || localStorage.getItem("rocket:ref") || undefined; } catch { return undefined; } })();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim().replace(/^@/, ""), ref } },
        });
        if (error) throw error;
        // With Supabase "Confirm email" OFF (we verify ourselves via Resend), signUp returns a session.
        if (data.session) {
          await supabase.functions.invoke("send-verification", { body: { next } }).catch((e) => {
            console.warn("send-verification failed", e);
          });
        }
        nav(`/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`, { replace: true });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const isOAuth = ((data.user?.app_metadata as { provider?: string } | undefined)?.provider || "email") !== "email";
        if (isOAuth) { nav(next, { replace: true }); return; }

        // Supabase Auth is the source of truth: confirmed there means verified.
        if (data.user?.email_confirmed_at) {
          // Best-effort server-side sync of profiles.email_verified (+usage row).
          supabase.functions.invoke("verify-email", { body: {} }).catch(() => {});
          nav(next, { replace: true });
          return;
        }

        // Check our profile flag (types file doesn't include profiles yet).
        const { data: prof } = await (supabase as any)
          .from("profiles")
          .select("email_verified")
          .eq("user_id", data.user!.id)
          .maybeSingle();
        if (!(prof && prof.email_verified)) {
          await supabase.functions.invoke("send-verification", { body: { next } }).catch(() => {});
          nav(`/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`, { replace: true });
          return;
        }
        nav(next, { replace: true });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{isSignup ? "Create your account" : "Log in"}</h1>
          <p className="mt-1.5 text-sm text-neutral-500">{isSignup ? "Start with 500 free credits." : "Welcome back."}</p>

          <Button onClick={google} variant="outline" size="lg" className="mt-6 w-full gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.99 6.99 0 0 1 5.47 12c0-.73.13-1.43.36-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-neutral-400">
            <div className="h-px flex-1 bg-neutral-200" /> or <div className="h-px flex-1 bg-neutral-200" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {isSignup && (
              <div className="flex items-center rounded-lg border border-neutral-200 bg-white pl-3 ring-neutral-300 transition focus-within:ring-2">
                <span className="text-sm text-neutral-400">@</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_]+"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-11 flex-1 rounded-r-lg bg-transparent px-2 text-sm outline-none"
                />
              </div>
            )}
            <input type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-3.5 text-sm outline-none ring-neutral-300 transition focus:ring-2" />
            <input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-3.5 text-sm outline-none ring-neutral-300 transition focus:ring-2" />
            {!isSignup && (
              <div className="text-right">
                <Link to="/forgot-password" className="text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:underline">Forgot password?</Link>
              </div>
            )}
            <Button type="submit" disabled={loading} size="lg" className="w-full">
              {loading ? "…" : isSignup ? "Create account" : "Log in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-500">
            {isSignup ? (<>Already have an account? <Link to={authSwitchHref} className="font-medium text-neutral-900 hover:underline">Log in</Link></>) : (<>No account? <Link to={authSwitchHref} className="font-medium text-neutral-900 hover:underline">Sign up</Link></>)}
          </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Login;
