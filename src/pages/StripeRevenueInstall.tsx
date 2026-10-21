import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { MyApp } from "@/components/AppJourney";
import AppLogo from "@/components/AppLogo";

export default function StripeRevenueInstall() {
  const { user } = useAuth();
  const [result, setResult] = useState<{
    userId: string;
    apps: MyApp[];
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase.functions.invoke("rocket-stripe-revenue", { body: { action: "installation_apps" } })
      .then(({ data, error }) => {
        if (error || !Array.isArray(data?.apps)) throw new Error("Installation unavailable");
        if (active) setResult({ userId: user.id, apps: data.apps });
      })
      .catch(() => {
        if (active)
          setError("Your apps could not be loaded. Please try again.");
      });
    return () => {
      active = false;
    };
  }, [user]);

  const apps = result && result.userId === user?.id ? result.apps : [];
  const eligible = apps.filter(
    (app) => app.owned && app.owner_verification_level === "domain_verified",
  );
  const needsVerification = apps.filter(
    (app) => !app.owned || app.owner_verification_level !== "domain_verified",
  );

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-10 text-neutral-900 sm:px-8 sm:pt-14">
      <Link
        to="/your-apps"
        className="text-sm font-medium text-sky-800 hover:underline"
      >
        ← My Apps
      </Link>
      <h1 className="mt-5 font-display text-3xl sm:text-4xl">
        Connect Stripe revenue verification
      </h1>
      <p className="mt-3 max-w-2xl text-neutral-600">
        Choose the Rocket app whose revenue you want to verify. You will review
        the read-only Stripe connection and select the exact products and prices
        on the next page. Revenue stays private until you choose otherwise.
      </p>

      {!result && !error && (
        <div
          role="status"
          aria-label="Loading your apps"
          className="mt-8 space-y-3"
        >
          {[0, 1].map((index) => (
            <div
              key={index}
              className="rocket-skeleton-surface h-24 animate-pulse rounded-2xl border border-neutral-200 bg-white"
            />
          ))}
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mt-8 rounded-2xl border border-red-200 bg-white p-5 text-red-700"
        >
          {error}
        </p>
      )}

      {!!eligible.length && (
        <section className="mt-8 space-y-3" aria-label="Choose an app">
          {eligible.map((app) => (
            <Link
              key={app.app_id}
              to={`/my-apps/${app.app_id}/revenue`}
              className="flex min-h-24 items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
              <AppLogo
                name={app.app?.name || "App"}
                src={app.app?.logo_url}
                className="h-14 w-14"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {app.app?.name || "App"}
                </span>
                <span className="block text-sm text-neutral-600">
                  Domain verified · Select this app
                </span>
              </span>
              <span aria-hidden="true" className="text-sky-800">
                →
              </span>
            </Link>
          ))}
        </section>
      )}

      {result && !eligible.length && (
        <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6">
          <p className="font-semibold">No verified app is ready to connect.</p>
          <p className="mt-2 text-sm text-neutral-600">
            Claim or submit your app, then verify control of its website before
            connecting revenue.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
            <Link to="/discover" className="text-sky-800 hover:underline">
              Find an app to claim
            </Link>
            <Link to="/submit" className="text-sky-800 hover:underline">
              Submit an app
            </Link>
          </div>
        </div>
      )}

      {!!needsVerification.length && (
        <section className="mt-8">
          <h2 className="font-semibold">
            Apps that need ownership verification
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {needsVerification.map((app) => (
              <Link
                key={app.app_id}
                to={`/my-apps/${app.app_id}`}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-sky-800 hover:border-sky-400"
              >
                {app.app?.name || "App under review"} →
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
