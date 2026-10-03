import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  CreditCard,
  Code2,
  Copy,
} from "lucide-react";
import { Link, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import AppLogo from "@/components/AppLogo";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProductionBuySetup from "@/components/ProductionBuySetup";
import {
  buyStatus,
  idStatus,
  integrationPrompt,
  developerMessage,
  type DeveloperClient,
  type DeveloperBuyStatus,
} from "@/lib/developerExperience";
import "./developer-experience.css";

export type DeveloperMembership = {
  active: boolean;
  membership: { status: string; current_period_end: string } | null;
  owned_apps: { app_id: string; verification_level: string }[];
};
type OwnedApp = { app_id: string; name: string; logo_url?: string | null };
type Props = {
  signedIn: boolean;
  loading: boolean;
  membership: DeveloperMembership | null;
  clients: DeveloperClient[] | null;
  busy: boolean;
  error: string;
  onBilling: (action: "checkout" | "portal") => void;
  onRefresh: () => void;
  pilot?: ReactNode;
};

function Flow({ steps }: { steps: { title: string; detail?: string }[] }) {
  return (
    <ol className="dev-flow">
      {steps.map((step, i) => (
        <li key={`${i}-${step.title}`}>
          <span className="dev-flow-number">{i + 1}</span>
          <div>
            <strong>{step.title}</strong>
            {step.detail && <p>{step.detail}</p>}
          </div>
          {i < steps.length - 1 && (
            <ArrowRight className="dev-flow-arrow" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}
function Benefits({ items }: { items: string[] }) {
  return (
    <ul className="dev-benefits">
      {items.map((item) => (
        <li key={item}>
          <Check size={18} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function RocketIdSetup({
  app,
  client,
  onSaved,
}: {
  app: OwnedApp;
  client?: DeveloperClient;
  onSaved: (client: DeveloperClient) => void;
}) {
  const [name, setName] = useState(client?.name || app.name);
  const [callback, setCallback] = useState(client?.redirect_uris[0] || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await supabase.functions
      .invoke("rocket-connect-developer", {
        body: {
          action: "register_production_app",
          app_id: app.app_id,
          name,
          redirect_uri: callback,
        },
      })
      .catch(() => ({ data: null, error: new Error("unavailable") }));
    if (result.error || result.data?.error || !result.data?.app) {
      setError(developerMessage(result.data?.error || "unavailable"));
    } else
      onSaved({
        ...result.data.app,
        app_id: app.app_id,
        environment: "production",
      });
    setBusy(false);
  }
  return (
    <section id="configure-rocket-id" className="dev-setup">
      <p className="dev-eyebrow">ROCKET ID SETUP</p>
      <h3>Connect {app.name}</h3>
      <p>Use the exact HTTPS URL where your app handles Rocket sign-in.</p>
      <form onSubmit={register} className="dev-form">
        <label>
          App name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Sign-in callback URL
          <input
            required
            type="url"
            placeholder="https://your-app.com/auth/rocket/callback"
            value={callback}
            onChange={(event) => setCallback(event.target.value)}
          />
        </label>
        {client && (
          <p className="dev-small">
            Changing the callback ends existing Rocket authorizations for this
            app. Update your app integration to match.
          </p>
        )}
        <button className="dev-button" disabled={busy}>
          {busy
            ? "Saving…"
            : client
              ? "Save Rocket ID settings"
              : "Set up Rocket ID"}
        </button>
      </form>
      {error && (
        <p role="alert" className="dev-error">
          {error}
        </p>
      )}
      {client && (
        <details className="dev-details">
          <summary>Public integration details</summary>
          <p>Public client ID</p>
          <code>{client.client_id}</code>
          <p>Callback</p>
          <code>{client.redirect_uris[0]}</code>
        </details>
      )}
    </section>
  );
}

export default function DeveloperExperience({
  signedIn,
  loading,
  membership,
  clients,
  busy,
  error,
  onBilling,
  onRefresh,
  pilot,
}: Props) {
  const [params] = useSearchParams();
  const requested = params.get("app");
  const active = membership?.active === true;
  const [apps, setApps] = useState<OwnedApp[]>([]);
  const [appsError, setAppsError] = useState(false);
  const [appsLoading, setAppsLoading] = useState(false);
  const [selected, setSelected] = useState("");
  const [saved, setSaved] = useState<Record<string, DeveloperClient>>({});
  const [statuses, setStatuses] = useState<Record<string, DeveloperBuyStatus>>(
    {},
  );
  const [statusErrors, setStatusErrors] = useState<Record<string, boolean>>({});
  const [fee, setFee] = useState<number | null>(null);
  const [liveAvailable, setLiveAvailable] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setFee(null);
    setLiveAvailable(null);
    supabase.functions
      .invoke("rocket-buy", { body: { action: "configuration" } })
      .then(({ data, error }) => {
        if (
          !cancelled &&
          !error &&
          Number.isInteger(data?.platform_fee_bps) &&
          data.platform_fee_bps >= 0 &&
          data.platform_fee_bps <= 10000
        ) {
          setFee(data.platform_fee_bps);
          setLiveAvailable(data.live_checkout_enabled === true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setApps([]);
    setSaved({});
    setSelected("");
    setAppsError(false);
    if (!signedIn || !membership) return;
    const owners = new Set(membership.owned_apps.map((app) => app.app_id));
    if (!owners.size) return;
    setAppsLoading(true);
    supabase.functions
      .invoke("rocket-apps", { body: { action: "my_apps" } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !Array.isArray(data)) {
          setAppsError(true);
          return;
        }
        const byId = new Map<string, OwnedApp>();
        for (const item of data)
          if (owners.has(item.app_id) && item.owned)
            byId.set(item.app_id, {
              app_id: item.app_id,
              name: item.app?.name || "Your app",
              logo_url: item.app?.logo_url,
            });
        // Membership ownership is authoritative even when a public profile is unavailable.
        const rows = [...owners].map(
          (app_id) => byId.get(app_id) || { app_id, name: "Your app" },
        );
        setApps(rows);
        setSelected(
          owners.has(requested || "") ? requested! : rows[0]?.app_id || "",
        );
      })
      .catch(() => {
        if (!cancelled) setAppsError(true);
      })
      .finally(() => {
        if (!cancelled) setAppsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, membership, requested]);
  const allClients = [
    ...(clients || []).filter((client) => !saved[client.app_id]),
    ...Object.values(saved),
  ];
  // Fetch actual readiness from the existing owner-checked status API. Never
  // infer a live payment state from membership, price, or a Stripe account ID.
  useEffect(() => {
    let cancelled = false;
    setStatuses({});
    setStatusErrors({});
    if (!active) return;
    for (const app of apps) {
      const client =
        saved[app.app_id] ||
        clients?.find((entry) => entry.app_id === app.app_id);
      if (!client) continue;
      supabase.functions
        .invoke("rocket-buy-developer", {
          body: { action: "status", app_id: app.app_id },
        })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error || data?.error || !Array.isArray(data?.products))
            setStatusErrors((current) => ({ ...current, [app.app_id]: true }));
          else setStatuses((current) => ({ ...current, [app.app_id]: data }));
        })
        .catch(() => {
          if (!cancelled)
            setStatusErrors((current) => ({ ...current, [app.app_id]: true }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [active, apps, clients, saved]);
  const selectedApp = apps.find((app) => app.app_id === selected);
  const selectedClient = allClients.find(
    (client) => client.app_id === selected,
  );
  const prompt =
    active && selectedClient
      ? integrationPrompt(selectedClient, selected)
      : null;
  async function copyPrompt() {
    if (!prompt) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopyError(
        "Copy isn’t available in this browser. Select and copy the prompt below.",
      );
    }
  }
  function chooseApp(appId: string, target: string) {
    setSelected(appId);
    setCopied(false);
    requestAnimationFrame(() =>
      document
        .getElementById(target)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  const join = (label = "Join Rocket Developer") =>
    signedIn ? (
      <button
        className="dev-button"
        onClick={() => onBilling("checkout")}
        disabled={busy || !membership}
      >
        {busy ? "Opening checkout…" : label}
      </button>
    ) : (
      <Link className="dev-button" to="/login?next=%2Fdeveloper">
        {label}
      </Link>
    );
  return (
    <div className="dev-page">
      <SiteHeader />
      <main className="dev-content">
        <header className={`dev-hero ${active ? "dev-hero-member" : ""}`}>
          <p className="dev-eyebrow">
            ROCKET DEVELOPER{" "}
            {active && <span className="dev-active">Active</span>}
          </p>
          <h1>
            {active
              ? "Your next integration starts here."
              : "Monetize your app with Rocket."}
          </h1>
          <p className="dev-lead">
            {active
              ? "Identity and payments for the apps you own. Choose an app to get started."
              : "Add Rocket identity and payments to your app with one developer membership."}
          </p>
          <div className="dev-price">
            <strong>
              $99<span>/year</span>
            </strong>
            <div>
              Per developer account, not per app.
              <br />
              <span>
                $8.25/month billed annually. Covers eligible apps you own.
              </span>
            </div>
          </div>
          <div className="dev-actions">
            {active ? (
              <>
                <a className="dev-button" href="#your-developer-apps">
                  Choose an app <ArrowRight size={17} />
                </a>
                <button
                  className="dev-button dev-button-quiet"
                  disabled={busy}
                  onClick={() => onBilling("portal")}
                >
                  Manage membership
                </button>
              </>
            ) : (
              <>
                {join()}
                <Link className="dev-button dev-button-quiet" to="/your-apps">
                  View your apps <ArrowRight size={17} />
                </Link>
              </>
            )}
          </div>
          {membership?.membership?.status === "canceling" && (
            <p className="dev-small">
              Membership ends on{" "}
              {new Date(
                membership.membership.current_period_end,
              ).toLocaleDateString()}
              . Your tools remain available until then.
            </p>
          )}
          {error && (
            <p className="dev-error" role="alert">
              {error}{" "}
              <button onClick={onRefresh} className="dev-text-button">
                Try again
              </button>
            </p>
          )}
          {loading && (
            <div
              className="dev-loading rocket-skeleton-surface"
              role="status"
              aria-label="Loading membership and apps"
            >
              <div className="dev-skeleton-line" />
              <div className="dev-skeleton-app" />
              <div className="dev-skeleton-app" />
            </div>
          )}
        </header>

        {signedIn && membership && (
          <section id="your-developer-apps" className="dev-launchpad">
            <div className="dev-section-heading">
              <div>
                <p className="dev-eyebrow">YOUR APPS</p>
                <h2>
                  {active
                    ? "Build on what you’ve made."
                    : "Bring Rocket to your apps."}
                </h2>
              </div>
              <Link className="dev-text-link" to="/your-apps">
                View your apps <ArrowRight size={17} />
              </Link>
            </div>
            {appsLoading ? (
              <div
                className="dev-loading rocket-skeleton-surface"
                role="status"
                aria-label="Loading owned apps"
              >
                <div className="dev-skeleton-app" />
                <div className="dev-skeleton-app" />
              </div>
            ) : appsError ? (
              <p role="alert">
                Your apps couldn’t load.{" "}
                <button className="dev-text-button" onClick={onRefresh}>
                  Try again
                </button>
              </p>
            ) : !membership.owned_apps.length ? (
              <div className="dev-empty">
                <h3>
                  {active ? "Add your first app." : "Your app belongs here."}
                </h3>
                <p>
                  Submit or claim your app on Rocket. Submission is free, even
                  without a developer membership.
                </p>
                <Link className="dev-button dev-button-outline" to="/submit">
                  Submit an app <ArrowRight size={17} />
                </Link>
              </div>
            ) : (
              <div className="dev-apps">
                {apps.map((app) => {
                  const client = allClients.find(
                    (entry) => entry.app_id === app.app_id,
                  );
                  const state = statuses[app.app_id];
                  return (
                    <article className="dev-app" key={app.app_id}>
                      <div className="dev-app-title">
                        <AppLogo name={app.name} src={app.logo_url} />
                        <div>
                          <h3>{app.name}</h3>
                          <Link
                            className="dev-text-link"
                            to={`/apps/${app.app_id}`}
                          >
                            View app
                          </Link>
                        </div>
                      </div>
                      <dl>
                        <div>
                          <dt>Rocket ID</dt>
                          <dd>
                            {!active
                              ? "Rocket Developer required"
                              : clients === null && !saved[app.app_id]
                                ? "Checking setup…"
                                : idStatus(client)}
                          </dd>
                        </div>
                        <div>
                          <dt>Buy with Rocket</dt>
                          <dd>
                            {!active
                              ? "Rocket Developer required"
                              : client && !state && !statusErrors[app.app_id]
                                ? "Checking setup…"
                                : buyStatus(state, statusErrors[app.app_id])}
                          </dd>
                        </div>
                      </dl>
                      <div className="dev-app-actions">
                        {active ? (
                          <>
                            <button
                              className="dev-button dev-button-outline"
                              onClick={() =>
                                chooseApp(app.app_id, "developer-setup")
                              }
                            >
                              Configure Rocket ID
                            </button>
                            <button
                              className="dev-button dev-button-quiet"
                              onClick={() =>
                                chooseApp(
                                  app.app_id,
                                  "configure-buy-with-rocket",
                                )
                              }
                            >
                              Set up Buy with Rocket
                            </button>
                          </>
                        ) : (
                          join()
                        )}
                      </div>
                      {statusErrors[app.app_id] && (
                        <p className="dev-small">
                          We couldn’t verify payment readiness. Open setup to
                          try again.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {active && selectedApp && (
              <div id="developer-setup" className="dev-configuration">
                <label className="dev-app-picker">
                  Configure app
                  <select
                    value={selected}
                    onChange={(event) => {
                      setSelected(event.target.value);
                      setCopied(false);
                    }}
                  >
                    {apps.map((app) => (
                      <option key={app.app_id} value={app.app_id}>
                        {app.name}
                      </option>
                    ))}
                  </select>
                </label>
                {clients === null ? (
                  <p>
                    Saved integration settings are unavailable.{" "}
                    <button className="dev-text-button" onClick={onRefresh}>
                      Reload settings
                    </button>{" "}
                    before making changes.
                  </p>
                ) : (
                  <RocketIdSetup
                    key={`${selected}-${selectedClient?.client_id || "new"}`}
                    app={selectedApp}
                    client={selectedClient}
                    onSaved={(client) => {
                      setSaved((current) => ({
                        ...current,
                        [selected]: client,
                      }));
                      setCopied(false);
                    }}
                  />
                )}
                <div id="configure-buy-with-rocket">
                  {selectedClient ? (
                    <ProductionBuySetup
                      key={selected}
                      ownedApps={[{ app_id: selected, name: selectedApp.name }]}
                      onStatus={(state) =>
                        setStatuses((current) => ({
                          ...current,
                          [selected]: state,
                        }))
                      }
                    />
                  ) : (
                    <div className="dev-setup">
                      <h3>Set up Buy with Rocket</h3>
                      <p>
                        Connect Rocket ID above first, then connect Stripe and
                        create your access plan.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        <section
          className="dev-model"
          aria-label="How Rocket connects to your app"
        >
          <Flow
            steps={[
              { title: "Your app", detail: "The product you built." },
              { title: "Rocket ID", detail: "Users sign in with Rocket." },
              {
                title: "Buy with Rocket",
                detail: "Users buy access with Rocket.",
              },
              {
                title: "Your app",
                detail: "Checks identity + entitlement and grants access.",
              },
            ]}
          />
        </section>

        <section id="rocket-id" className="dev-product">
          <div>
            <p className="dev-eyebrow">
              <ShieldCheck size={18} /> ROCKET ID
            </p>
            <h2>One account for your app.</h2>
            <p className="dev-lead">
              Let Rocket users sign into your app without creating another
              account.
            </p>
            <Benefits
              items={[
                "Fast account creation",
                "Rocket user identity",
                "Secure OAuth/OIDC",
                "Works with Rocket entitlements",
                "Designed for independent apps",
              ]}
            />
            <details className="dev-details">
              <summary>Implementation details</summary>
              <p>
                Rocket ID uses OAuth authorization code flow with PKCE and
                signed OIDC identity tokens. Your app validates the callback and
                creates its own secure session. Public integration settings
                appear after you configure an owned app.
              </p>
            </details>
          </div>
          <div
            className="dev-demo"
            aria-label="Illustrative Rocket ID sign-in flow"
          >
            <p className="dev-small">THE SIGN-IN EXPERIENCE</p>
            <div className="dev-demo-button">
              <ShieldCheck size={20} /> Continue with Rocket
            </div>
            <span className="dev-down" aria-hidden="true">
              ↓
            </span>
            <div className="dev-consent">
              <strong>Approve access</strong>
              <p>Choose to share your Rocket identity with the app.</p>
            </div>
            <span className="dev-down" aria-hidden="true">
              ↓
            </span>
            <div className="dev-demo-result">
              <Check size={22} />
              <strong>Signed in. Ready to go.</strong>
            </div>
            <p className="dev-small">For apps that have connected Rocket ID.</p>
          </div>
        </section>

        <section id="buy-with-rocket" className="dev-product">
          <div>
            <p className="dev-eyebrow">
              <CreditCard size={18} /> BUY WITH ROCKET
            </p>
            <h2>Sell access to your app.</h2>
            <p className="dev-lead">
              Create a plan, connect Stripe, and let Rocket users buy access
              directly from your Rocket app page.
            </p>
            <Benefits
              items={[
                "Sell monthly or annual access",
                "Stripe-hosted payment flow",
                "Rocket records purchase entitlements",
                "Works with Rocket ID",
                "Buyers return through their Rocket Library",
                "You remain the connected Stripe merchant",
              ]}
            />
            <p className="dev-fee">
              {fee !== null
                ? `${fee / 100}% Rocket fee on Buy with Rocket sales.`
                : "Rocket’s current sales fee is confirmed in payment setup."}
              <span>Stripe processing fees apply separately.</span>
            </p>
            {liveAvailable === false && (
              <p className="dev-small">
                Live payments are not available yet. Membership does not bypass
                merchant approval or integration readiness.
              </p>
            )}
          </div>
          <div className="dev-demo" aria-label="Illustrative purchase flow">
            <p className="dev-small">EXAMPLE ONLY · NOT A LIVE OFFER</p>
            <div className="dev-example-plan">
              <span>Your app · Monthly access</span>
              <strong>
                $19<span>/month</span>
              </strong>
              <div className="dev-demo-button">Buy with Rocket</div>
            </div>
            <span className="dev-down" aria-hidden="true">
              ↓
            </span>
            <div className="dev-consent">
              <strong>Stripe Checkout</strong>
              <p>
                Secure hosted payment. Rocket records access after confirmation.
              </p>
            </div>
            <span className="dev-down" aria-hidden="true">
              ↓
            </span>
            <div className="dev-demo-result">
              <Check size={22} />
              <strong>You’re in.</strong>
            </div>
            <div className="dev-demo-open">
              Open App <ArrowRight size={16} />
            </div>
            <p className="dev-small">
              Your app verifies entitlement before granting paid access.
            </p>
          </div>
        </section>

        <section className="dev-together">
          <p className="dev-eyebrow">BETTER TOGETHER</p>
          <h2>Identity + payments, connected.</h2>
          <div className="dev-questions">
            <div>
              <span>Rocket ID answers</span>
              <h3>Who is this user?</h3>
            </div>
            <div>
              <span>Buy with Rocket answers</span>
              <h3>Do they have access?</h3>
            </div>
          </div>
          <p className="dev-lead">
            Your app authenticates the Rocket user and checks whether they have
            a valid entitlement. One connected experience, two clear checks.
          </p>
          <Flow
            steps={[
              { title: "Rocket user" },
              { title: "Rocket ID" },
              { title: "Your app", detail: "Checks entitlement." },
              { title: "Access granted" },
            ]}
          />
        </section>

        <section className="dev-steps">
          <p className="dev-eyebrow">THREE STEPS</p>
          <h2>From your app to Rocket.</h2>
          <div>
            {[
              {
                title: "Add your app",
                text: "Submit or claim your app on Rocket. Your listing stays free.",
              },
              {
                title: "Connect",
                text: "Configure Rocket ID and your Stripe merchant account. Create an access plan.",
              },
              {
                title: "Ship",
                text: "Add the integration, verify identity and entitlement checks, and complete readiness checks before going live.",
              },
            ].map((step, i) => (
              <article key={step.title}>
                <span className="dev-step-number">0{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="dev-coding">
          <Code2 size={28} aria-hidden="true" />
          <h2>Built for how apps are built now.</h2>
          <p className="dev-lead">
            Copy Rocket’s integration prompt into Codex, Claude Code, Cursor,
            Lovable, Replit or your coding agent and let it wire up the
            integration.
          </p>
          {prompt ? (
            <>
              <button
                className="dev-button dev-button-outline"
                onClick={copyPrompt}
              >
                <Copy size={17} />
                {copied ? "Prompt copied" : "Copy integration prompt"}
              </button>
              <p role="status" className="dev-small">
                {copied
                  ? `Copied public configuration for ${selectedApp?.name}.`
                  : `Ready for ${selectedApp?.name}. Public configuration only—no secrets.`}
              </p>
              {copyError && <p role="alert">{copyError}</p>}
              <details className="dev-details">
                <summary>Review integration prompt</summary>
                <pre>{prompt}</pre>
              </details>
            </>
          ) : (
            <p className="dev-small">
              {active
                ? "Choose an app and save its Rocket ID callback to generate your app-specific prompt."
                : "An app-specific prompt becomes available after you join and configure Rocket ID for an app you own."}
            </p>
          )}
        </section>

        <section className="dev-comparison">
          <p className="dev-eyebrow">ONE MEMBERSHIP. TWO PRODUCTS.</p>
          <h2>Participate for free. Integrate with Developer.</h2>
          <div className="dev-plan-pair">
            <article>
              <h3>Free</h3>
              <p>Build your place on Rocket.</p>
              <Benefits
                items={[
                  "Submit and claim apps",
                  "Build your app profile",
                  "Reviews and discovery",
                  "Verify traffic, revenue and usage",
                ]}
              />
              <Link className="dev-text-link" to="/submit">
                Submit your app <ArrowRight size={17} />
              </Link>
            </article>
            <article>
              <h3>
                Rocket Developer <span>$99/year</span>
              </h3>
              <p>Identity and payments for eligible apps you own.</p>
              <Benefits
                items={["Everything in Free", "Rocket ID", "Buy with Rocket"]}
              />
              <p className="dev-small">
                Per developer account, not per app. Verification, editorial
                decisions and rankings remain independent of membership.
              </p>
            </article>
          </div>
        </section>

        <section className="dev-final">
          <h2>
            {active
              ? "Keep building with Rocket."
              : "Start building with Rocket."}
          </h2>
          <p>
            {active
              ? "Your membership is ready. Connect your app when you are."
              : "One developer membership. Identity and payments. $99/year."}
          </p>
          {active ? (
            <a className="dev-button" href="#your-developer-apps">
              Choose an app <ArrowRight size={17} />
            </a>
          ) : (
            join()
          )}
        </section>
        {pilot && (
          <details className="dev-pilot">
            <summary>Developer testing · sandbox tools</summary>
            {pilot}
          </details>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
