import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import {
  developerMessage,
  type DeveloperBuyStatus,
} from "@/lib/developerExperience";

type Plan = {
  id: string;
  name: string;
  amount_cents: number;
  interval: "month" | "year";
  platform_fee_bps: number;
  is_active: boolean;
  integration_confirmed_at?: string | null;
  activated_at?: string | null;
};
type BuyStatus = {
  merchant: { ready: boolean; status: string } | null;
  products: Plan[];
  platform_fee_bps: number;
  launch_ready: boolean;
};

async function request<T>(
  action: string,
  appId: string,
  extras: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    "rocket-buy-developer",
    { body: { action, app_id: appId, ...extras } },
  );
  if (error || data?.error)
    throw new Error(
      data?.error || error?.message || "Buy with Rocket is unavailable",
    );
  return data as T;
}

export default function ProductionBuySetup({
  ownedApps,
  onStatus,
}: {
  ownedApps: { app_id: string; name?: string }[];
  onStatus?: (status: DeveloperBuyStatus) => void;
}) {
  const [params] = useSearchParams();
  const requestedApp = params.get("app");
  const [appId, setAppId] = useState(
    ownedApps.find((app) => app.app_id === requestedApp)?.app_id ||
      ownedApps[0]?.app_id ||
      "",
  );
  const [status, setStatus] = useState<BuyStatus | null>(null);
  const [country, setCountry] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!appId) return;
    try {
      setError("");
      const next = await request<BuyStatus>("status", appId);
      setStatus(next);
      onStatus?.(next);
    } catch (caught: unknown) {
      setStatus(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load payment setup",
      );
    }
  }, [appId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const onboard = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ onboarding_url: string }>(
        "stripe_onboarding",
        appId,
        { country },
      );
      window.location.assign(result.onboarding_url);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not open Stripe onboarding",
      );
      setBusy(false);
    }
  };
  const createPlan = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const cents = Math.round(Number(price) * 100);
      await request<{ plan: Plan }>("create_plan", appId, {
        name,
        amount_cents: cents,
        interval,
      });
      setName("");
      setPrice("");
      await refresh();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Could not create plan",
      );
    } finally {
      setBusy(false);
    }
  };
  const activatePlan = async (planId: string) => {
    setBusy(true);
    setError("");
    try {
      await request("activate_plan", appId, { plan_id: planId });
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not activate plan",
      );
    } finally {
      setBusy(false);
    }
  };
  if (!ownedApps.length) return null;
  return (
    <section className="mx-auto mt-8 max-w-5xl rounded-2xl border border-neutral-200 p-6">
      <h2 className="text-xl font-semibold">Buy with Rocket</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Connect your own Stripe merchant account, then set one monthly or annual
        access plan. Rocket&apos;s platform fee is{" "}
        {status
          ? `${status.platform_fee_bps / 100}%`
          : "shown once setup loads"}{" "}
        of each purchase, before Stripe&apos;s processing fees.
      </p>
      <label className="mt-5 block max-w-lg text-sm font-medium">
        Owned app
        <select
          value={appId}
          onChange={(event) => setAppId(event.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-neutral-200 px-3"
        >
          {ownedApps.map((app) => (
            <option key={app.app_id} value={app.app_id}>
              {app.name || "Your app"}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {developerMessage(error)}
        </p>
      )}
      {status && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold">1. Connect Stripe</h3>
            <p className="mt-1 text-sm text-neutral-600">
              {status.merchant?.ready
                ? "Merchant ready for card payments and payouts."
                : "Stripe-hosted business verification is required before a plan can be sold."}
            </p>
            {!status.merchant?.ready && (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                {!status.merchant && (
                  <label className="text-sm">
                    Business country (two-letter code)
                    <input
                      value={country}
                      onChange={(event) =>
                        setCountry(event.target.value.toUpperCase())
                      }
                      maxLength={2}
                      placeholder="US"
                      className="mt-1 block h-10 w-24 rounded-lg border border-neutral-200 px-3"
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={onboard}
                  disabled={busy || (!status.merchant && country.length !== 2)}
                  className="h-10 rounded-lg border border-[#167ac6] px-4 text-sm font-semibold text-[#167ac6] disabled:opacity-50"
                >
                  {busy
                    ? "Opening…"
                    : status.merchant
                      ? "Continue Stripe setup"
                      : "Connect Stripe"}
                </button>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold">2. Create access plan</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Your price and Rocket&apos;s {status.platform_fee_bps / 100}% fee
              are recorded server-side. A plan stays private until its payment
              and entitlement integration is verified.
            </p>
            {status.products.map((plan) => (
              <p key={plan.id} className="mt-3 text-sm">
                {plan.name} · ${(plan.amount_cents / 100).toFixed(2)}/
                {plan.interval === "year" ? "year" : "month"} ·{" "}
                {plan.is_active ? "Active" : "Not active"}
              </p>
            ))}
            <form
              onSubmit={createPlan}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <label className="text-sm">
                Plan name
                <input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 block h-10 rounded-lg border border-neutral-200 px-3"
                />
              </label>
              <label className="text-sm">
                Price (USD)
                <input
                  required
                  type="number"
                  min="1"
                  max="1000"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="mt-1 block h-10 w-28 rounded-lg border border-neutral-200 px-3"
                />
              </label>
              <label className="text-sm">
                Billing
                <select
                  value={interval}
                  onChange={(event) =>
                    setInterval(event.target.value as "month" | "year")
                  }
                  className="mt-1 block h-10 rounded-lg border border-neutral-200 px-3"
                >
                  <option value="month">Monthly</option>
                  <option value="year">Annual</option>
                </select>
              </label>
              <button
                disabled={busy || !status.merchant?.ready}
                className="h-10 rounded-lg border border-[#167ac6] px-4 text-sm font-semibold text-[#167ac6] disabled:opacity-50"
              >
                Create plan
              </button>
            </form>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold">3. Integrate, test and activate</h3>
            <p className="text-sm text-neutral-600">
              Copy the integration prompt above into your coding agent. Test
              Continue with Rocket and server-side entitlement checks in your
              app. An independent purchase test must be verified before
              activation.
            </p>
            {status.products.map((plan) => (
              <div key={plan.id} className="mt-4">
                <p>
                  {plan.name}:{" "}
                  {plan.integration_confirmed_at
                    ? "Entitlement integration verified"
                    : "Entitlement verification required"}
                </p>
                <button
                  type="button"
                  onClick={() => activatePlan(plan.id)}
                  disabled={
                    busy ||
                    plan.is_active ||
                    !status.launch_ready ||
                    !status.merchant?.ready ||
                    !plan.integration_confirmed_at
                  }
                  className="rounded-lg border border-[#469DDA] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {plan.is_active ? "Live" : "Activate Buy with Rocket"}
                </button>
              </div>
            ))}
            {!status.launch_ready && (
              <p className="mt-2 text-sm">
                Live activation is not available yet. Your configuration remains
                saved.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
