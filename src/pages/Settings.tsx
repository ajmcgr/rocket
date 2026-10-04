import { Loader2 as ControlLoader2, Unplug as ControlUnplug, Plug as ControlPlug } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useSearchParams } from "@/lib/router-compat";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics";
import { Check, Plug, Cloud, Unplug } from "@/components/EmojiIcons";
import MemberProfileSettings from "@/components/MemberProfileSettings";
import AppIntegrationLinks from "@/components/AppIntegrationLinks";

const supabase = _sb as any;

const TABS = [
  { to: "/settings/profile", label: "Profile" },
  { to: "/settings/team", label: "Team" },
  { to: "/settings/integrations", label: "Integrations" },
  { to: "/settings/notifications", label: "Notifications" },
  { to: "/settings/account", label: "Account" },
  { to: "/settings/billing", label: "Billing" },
  { to: "/settings/developer", label: "Developer" },
];

export const SettingsLayout = () => {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-8 flex flex-wrap gap-1 rounded-xl border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-900">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                isActive ? "bg-neutral-900 text-white dark:bg-neutral-700" : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  );
};

export const ProfileSettings = MemberProfileSettings;

export const IntegrationsSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drive, setDrive] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadDrive = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_integrations")
      .select("id, account_email, created_at")
      .eq("user_id", user.id)
      .eq("provider", "google_drive")
      .maybeSingle();
    setDrive(data || null);
  };
  useEffect(() => { loadDrive(); }, [user]);

  // Reload when the OAuth popup posts back
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e?.data?.type === "drive-oauth") {
        setBusy(null);
        loadDrive();
        if (e.data.ok) toast({ title: "Google Drive connected" });
      }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);

  const connectDrive = async () => {
    setBusy("drive");
    const { data, error } = await supabase.functions.invoke("drive-oauth-start", { body: {} });
    if (error || !data?.url) {
      setBusy(null);
      const msg = (data as any)?.error === "google_oauth_not_configured"
        ? "Google OAuth isn't configured yet. Add GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URL secrets."
        : (error?.message || "Could not start Google OAuth.");
      toast({ title: "Connect failed", description: msg, variant: "destructive" });
      return;
    }
    window.open(data.url, "drive-oauth", "width=520,height=640");
  };

  const disconnectDrive = async () => {
    if (!drive) return;
    setBusy("disconnect");
    await supabase.from("user_integrations").delete().eq("id", drive.id);
    setBusy(null);
    setDrive(null);
    toast({ title: "Google Drive disconnected" });
  };

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-base font-semibold">Integrations</h2>
      <p className="mt-1 text-sm text-neutral-600">Connect Rocket to the tools you already use.</p>

      <AppIntegrationLinks />

      <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Cloud className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
              Google Drive
              {drive && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"><Check className="h-3 w-3" /> Connected</span>}
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {drive ? <>Signed in as <span className="font-mono">{drive.account_email || "(unknown)"}</span></> : "Upload generated assets directly to your Drive."}
            </p>
          </div>
        </div>
        {drive ? (
          <button onClick={disconnectDrive} disabled={busy === "disconnect"} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
            {busy === "disconnect" ? <ControlLoader2 className="h-3.5 w-3.5 animate-spin" /> : <ControlUnplug className="h-3.5 w-3.5" />} Disconnect
          </button>
        ) : (
          <button onClick={connectDrive} disabled={busy === "drive"} className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {busy === "drive" ? <ControlLoader2 className="h-3.5 w-3.5 animate-spin" /> : <ControlPlug className="h-3.5 w-3.5" />} Connect
          </button>
        )}
      </div>

    </section>
  );
};

export const NotificationsSettings = () => {
  const [emailsEnabled, setEmailsEnabled] = useState<boolean>(() => localStorage.getItem("notif_emails") !== "0");
  const toggleEmails = (v: boolean) => {
    setEmailsEnabled(v);
    localStorage.setItem("notif_emails", v ? "1" : "0");
  };
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-base font-semibold">Notifications</h2>
      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">Your in-app inbox includes app submissions, ownership and verification, analytics connections, Rocket ID, Buy with Rocket, and billing updates alongside your Create activity.</p>
      <a href="/notifications" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">View notifications →</a>
      <label className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm text-neutral-700">Product & launch emails</span>
        <button
          onClick={() => toggleEmails(!emailsEnabled)}
          className={`relative h-6 w-11 rounded-full transition ${emailsEnabled ? "bg-brand" : "bg-neutral-300"}`}
          aria-pressed={emailsEnabled}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${emailsEnabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </label>
    </section>
  );
};

export const AccountSettings = () => {
  const { toast } = useToast();
  const nav = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);

  const deleteAccount = async () => {
    if (!confirm("Permanently delete your account? This cannot be undone.")) return;
    setLoading("delete");
    try {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      await supabase.auth.signOut();
      nav("/");
    } catch (e: any) {
      toast({ title: "Couldn't delete", description: e.message + " — contact support@tryrocket.ai", variant: "destructive" });
    } finally { setLoading(null); }
  };

  return (
    <div className="space-y-6">
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-base font-semibold">Trash</h2>
      <p className="mt-1 text-sm text-neutral-600">Recently deleted projects and designs live here for 30 days.</p>
      <button onClick={() => nav("/trash")} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50">Open Trash</button>
    </section>
    <section className="rounded-2xl border border-red-200 bg-white p-6">
      <h2 className="text-base font-semibold text-red-700">Delete account</h2>
      <p className="mt-1 text-sm text-neutral-600">Permanently delete your account and all data. This cannot be undone.</p>
      <button onClick={deleteAccount} disabled={loading === "delete"} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
        {loading === "delete" ? <ControlLoader2 className="h-4 w-4 animate-spin" /> : "Delete account"}
      </button>
    </section>
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-base font-semibold">Product tour</h2>
      <p className="mt-1 text-sm text-neutral-600">Replay the guided walkthrough of Home, Wizard, Logo Designer, Templates, Saved, Editor, and Brand Kit.</p>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("rocket:start-tour"))}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50"
      >
        Replay tour
      </button>
    </section>
    </div>
  );
};

export const BillingSettings = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;
    let source = "unknown";
    try {
      source = window.sessionStorage.getItem("rocket:checkout_source") || source;
      window.sessionStorage.removeItem("rocket:checkout_source");
    } catch { /* completion telemetry must never affect billing */ }
    track("checkout_completed", { source });
    toast({ title: "Checkout complete", description: "Your subscription or credits are being added now." });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Manage your billing</h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Manage your Rocket subscriptions through Stripe. View invoices, update payment methods
        and manage cancellations securely there.
      </p>
      <a
        href="https://billing.stripe.com/p/login/14A7sM4NF0GRd7l9UX7Zu00"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-hover"
      >
        Manage billing in Stripe
      </a>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Use the email address you used at checkout. Stripe will email you a secure sign-in link.
      </p>
      <p className="mt-6 border-t border-neutral-200 pt-4 text-sm text-neutral-600">
        For your Rocket Developer membership status and its dedicated billing controls,{" "}
        <NavLink to="/settings/developer" className="font-medium text-brand hover:underline">
          view Developer membership
        </NavLink>.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Subscriptions to third-party apps purchased with Buy with Rocket are separate from Rocket plans.
        Manage those in{" "}
        <NavLink to="/library" className="font-medium text-brand hover:underline">
          Your Subscriptions
        </NavLink>.
      </p>
    </section>
  );
};

export default SettingsLayout;
