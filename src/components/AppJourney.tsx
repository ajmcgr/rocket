import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import IntegrationLogo from "@/components/IntegrationLogo";
import { supabase } from "@/integrations/supabase/client";

const integrations = [
  {
    name: "Google Analytics",
    icon: "google-analytics",
    endpoint: "rocket-ga4",
    page: "analytics",
    description: "Verify your app’s traffic.",
  },
  {
    name: "PostHog",
    icon: "posthog",
    endpoint: "rocket-posthog",
    page: "analytics",
    description: "Verify your app’s traffic.",
  },
  {
    name: "Stripe",
    icon: "stripe",
    endpoint: "rocket-stripe-revenue",
    page: "revenue",
    description: "Verify revenue. Payment setup is separate.",
  },
  {
    name: "RevenueCat",
    icon: "revenuecat",
    endpoint: "rocket-revenuecat",
    page: "revenue",
    description: "Verify revenue from your chosen provider.",
    needsSource: true,
  },
  {
    name: "Polar",
    icon: "polar",
    endpoint: "rocket-alternative-revenue",
    provider: "polar",
    page: "revenue",
    description: "Verify revenue from your chosen provider.",
    needsSource: true,
  },
  {
    name: "Dodo Payments",
    icon: "dodopayments",
    endpoint: "rocket-alternative-revenue",
    provider: "dodo",
    page: "revenue",
    description: "Verify revenue from your chosen provider.",
    needsSource: true,
  },
] as const;
type ConnectionState =
  "connected" | "setup" | "attention" | "disconnected" | "unavailable";
type StatusResponse = {
  connection?: { status: string } | null;
  source?: object | null;
  error?: string;
};

function IntegrationCards({ appId }: { appId: string }) {
  const [statuses, setStatuses] = useState<
    Partial<Record<string, ConnectionState>>
  >({});
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const refresh = () => {
      const currentRevision = ++revision;
      for (const integration of integrations) {
        void (async () => {
          let state: ConnectionState;
          try {
            const { data, error } = await supabase.functions.invoke(
              integration.endpoint,
              {
                body: {
                  action: "status",
                  app_id: appId,
                  ...("provider" in integration
                    ? { provider: integration.provider }
                    : {}),
                },
              },
            );
            const status = data as StatusResponse | null;
            if (error || !status || status.error || !("connection" in status))
              throw new Error("Status unavailable");
            const connection = status.connection;
            state =
              !connection || connection.status === "disconnected"
                ? "disconnected"
                : connection.status === "error"
                  ? "attention"
                  : connection.status === "select_property" ||
                      ("needsSource" in integration && !status.source)
                    ? "setup"
                    : connection.status === "active"
                      ? "connected"
                      : "attention";
          } catch {
            state = "unavailable";
          }
          if (alive && currentRevision === revision)
            setStatuses((current) => ({
              ...current,
              [integration.icon]: state,
            }));
        })();
      }
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("rocket-provider-selection-updated", refresh);
    return () => {
      alive = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("rocket-provider-selection-updated", refresh);
    };
  }, [appId]);
  return (
    <div
      className="mt-5 grid grid-cols-1 gap-3"
      aria-label="Connect analytics and revenue"
    >
      {integrations.map((integration) => {
        const state = statuses[integration.icon];
        const badge =
          state === "connected"
            ? "Connected"
            : state === "setup"
              ? "Finish setup"
              : state === "attention"
                ? "Needs attention"
                : null;
        return (
          <Link
            key={integration.icon}
            to={`/my-apps/${appId}/${integration.page}`}
            className="group flex min-h-24 items-center gap-4 rounded-xl border border-neutral-200 p-5 transition hover:border-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            <IntegrationLogo provider={integration.icon} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold text-sky-800">
                  {state === "disconnected" ? "Connect " : ""}
                  {integration.name}
                </span>
                {badge && (
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${state === "connected" ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}
                  >
                    {badge}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-sm text-neutral-600">
                {!state
                  ? "Checking connection…"
                  : state === "unavailable"
                    ? "Status unavailable. Open settings to check."
                    : integration.description}
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium text-sky-800">
              {state && state !== "disconnected" ? "Manage " : ""}
              <span aria-hidden="true">→</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export type MyApp = {
  id: string;
  app_id: string;
  status: string;
  verification_state: string;
  review_reason?: string | null;
  completed_at?: string | null;
  rejected_at?: string | null;
  owned: boolean;
  owner_verification_level: string | null;
  app: {
    slug?: string;
    name?: string;
    website_url?: string;
    logo_url?: string | null;
    claim_state?: string;
  } | null;
};

export default function AppJourney({ item }: { item: MyApp }) {
  const domainVerified =
    item.owned && item.owner_verification_level === "domain_verified";
  return (
    <div className="mt-5 border-t border-neutral-100 pt-4 text-sm">
      {item.review_reason && (
        <p className="mb-3 whitespace-pre-wrap text-neutral-700">
          <strong>Ownership review:</strong> {item.review_reason}
        </p>
      )}
      {!domainVerified ? (
        item.status === "review" ? (
          <p className="font-medium text-neutral-700">
            Ownership review pending. We’ll let you know when there is an
            update.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Prove this app is yours</p>
              <p className="mt-1 text-neutral-600">
                Verify control of its website to build trust in the public
                listing.
              </p>
            </div>
            <Link
              to={`/apps/add?app=${item.app_id}`}
              className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white"
            >
              Verify domain
            </Link>
          </div>
        )
      ) : (
        <div>
          <p className="font-semibold text-neutral-900">Domain verified</p>
          <p className="mt-1 text-neutral-600">
            Your public listing shows that you control the website.
          </p>
          <IntegrationCards key={item.app_id} appId={item.app_id} />
        </div>
      )}
    </div>
  );
}
