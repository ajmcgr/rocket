import { Loader2 as ControlLoader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useSearchParams } from "@/lib/router-compat";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics";
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
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-base font-semibold">Integrations</h2>
      <p className="mt-1 text-sm text-neutral-600">Connect Rocket to the tools you already use.</p>

      <AppIntegrationLinks />
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
      <p className="mt-1 text-sm text-neutral-600">Permanently delete your Rocket account. This cannot be undone.</p>
      <button onClick={deleteAccount} disabled={loading === "delete"} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
        {loading === "delete" ? <ControlLoader2 className="h-4 w-4 animate-spin" /> : "Delete account"}
      </button>
    </section>
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-base font-semibold">Product tour</h2>
      <p className="mt-1 text-sm text-neutral-600">Replay the guide to discovering apps and submitting or claiming your own.</p>
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
    toast({ title: "Returned from checkout", description: "We're confirming your payment. Your plan or credits will appear once confirmed." });
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
          My Purchases
        </NavLink>.
      </p>
    </section>
  );
};

export default SettingsLayout;
