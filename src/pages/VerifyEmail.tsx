import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { safeReturnPath } from "@/lib/navigation";

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const rawToken = params.get("token") || "";
  const token = rawToken.trim().replace(/[).,>\s]+$/g, "");
  const email = params.get("email") || "";
  const next = safeReturnPath(params.get("next"));

  const nav = useNavigate();
  const { toast } = useToast();

  const [mode] = useState<"verify" | "inbox">(token ? "verify" : "inbox");
  const [state, setState] = useState<"verifying" | "success" | "error">(token ? "verifying" : "success");
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);

  const openMail = () => {
    const domain = email.split("@")[1]?.toLowerCase();
    const map: Record<string, string> = {
      "gmail.com": "https://mail.google.com",
      "googlemail.com": "https://mail.google.com",
      "outlook.com": "https://outlook.live.com/mail",
      "hotmail.com": "https://outlook.live.com/mail",
      "live.com": "https://outlook.live.com/mail",
      "yahoo.com": "https://mail.yahoo.com",
      "icloud.com": "https://www.icloud.com/mail",
      "me.com": "https://www.icloud.com/mail",
      "proton.me": "https://mail.proton.me",
      "protonmail.com": "https://mail.proton.me",
    };
    const url = (domain && map[domain]) || (email ? `mailto:${email}` : "mailto:");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const resend = async () => {
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-verification", { body: { next } });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { message?: string }).message || (data as { error: string }).error);
      if ((data as { throttled?: boolean })?.throttled) {
        toast({ title: "Slow down", description: "Too many requests. Try again in an hour.", variant: "destructive" });
      } else if ((data as { already_verified?: boolean })?.already_verified) {
        toast({ title: "Already verified", description: "You're good to go." });
        nav(next, { replace: true });
      } else {
        toast({ title: "Sent", description: "Check your inbox for the new link." });
      }
    } catch (e) {
      toast({ title: "Couldn't send", description: (e as Error).message || "Make sure you're signed in.", variant: "destructive" });
    } finally { setResending(false); }
  };

  useEffect(() => {
    if (mode !== "verify") return;
    let cancelled = false;
    (async () => {
      try {
        // Ensure we have a fresh session so the edge function sees the user as authenticated.
        await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke(`verify-email?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`, {
          body: { token, next },
          headers: { "x-verification-token": token },
        });
        if (cancelled) return;
        const payload = data as { ok?: boolean; success?: boolean; error?: string; message?: string; signInUrl?: string } | null;
        if (error || payload?.error) {
          // FALLBACK: if Supabase Auth already confirmed this user, treat as verified.
          try {
            const { data: fresh } = await supabase.auth.getUser();
            if (fresh.user?.email_confirmed_at) {
              if (cancelled) return;
              setState("success");
              setTimeout(() => nav(next, { replace: true }), 600);
              return;
            }
          } catch { /* ignore */ }
          if (cancelled) return;
          let detail = payload?.message || payload?.error || "";
          if (!detail && error && (error as { context?: { json: () => Promise<unknown> } }).context) {
            try {
              const body = await (error as { context: { json: () => Promise<{ message?: string; error?: string }> } }).context.json();
              detail = body?.message || body?.error || "";
            } catch { /* ignore */ }
          }
          setState("error");
          setMessage(detail || "This link is invalid or has expired.");
          return;
        }
        setState("success");
        // If signed out, the edge function returns a magic link — follow it to establish a session.
        if (payload?.signInUrl) {
          setTimeout(() => { window.location.href = payload.signInUrl!; }, 400);
        } else {
          setTimeout(() => nav(next, { replace: true }), 600);
        }
      } catch (e) {
        if (!cancelled) { setState("error"); setMessage((e as Error).message || "Something went wrong."); }
      }
    })();
    return () => { cancelled = true; };
  }, [mode, token, next, nav]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          {mode === "inbox" && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
              <p className="mt-2 text-sm text-neutral-500">
                We sent a confirmation link to{" "}
                <span className="font-medium text-neutral-900">{email || "your inbox"}</span>. Click it to finish setting up your Rocket account.
              </p>
              <Button onClick={openMail} size="lg" className="mt-6 w-full">Open email app</Button>
              <Button onClick={resend} disabled={resending} variant="outline" size="lg" className="mt-3 w-full">
                {resending ? "Sending…" : "Resend verification email"}
              </Button>
              <p className="mt-6 text-xs text-neutral-500">
                Wrong address? <Link to={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-neutral-900 hover:underline">Start over</Link>
              </p>
            </>
          )}
          {mode === "verify" && state === "verifying" && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Verifying your email…</h1>
              <p className="mt-2 text-sm text-neutral-500">One moment.</p>
            </>
          )}
          {mode === "verify" && state === "success" && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Email verified 🎉</h1>
              <p className="mt-2 text-sm text-neutral-500">You're all set. Time to launch.</p>
              <Button asChild size="lg" className="mt-6 w-full"><Link to={next}>Go to Rocket</Link></Button>
            </>
          )}
          {mode === "verify" && state === "error" && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Verification failed</h1>
              <p className="mt-2 text-sm text-neutral-500">{message}</p>
              <Button onClick={resend} disabled={resending} size="lg" className="mt-6 w-full">
                {resending ? "Sending…" : "Resend verification email"}
              </Button>
              <Button asChild variant="outline" size="lg" className="mt-3 w-full"><Link to="/login">Back to login</Link></Button>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default VerifyEmail;
