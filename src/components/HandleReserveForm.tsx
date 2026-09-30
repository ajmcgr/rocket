import { useState } from "react";
import { ArrowRight, Check, Loader2, Sparkles, X, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
const supabase = _sb as any;

type Status = "idle" | "checking" | "available" | "taken" | "collecting" | "reserving" | "reserved" | "invalid";

// Handles that belong to existing users or are protected brand/system terms.
const RESERVED_HANDLES = new Set([
  "alex",
  "admin", "administrator", "root", "support", "help", "team", "staff", "official",
  "rocket", "tryrocket", "api", "www", "mail", "info", "contact", "about",
  "login", "signup", "settings", "billing", "account", "security", "legal",
]);

const HandleReserveForm = () => {
  const { toast } = useToast();
  const nav = useNavigate();
  const { user, signOut } = useAuth();
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const normalized = handle.trim().replace(/^@/, "");
  const isValid = /^[a-zA-Z0-9_]{2,30}$/.test(normalized);

  if (user) {
    return (
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-cream/10 bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-background text-cream">
            <AlertCircle className="h-5 w-5" />
          </div>
          <p className="flex-1 text-left text-base text-background sm:text-lg">
            Reservations are for new makers only.{" "}
            <button onClick={() => signOut()} className="underline underline-offset-2 hover:opacity-80">Sign out</button>{" "}
            to reserve a handle.
          </p>
        </div>
      </div>
    );
  }

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { setStatus("invalid"); return; }
    setStatus("checking");
    if (RESERVED_HANDLES.has(normalized.toLowerCase())) { setStatus("taken"); return; }
    const { data, error } = await supabase
      .from("handle_reservations")
      .select("handle")
      .ilike("handle", normalized)
      .maybeSingle();
    if (error) { toast({ title: "Something went wrong", variant: "destructive" }); setStatus("idle"); return; }
    setStatus(data ? "taken" : "available");
  };

  const reserve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    setStatus("reserving");

    // Best-effort reserve the handle so it can't be claimed twice while signup is in flight.
    // (Ignore duplicate errors — the auth signup is the real source of truth.)
    await supabase
      .from("handle_reservations")
      .insert({ handle: normalized, email: email.trim() || null });

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { handle: normalized, username: normalized },
      },
    });
    if (error) {
      setStatus("collecting");
      toast({ title: "Couldn't create your account", description: error.message, variant: "destructive" });
      return;
    }

    // Fire welcome verification email if we have a session (parity with /signup).
    if (data?.session) {
      supabase.functions.invoke("send-verification").catch(() => {});
    }

    setStatus("reserved");
    toast({ title: `@${normalized} is yours 🚀`, description: "Check your email to verify." });
    nav(`/verify-email?email=${encodeURIComponent(email.trim())}`, { replace: true });
  };

  if (status === "reserved") {
    return (
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-cream/15 bg-background/40 p-6 text-center backdrop-blur-md">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-cream/15 text-cream">
          <Check className="h-5 w-5" />
        </div>
        <p className="text-lg font-medium text-cream">@{normalized} is yours.</p>
        <p className="mt-1 text-sm text-cream/60">Check your email to verify your account.</p>
      </div>
    );
  }

  // Reserve step (handle is available, collect email + confirm)
  if (status === "collecting" || status === "reserving") {
    return (
      <form onSubmit={reserve} className="mx-auto w-full max-w-xl space-y-3">
        <div className="rounded-2xl border border-cream/15 bg-background/40 p-1 pl-5 backdrop-blur-md">
          <div className="flex items-center">
            <span className="text-base text-cream/50">@</span>
            <span className="ml-1 flex-1 truncate py-3 text-base text-cream">{normalized}</span>
            <span className="mr-3 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              <Check className="h-3 w-3" /> Available
            </span>
          </div>
        </div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="h-14 w-full rounded-2xl border border-cream/15 bg-background/40 px-5 text-base text-cream placeholder:text-cream/40 outline-hidden backdrop-blur-md focus:border-cream/40"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 6 chars)"
          className="h-14 w-full rounded-2xl border border-cream/15 bg-background/40 px-5 text-base text-cream placeholder:text-cream/40 outline-hidden backdrop-blur-md focus:border-cream/40"
        />
        <button
          type="submit"
          disabled={status === "reserving"}
          className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-cream text-sm font-semibold text-background transition hover:bg-white disabled:opacity-60"
        >
          {status === "reserving" ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</> : <>Claim @{normalized} <ArrowRight className="h-4 w-4" /></>}
        </button>
        <button type="button" onClick={() => setStatus("idle")} className="block w-full text-center text-xs text-cream/50 hover:text-cream/80">
          ← try a different handle
        </button>
      </form>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl rounded-3xl border border-cream/10 bg-background/30 p-4 backdrop-blur-md sm:p-6">
      <form onSubmit={check}>
        <div className="rounded-2xl border border-cream/15 bg-background/50 p-1.5 pl-5">
          <div className="flex items-center gap-2">
            <span className="text-base text-cream/50">@</span>
            <input
              type="text"
              autoFocus
              value={handle}
              onChange={(e) => { setHandle(e.target.value); if (status !== "idle") setStatus("idle"); }}
              placeholder="your-handle"
              maxLength={30}
              className="flex-1 bg-transparent py-3 text-base text-cream placeholder:text-cream/40 outline-hidden"
            />
            <button
              type="submit"
              disabled={status === "checking" || !handle.trim()}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-cream px-5 text-sm font-semibold text-background transition hover:bg-white disabled:opacity-60"
            >
              {status === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Check <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </form>

      {status === "available" && (
        <div className="mt-5 space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-1.5 text-sm font-medium text-emerald-300">
            <Check className="h-4 w-4" /> Available
          </span>
          <p className="text-sm text-cream/50">
            <span className="font-semibold text-cream">@{normalized}</span> is available.
          </p>
          <button
            type="button"
            onClick={() => setStatus("collecting")}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-cream px-5 text-sm font-semibold text-background transition hover:bg-white"
          >
            <Sparkles className="h-4 w-4" /> Claim @{normalized}
          </button>
        </div>
      )}

      {status === "taken" && (
        <div className="mt-5 space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-3.5 py-1.5 text-sm font-medium text-red-300">
            <X className="h-4 w-4" /> Taken
          </span>
          <p className="text-sm text-cream/50">
            <span className="font-semibold text-cream">@{normalized}</span> is already taken. Try another.
          </p>
        </div>
      )}

      {status === "invalid" && handle && (
        <p className="mt-4 text-sm text-cream/60">Handles are 2–30 chars, letters/numbers/underscore only.</p>
      )}
    </div>
  );
};

export default HandleReserveForm;