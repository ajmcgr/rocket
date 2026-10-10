import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import {
  developerMessage,
  type DeveloperBuyStatus,
} from "@/lib/developerExperience";

type BuyStatus = DeveloperBuyStatus & {
  merchant:
    | (DeveloperBuyStatus["merchant"] & {
        stripe_account_id: string;
        connection_method: string;
      })
    | null;
};
type PendingStripeAccount = {
  id: string;
  stripe_account_id: string;
  stripe_account_name: string | null;
  stripe_account_country: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
};

async function request<T>(
  functionName: string,
  action: string,
  appId: string,
  extras: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: { action, app_id: appId, ...extras },
  });
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
  const [appId, setAppId] = useState(
    ownedApps.find((app) => app.app_id === params.get("app"))?.app_id ||
      ownedApps[0]?.app_id ||
      "",
  );
  const [status, setStatus] = useState<BuyStatus | null>(null);
  const [pending, setPending] = useState<PendingStripeAccount | null>(null);
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const refresh = useCallback(async () => {
    if (!appId) return;
    try {
      setError("");
      const next = await request<BuyStatus>(
        "rocket-buy-developer",
        "status",
        appId,
      );
      setStatus(next);
      onStatusRef.current?.(next);
      try {
        const selection = await request<{
          pending_account: PendingStripeAccount | null;
        }>("rocket-buy-stripe-oauth", "status", appId);
        setPending(selection.pending_account);
      } catch {
        setPending(null);
      }
    } catch (caught) {
      setStatus(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load payment setup",
      );
    }
  }, [appId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ authorization_url: string }>(
        "rocket-buy-stripe-oauth",
        "start",
        appId,
      );
      const destination = new URL(result.authorization_url);
      if (
        destination.origin !== "https://connect.stripe.com" ||
        destination.pathname !== "/oauth/authorize"
      )
        throw new Error("Invalid Stripe authorization URL");
      window.location.assign(destination.toString());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not connect Stripe",
      );
      setBusy(false);
    }
  };
  const select = async () => {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      await request("rocket-buy-stripe-oauth", "activate", appId, {
        attempt_id: pending.id,
      });
      setPending(null);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not select account",
      );
    } finally {
      setBusy(false);
    }
  };
  const onboard = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ onboarding_url: string }>(
        "rocket-buy-developer",
        "stripe_onboarding",
        appId,
        { country },
      );
      window.location.assign(result.onboarding_url);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not open Stripe onboarding",
      );
      setBusy(false);
    }
  };
  if (!ownedApps.length) return null;
  return (
    <section className="mx-auto mt-8 max-w-5xl rounded-2xl border border-neutral-200 p-6">
      <h2 className="text-xl font-semibold">Buy with Rocket</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Connect Stripe once. Give the integration prompt above to your coding
        agent. Rocket creates Checkout on your connected account and applies its
        5% fee only to Buy with Rocket payments.
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
        <div className="mt-6 space-y-5">
          <div className="rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold">1. Connect Stripe</h3>
            <p className="mt-1 text-sm text-neutral-600">
              {status.merchant?.ready
                ? `Connected and ready: ${status.merchant.stripe_account_id}`
                : "Choose the Stripe account that receives your Buy with Rocket payments."}
            </p>
            <button
              type="button"
              onClick={connect}
              disabled={busy}
              className="mt-4 h-10 rounded-lg border border-[#167ac6] px-4 text-sm font-semibold text-[#167ac6] disabled:opacity-50"
            >
              {status.merchant?.ready
                ? "Change Stripe account"
                : "Connect Stripe"}
            </button>
            {pending && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
                <p className="font-semibold">
                  Review the account selected in Stripe
                </p>
                <p className="mt-1">
                  {pending.stripe_account_name || "Stripe account"} ·{" "}
                  {pending.stripe_account_id}
                  {pending.stripe_account_country
                    ? ` · ${pending.stripe_account_country}`
                    : ""}
                </p>
                <p className="mt-1">
                  {pending.charges_enabled && pending.payouts_enabled
                    ? "Card charges and payouts are enabled."
                    : "This account cannot accept payments yet."}
                </p>
                {status.merchant &&
                  status.merchant.stripe_account_id !==
                    pending.stripe_account_id && (
                    <p className="mt-1">
                      Changing merchants retires previous offers for new
                      checkout; past financial records remain with the original
                      merchant.
                    </p>
                  )}
                <button
                  type="button"
                  onClick={select}
                  disabled={
                    busy || !pending.charges_enabled || !pending.payouts_enabled
                  }
                  className="mt-3 h-10 rounded-lg bg-[#167ac6] px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Use this Stripe account
                </button>
              </div>
            )}
            {!status.merchant?.ready && (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <p className="w-full text-sm text-neutral-600">
                  Or create a new connected Stripe account:
                </p>
                {!status.merchant && (
                  <label className="text-sm">
                    Business country
                    <input
                      value={country}
                      onChange={(event) =>
                        setCountry(event.target.value.toUpperCase())
                      }
                      maxLength={2}
                      placeholder="US"
                      className="mt-1 block h-10 w-24 rounded-lg border px-3"
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={onboard}
                  disabled={busy || (!status.merchant && country.length !== 2)}
                  className="h-10 rounded-lg border border-[#167ac6] px-4 text-sm font-semibold text-[#167ac6] disabled:opacity-50"
                >
                  Continue Stripe setup
                </button>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold">
              2. Integrate with your coding agent
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              Your agent inspects the app’s existing products and access rules,
              registers each intended offer through Rocket’s server-side
              contract, and adds the official Buy with Rocket button. No product
              mapping form is needed here.
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              {status.products.length
                ? `${status.products.length} offer${status.products.length === 1 ? "" : "s"} registered. Each stays private until integration and payment verification pass.`
                : "No offers registered yet."}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold">3. Test, then go live</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Verify Rocket ID, payment, webhook delivery, fulfilment, and
              revocation with an independent buyer. Public checkout remains off
              until those checks pass.
            </p>
            {!status.launch_ready && (
              <p className="mt-2 text-sm text-neutral-600">
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
