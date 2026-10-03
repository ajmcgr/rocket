import {
  Loader2 as ControlLoader2,
  Copy as ControlCopy,
  Plus as ControlPlus,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "@/lib/router-compat";
import {
  Check,
  ChevronLeft,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
} from "@/components/EmojiIcons";
import { supabase as _supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import DeveloperExperience, {
  type DeveloperMembership,
} from "@/components/DeveloperExperience";
import type { DeveloperClient } from "@/lib/developerExperience";

const supabase = _supabase as any;
const connectUrl = "https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1";

type App = {
  client_id: string;
  name: string;
  icon_url: string | null;
  redirect_uris: string[];
  checkout_return_uris: string[];
  allowed_scopes: string[];
  is_active: boolean;
  created_at: string;
};
type Account = {
  stripe_account_id: string;
  status: "pending" | "active" | "disabled";
  charges_enabled: boolean;
  payouts_enabled: boolean;
  stripe_api_version?: "v1" | "v2";
} | null;
type Product = {
  id: string;
  product_key: string;
  name: string;
  amount_cents: number;
  currency: string;
  interval: string;
  platform_fee_bps: number;
  is_active: boolean;
  checkout_return_uris: string[];
  stripe_product_id: string;
  stripe_price_id: string;
};

function copy(value: string) {
  navigator.clipboard?.writeText(value);
}
function FunctionError({ error }: { error: any }) {
  return <p className="mt-3 text-sm text-red-600">{error}</p>;
}
function invitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let raw = "";
  bytes.forEach((byte) => {
    raw += String.fromCharCode(byte);
  });
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function call(action: string, body?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(
    "rocket-connect-developer",
    { body: { action, ...body } },
  );
  if (error)
    throw new Error((data as any)?.error || error.message || "Request failed");
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export function DeveloperActivate() {
  const [params] = useSearchParams(); const nav = useNavigate(); const { toast } = useToast();
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const token = params.get("token") || "";
  const accept = async () => {
    setBusy(true); setError("");
    try { await call("accept_invite", { token }); toast({ title: "Developer access activated" }); nav("/developer", { replace: true }); }
    catch (err: any) { setError(err.message || "This invitation is invalid or expired."); }
    finally { setBusy(false); }
  };
  if (!token) return <Navigate to="/developer" replace />;
  return <main className="mx-auto max-w-xl px-4 py-16"><section className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-xs"><ShieldCheck className="h-7 w-7 text-sky-600" /><h1 className="mt-4 text-2xl font-semibold">Activate Rocket Developer access</h1><p className="mt-2 text-sm leading-6 text-neutral-600">This invitation grants access only to the Rocket Connect test-developer portal. It does not change your Rocket product subscription or workspace access.</p><button onClick={accept} disabled={busy} className="mt-6 inline-flex h-10 items-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-60">{busy ? <ControlLoader2 className="h-4 w-4 animate-spin" /> : "Accept invitation"}</button><FunctionError error={error} /></section></main>;
}

function IntegrationKit({ app, product }: { app: App; product?: Product }) {
  const callback = app.redirect_uris[0]; const returnUri = app.checkout_return_uris[0];
  const code = useMemo(() => `// Generate state, nonce, and a 43–128 character PKCE verifier server-side.\nconst authorize = new URL("https://tryrocket.ai/connect/authorize");\nauthorize.search = new URLSearchParams({\n  response_type: "code",\n  client_id: "${app.client_id}",\n  redirect_uri: "${callback}",\n  scope: "openid profile email entitlements:read",\n  state, nonce, code_challenge, code_challenge_method: "S256"\n});\nres.redirect(authorize.toString());\n\n// On ${callback}, validate state then exchange the code server-side.\nconst tokens = await fetch("${connectUrl}/rocket-connect-token", {\n  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },\n  body: new URLSearchParams({ grant_type: "authorization_code", client_id: "${app.client_id}", code, redirect_uri: "${callback}", code_verifier })\n});\n// Validate the ES256 id_token against /rocket-connect-jwks; check iss, aud, exp, nonce and sub.\n\n// Only after an app session exists, create checkout using its Rocket access token.\nconst checkout = await fetch("${connectUrl}/connect-payment-checkout", {\n  method: "POST", headers: { Authorization: \`Bearer \${accessToken}\`, "Content-Type": "application/json" },\n  body: JSON.stringify({ product_key: "${product?.product_key || "YOUR_PRODUCT_KEY"}", return_uri: "${returnUri}" })\n});\n// Redirect to checkout_url. Do not grant access from the return URL.\n\nconst entitlement = await fetch("${connectUrl}/connect-entitlements?product_key=${product?.product_key || "YOUR_PRODUCT_KEY"}", {\n  headers: { Authorization: \`Bearer \${accessToken}\` }\n});\n// Grant access only if entitlements[0].active is true. A revoked authorization returns 401.` , [app, callback, product, returnUri]);
  return <section className="rounded-2xl border border-neutral-200 bg-white p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold">Integration kit</h2><p className="mt-1 text-sm text-neutral-600">Reference implementation for the actual Rocket Connect test endpoints.</p></div><button onClick={() => copy(code)} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"><ControlCopy className="h-3.5 w-3.5" /> Copy example</button></div><ol className="mt-5 space-y-2 text-sm text-neutral-700"><li>1. Generate and retain <code>state</code>, <code>nonce</code>, and an S256 PKCE verifier in your own server session.</li><li>2. Redirect to Continue with Rocket using this client ID and exact callback.</li><li>3. Validate the callback state; exchange the code only on your server and validate the signed ID token.</li><li>4. Store the Rocket <code>sub</code> against your own app session—not the browser’s URL parameters.</li><li>5. Start checkout with the Rocket access token, then ask the entitlement endpoint for authoritative access.</li><li>6. A cancelled, refunded, expired, disputed, or revoked authorization must not grant access. Reauthenticate after revocation.</li></ol><pre className="mt-5 overflow-x-auto rounded-xl bg-neutral-950 p-4 text-xs leading-5 text-neutral-100"><code>{code}</code></pre></section>;
}

export default function Developer() {
  const { user } = useAuth();
  // Account changes remount all private state; an old request cannot paint
  // the previous owner's launchpad into a different user's session.
  return <DeveloperSession key={user?.id || "public"} />;
}

function DeveloperSession() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [membership, setMembership] = useState<DeveloperMembership | null>(
    null,
  );
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [data, setData] = useState<{
    developer: boolean;
    operator: boolean;
    apps: App[];
    production_apps?: DeveloperClient[];
  } | null>(null);
  const [error, setError] = useState("");
  const [appName, setAppName] = useState("");
  const [redirectUri, setRedirectUri] = useState(
    "http://127.0.0.1:3002/callback",
  );
  const [returnUri, setReturnUri] = useState("http://127.0.0.1:3002/");
  const [iconUrl, setIconUrl] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState("");
  const inviteTokenRef = useRef<string | null>(null);
  const load = async () => {
    try {
      setError("");
      const next = await supabase.functions.invoke("rocket-connect-developer", {
        method: "GET",
        body: undefined,
      });
      if (next.error) throw next.error;
      setData(next.data);
    } catch (err: any) {
      setError("Saved developer settings are temporarily unavailable.");
    }
  };
  const loadMembership = async () => {
    const result = await supabase.functions.invoke(
      "rocket-developer-membership",
      { method: "GET" },
    );
    if (result.error) throw result.error;
    setMembership(result.data);
  };
  useEffect(() => {
    if (user) {
      load();
      loadMembership().catch(() =>
        setBillingError("Membership status is temporarily unavailable."),
      );
    }
  }, [user]);
  const openBilling = async (action: "checkout" | "portal") => {
    setBillingBusy(true);
    setBillingError("");
    try {
      const result =
        action === "checkout"
          ? await supabase.functions.invoke("stripe-checkout", {
              body: { product: "rocket_developer" },
            })
          : await supabase.functions.invoke("stripe-portal", {
              body: { context: "rocket_developer" },
            });
      if (result.error || !result.data?.url)
        throw new Error(
          result.data?.error ||
            result.error?.message ||
            "Billing is unavailable",
        );
      window.location.assign(result.data.url);
    } catch (err: any) {
      setBillingError(err.message || "Billing is unavailable");
      setBillingBusy(false);
    }
  };
  const createApp = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("app");
    try {
      const result = await call("create_app", {
        name: appName,
        icon_url: iconUrl,
        redirect_uri: redirectUri,
        checkout_return_uri: returnUri,
      });
      toast({ title: "Test app registered" });
      setAppName("");
      setIconUrl("");
      setData((current) =>
        current ? { ...current, apps: [result.app, ...current.apps] } : current,
      );
    } catch (err: any) {
      toast({
        title: "Couldn’t create app",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    if (inviteTokenRef.current) return;
    const token = invitationToken();
    inviteTokenRef.current = token;
    setBusy("invite");
    try {
      const result = await call("invite", { email: inviteEmail, token });
      setInviteUrl(result.invitation_url);
      toast({ title: "Developer invitation created" });
    } catch (err: any) {
      toast({
        title: "Couldn’t create invitation",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      inviteTokenRef.current = null;
      setBusy("");
    }
  };
  const pilot =
    data?.developer || data?.operator ? (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-sky-600">
              Rocket Connect · Test mode
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">
              Developer pilot
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Register a single-purpose test app, connect a Stripe test account,
              and integrate Continue with Rocket.
            </p>
          </div>
          {data.developer && (
            <a
              href="#create-app"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white"
            >
              <ControlPlus className="h-4 w-4" /> Create app
            </a>
          )}
        </div>
        {error && <FunctionError error={error} />}
        {data.operator && (
          <section className="mt-8 rounded-2xl border border-sky-100 bg-sky-50 p-5">
            <h2 className="text-sm font-semibold text-sky-950">
              Invite a test developer
            </h2>
            <p className="mt-1 text-sm text-sky-800">
              This is the only operator action required. The developer accepts
              the link with their own Rocket account.
            </p>
            <form onSubmit={invite} className="mt-4 flex max-w-xl gap-2">
              <input
                required
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="developer@example.com"
                className="h-10 min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-3 text-sm"
              />
              <button
                disabled={busy === "invite"}
                className="h-10 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy === "invite" ? "Creating…" : "Create invite"}
              </button>
            </form>
            {inviteUrl && (
              <div className="mt-3 rounded-lg border border-sky-200 bg-white p-3 text-xs text-sky-950 break-all">
                <span className="font-medium">Share once: </span>
                {inviteUrl}{" "}
                <button
                  type="button"
                  onClick={() => copy(inviteUrl)}
                  className="ml-2 underline"
                >
                  Copy
                </button>
              </div>
            )}
          </section>
        )}
        {data.developer && (
          <>
            <section className="mt-8">
              <h2 className="text-lg font-semibold">My apps</h2>
              {data.apps.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-neutral-200 p-5 text-sm text-neutral-500">
                  No apps yet. Create a test app with exact callback and
                  checkout return URIs.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {data.apps.map((app) => (
                    <Link
                      key={app.client_id}
                      to={`/developer/apps/${app.client_id}`}
                      className="rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        {app.icon_url ? (
                          <img
                            src={app.icon_url}
                            alt=""
                            className="h-9 w-9 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="grid h-9 w-9 place-items-center rounded-lg bg-neutral-100 text-xs font-semibold">
                            {app.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{app.name}</p>
                          <p className="text-xs text-neutral-500">
                            {app.is_active ? "Active" : "Disabled"} · test
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 break-all font-mono text-xs text-neutral-500">
                        {app.client_id}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <section
              id="create-app"
              className="mt-10 rounded-2xl border border-neutral-200 bg-white p-6"
            >
              <h2 className="text-lg font-semibold">Create app</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Callbacks must match exactly. Wildcards and browser-provided
                payment values are not accepted.
              </p>
              <form
                onSubmit={createApp}
                className="mt-5 grid gap-4 md:grid-cols-2"
              >
                <label className="text-sm font-medium">
                  App name
                  <input
                    required
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    maxLength={120}
                    className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal"
                  />
                </label>
                <label className="text-sm font-medium">
                  Icon URL{" "}
                  <span className="font-normal text-neutral-400">
                    optional HTTPS
                  </span>
                  <input
                    value={iconUrl}
                    onChange={(e) => setIconUrl(e.target.value)}
                    type="url"
                    className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal"
                  />
                </label>
                <label className="text-sm font-medium md:col-span-2">
                  OAuth callback URI
                  <input
                    required
                    value={redirectUri}
                    onChange={(e) => setRedirectUri(e.target.value)}
                    type="url"
                    className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal"
                  />
                </label>
                <label className="text-sm font-medium md:col-span-2">
                  Checkout return URI
                  <input
                    required
                    value={returnUri}
                    onChange={(e) => setReturnUri(e.target.value)}
                    type="url"
                    className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal"
                  />
                </label>
                <button
                  disabled={busy === "app"}
                  className="inline-flex h-10 w-fit items-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy === "app" ? "Creating…" : "Register test app"}
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    ) : null;
  return (
    <DeveloperExperience
      signedIn={!!user}
      loading={authLoading || (!!user && !membership && !billingError)}
      membership={membership}
      clients={data?.production_apps || null}
      busy={billingBusy}
      error={billingError || error}
      onBilling={openBilling}
      onRefresh={() => {
        load();
        loadMembership().catch(() =>
          setBillingError("Membership status is temporarily unavailable."),
        );
      }}
      pilot={pilot}
    />
  );
}

export function DeveloperAppDetail() {
  const { clientId } = useParams(); const [details, setDetails] = useState<{ app: App; stripe_account: Account; products: Product[] } | null>(null); const { toast } = useToast(); const [busy, setBusy] = useState(""); const [productName, setProductName] = useState("Test monthly access"); const [amount, setAmount] = useState("10.00"); const [error, setError] = useState(""); const [editing, setEditing] = useState(false); const [settingsName, setSettingsName] = useState(""); const [settingsIcon, setSettingsIcon] = useState(""); const [settingsRedirect, setSettingsRedirect] = useState(""); const [settingsReturn, setSettingsReturn] = useState(""); const [onboardingCountry, setOnboardingCountry] = useState("");
  const load = async () => { if (!clientId) return; try { setError(""); setBusy("load"); const next = await call("app_detail", { client_id: clientId }); setDetails(next); setSettingsName(next.app.name); setSettingsIcon(next.app.icon_url || ""); setSettingsRedirect(next.app.redirect_uris[0] || ""); setSettingsReturn(next.app.checkout_return_uris[0] || ""); } catch (err: any) { setError(err.message || "Couldn’t load app"); } finally { setBusy(""); } };
  useEffect(() => { load(); }, [clientId]);
  const createProduct = async (event: FormEvent) => { event.preventDefault(); setBusy("product"); try { const cents = Math.round(Number(amount) * 100); const result = await call("create_product", { client_id: clientId, name: productName, amount_cents: cents, checkout_return_uri: details?.app.checkout_return_uris[0] }); setDetails((current) => current ? { ...current, products: [result.product, ...current.products] } : current); toast({ title: "Test subscription product created" }); } catch (err: any) { toast({ title: "Couldn’t create product", description: err.message, variant: "destructive" }); } finally { setBusy(""); } };
  const startOnboarding = async () => { if (!isV2Account && !/^[A-Z]{2}$/.test(onboardingCountry)) { toast({ title: "Choose your business country", description: "Stripe requires it before creating a merchant account.", variant: "destructive" }); return; } setBusy("onboarding"); try { const result = await call("stripe_onboarding", { client_id: clientId, country: onboardingCountry }); window.location.assign(result.onboarding_url); } catch (err: any) { toast({ title: "Couldn’t start Stripe onboarding", description: err.message, variant: "destructive" }); setBusy(""); } };
  const saveSettings = async (event: FormEvent) => { event.preventDefault(); setBusy("settings"); try { const result = await call("update_app", { client_id: clientId, name: settingsName, icon_url: settingsIcon, redirect_uri: settingsRedirect, checkout_return_uri: settingsReturn }); setDetails((current) => current ? { ...current, app: result.app } : current); setEditing(false); toast({ title: "App settings saved", description: "New authorization requests now require the updated exact callback URI." }); } catch (err: any) { toast({ title: "Couldn’t save app settings", description: err.message, variant: "destructive" }); } finally { setBusy(""); } };
  const setAppStatus = async (isActive: boolean) => { if (!isActive && !window.confirm("Disable this app? Existing Rocket Connect tokens and unused codes for this app will stop working immediately.")) return; setBusy("status"); try { const result = await call("set_app_status", { client_id: clientId, is_active: isActive }); setDetails((current) => current ? { ...current, app: result.app } : current); toast({ title: isActive ? "App enabled" : "App disabled", description: isActive ? "New authorization requests are allowed again." : "Existing Rocket Connect access was revoked." }); } catch (err: any) { toast({ title: "Couldn’t update app status", description: err.message, variant: "destructive" }); } finally { setBusy(""); } };
  if (!details && busy === "load") return <main className="rocket-skeleton-surface min-h-screen p-8" role="status" aria-label="Loading app settings" aria-busy="true"><div className="mx-auto max-w-5xl animate-pulse space-y-6"><div className="h-8 w-48 rounded bg-neutral-100" /><div className="h-48 rounded-2xl bg-neutral-100" /></div></main>;
  if (!details) return <main className="mx-auto max-w-3xl px-4 py-12"><Link to="/developer" className="text-sm text-neutral-600">← Developer</Link><FunctionError error={error || "App not found"} /></main>;
  const isV2Account = details.stripe_account?.stripe_api_version === "v2";
  const accountReady = Boolean(isV2Account && details.stripe_account?.status === "active" && details.stripe_account?.charges_enabled && details.stripe_account?.payouts_enabled);
  return <main className="mx-auto max-w-4xl px-4 py-10"><Link to="/developer" className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"><ChevronLeft className="h-4 w-4" /> My apps</Link><div className="mt-5 flex items-center gap-3">{details.app.icon_url ? <img src={details.app.icon_url} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-xl bg-neutral-100 font-semibold">{details.app.name.slice(0, 2).toUpperCase()}</div>}<div><p className="text-sm font-medium text-sky-600">Test app · {details.app.is_active ? "Active" : "Disabled"}</p><h1 className="text-2xl font-semibold">{details.app.name}</h1></div></div><section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-base font-semibold">App configuration</h2><p className="mt-1 text-sm text-neutral-600">Callback and return URIs must match exactly.</p></div><div className="flex gap-2"><button onClick={() => setEditing((value) => !value)} disabled={!!busy} className="h-10 rounded-lg border border-neutral-200 px-3 text-sm font-medium disabled:opacity-60">{editing ? "Cancel" : "Edit settings"}</button><button onClick={() => setAppStatus(!details.app.is_active)} disabled={!!busy} className="h-10 rounded-lg border border-neutral-200 px-3 text-sm font-medium disabled:opacity-60">{details.app.is_active ? "Disable app" : "Enable app"}</button></div></div><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-neutral-500">Client ID</dt><dd className="mt-1 flex items-center gap-2 font-mono text-xs break-all">{details.app.client_id}<button onClick={() => { copy(details.app.client_id); toast({ title: "Client ID copied" }); }} aria-label="Copy client ID"><ControlCopy className="h-3.5 w-3.5" /></button></dd></div><div><dt className="text-neutral-500">Allowed scopes</dt><dd className="mt-1 text-xs">{details.app.allowed_scopes.join(", ")}</dd></div></dl>{editing ? <form onSubmit={saveSettings} className="mt-5 grid gap-4 border-t border-neutral-100 pt-5 md:grid-cols-2"><label className="text-sm font-medium">App name<input required value={settingsName} onChange={(e) => setSettingsName(e.target.value)} maxLength={120} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label><label className="text-sm font-medium">Icon URL <span className="font-normal text-neutral-400">optional HTTPS</span><input value={settingsIcon} onChange={(e) => setSettingsIcon(e.target.value)} type="url" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label><label className="text-sm font-medium md:col-span-2">OAuth callback URI<input required value={settingsRedirect} onChange={(e) => setSettingsRedirect(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label><label className="text-sm font-medium md:col-span-2">Checkout return URI<input required value={settingsReturn} onChange={(e) => setSettingsReturn(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label><button disabled={!!busy} className="h-10 w-fit rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-60">{busy === "settings" ? "Saving…" : "Save settings"}</button></form> : <dl className="mt-4 space-y-3 border-t border-neutral-100 pt-4 text-sm"><div><dt className="text-neutral-500">OAuth callback</dt><dd className="mt-1 break-all font-mono text-xs">{details.app.redirect_uris[0]}</dd></div><div><dt className="text-neutral-500">Checkout return</dt><dd className="mt-1 break-all font-mono text-xs">{details.app.checkout_return_uris[0]}</dd></div></dl>}</section><section className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-6" aria-live="polite"><h2 className="text-base font-semibold text-sky-950">Stripe Connect test onboarding</h2><p className="mt-1 text-sm leading-6 text-sky-900">Create a fresh Accounts v2 merchant account. Stripe hosts identity verification, card-payment and payout setup. Stripe collects processing fees and is the losses collector.</p>{!isV2Account && <label className="mt-4 block max-w-xs text-sm font-medium text-sky-950">Business country <select value={onboardingCountry} onChange={(event) => setOnboardingCountry(event.target.value)} disabled={!!busy} className="mt-1 h-10 w-full rounded-lg border border-sky-200 bg-white px-3 text-sm font-normal text-neutral-900"><option value="">Choose country</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="AU">Australia</option><option value="CA">Canada</option><option value="TH">Thailand</option></select><span className="mt-1 block text-xs font-normal text-sky-800">Sent to Stripe only to create your test merchant account.</span></label>}{details.stripe_account ? <div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-sm text-sky-900">Current account: <span className="font-medium">{accountReady ? "Ready for card payments and payouts" : isV2Account ? "Onboarding incomplete" : "Historical account retained"}</span>{isV2Account ? " · Accounts v2" : " · historical account"}</p><button onClick={startOnboarding} disabled={!!busy || accountReady} className="h-10 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white disabled:opacity-60">{busy === "onboarding" ? "Opening Stripe…" : accountReady ? "Onboarding complete" : isV2Account ? "Continue Stripe onboarding" : "Start Accounts v2 onboarding"}</button></div> : <button onClick={startOnboarding} disabled={!!busy} className="mt-4 h-10 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white disabled:opacity-60">{busy === "onboarding" ? "Opening Stripe…" : "Start Stripe onboarding"}</button>}</section><section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6"><h2 className="text-base font-semibold">Test subscription products</h2><p className="mt-1 text-sm text-neutral-600">Products are created only after the current Accounts v2 merchant account is ready.</p>{details.products.length > 0 && <div className="mt-4 divide-y divide-neutral-100 rounded-xl border border-neutral-200">{details.products.map((product) => <div key={product.id} className="p-4 text-sm"><p className="font-medium">{product.name} · ${(product.amount_cents / 100).toFixed(2)}/month</p><p className="mt-1 font-mono text-xs text-neutral-500">{product.product_key}</p></div>)}</div>}<form onSubmit={createProduct} className="mt-5 flex flex-wrap gap-3"><input disabled={!accountReady} value={productName} onChange={(e) => setProductName(e.target.value)} maxLength={120} className="h-10 min-w-56 flex-1 rounded-lg border border-neutral-200 px-3 text-sm disabled:bg-neutral-50" /><label className="flex h-10 items-center rounded-lg border border-neutral-200 px-3 text-sm"><span className="mr-1 text-neutral-400">$</span><input disabled={!accountReady} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-20 outline-hidden disabled:bg-neutral-50" /></label><button disabled={!accountReady || !!busy} className="h-10 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50">{busy === "product" ? "Creating…" : "Create product"}</button></form></section><div className="mt-6"><IntegrationKit app={details.app} product={details.products[0]} /></div></main>;
}
