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
  interval: "month" | "year" | null;
  billing_type?: "subscription" | "one_time";
  platform_fee_bps: number;
  is_active: boolean;
  integration_confirmed_at?: string | null;
  activated_at?: string | null;
};
type BuyStatus = {
  merchant: {
    ready: boolean;
    status: string;
    stripe_account_id: string;
    connection_method: string;
  } | null;
  products: Plan[];
  platform_fee_bps: number;
  launch_ready: boolean;
};
type PendingStripeAccount = {
  id: string;
  stripe_account_id: string;
  stripe_account_name: string | null;
  stripe_account_country: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
};
type StripePrice = {
  stripe_price_id: string;
  name: string;
  amount_cents: number;
  billing_type: "one_time" | "subscription";
  interval: "month" | "year" | null;
  registered: boolean;
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

async function oauthRequest<T>(
  action: string,
  appId: string,
  extras: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    "rocket-buy-stripe-oauth",
    {
      body: { action, app_id: appId, ...extras },
    },
  );
  if (error || data?.error)
    throw new Error(
      data?.error ||
        error?.message ||
        "Stripe account connection is unavailable",
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
  const stripeReturn = params.get("stripe");
  const [appId, setAppId] = useState(
    ownedApps.find((app) => app.app_id === requestedApp)?.app_id ||
      ownedApps[0]?.app_id ||
      "",
  );
  const [status, setStatus] = useState<BuyStatus | null>(null);
  const [pendingAccount, setPendingAccount] =
    useState<PendingStripeAccount | null>(null);
  const [country, setCountry] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"month" | "year" | "one_time">(
    "month",
  );
  const [paymentReturn, setPaymentReturn] = useState("");
  const [importReturn, setImportReturn] = useState("");
  const [importKey, setImportKey] = useState("");
  const [catalog, setCatalog] = useState<StripePrice[] | null>(null);
  const [catalogCursor, setCatalogCursor] = useState<string | null>(null);
  const [selectedPrice, setSelectedPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!appId) return;
    try {
      setError("");
      const next = await request<BuyStatus>("status", appId);
      setStatus(next);
      try {
        const pending = await oauthRequest<{
          pending_account: PendingStripeAccount | null;
        }>("status", appId);
        setPendingAccount(pending.pending_account);
      } catch {
        setPendingAccount(null);
      }
      onStatus?.(next);
    } catch (caught: unknown) {
      setStatus(null);
      setPendingAccount(null);
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
  useEffect(() => {
    setCatalog(null);
    setCatalogCursor(null);
    setSelectedPrice("");
    setImportKey("");
  }, [appId]);
  const connectExisting = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await oauthRequest<{ authorization_url: string }>(
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
        caught instanceof Error
          ? caught.message
          : "Could not connect Stripe account",
      );
      setBusy(false);
    }
  };
  const selectAccount = async () => {
    if (!pendingAccount) return;
    setBusy(true);
    setError("");
    try {
      await oauthRequest("activate", appId, { attempt_id: pendingAccount.id });
      setPendingAccount(null);
      setCatalog(null);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not select Stripe account",
      );
    } finally {
      setBusy(false);
    }
  };
  const loadCatalog = async (cursor?: string) => {
    setBusy(true);
    setError("");
    try {
      const page = await request<{
        prices: StripePrice[];
        next_cursor: string | null;
      }>("stripe_catalog", appId, cursor ? { starting_after: cursor } : {});
      setCatalog((previous) =>
        cursor ? [...(previous || []), ...page.prices] : page.prices,
      );
      setCatalogCursor(page.next_cursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not read Stripe prices",
      );
    } finally {
      setBusy(false);
    }
  };
  const importPlan = async (event: FormEvent) => {
    event.preventDefault();
    const selected = catalog?.find(
      (price) => price.stripe_price_id === selectedPrice && !price.registered,
    );
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await request("import_price", appId, {
        stripe_price_id: selected.stripe_price_id,
        ...(importKey ? { product_key: importKey } : {}),
        ...(selected.billing_type === "one_time"
          ? { payment_return_uri: importReturn }
          : {}),
      });
      setCatalog(
        (previous) =>
          previous?.map((price) =>
            price.stripe_price_id === selected.stripe_price_id
              ? { ...price, registered: true }
              : price,
          ) || null,
      );
      setSelectedPrice("");
      setImportKey("");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not import Stripe price",
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
        billing_type: interval === "one_time" ? "one_time" : "subscription",
        ...(interval === "one_time"
          ? { payment_return_uri: paymentReturn }
          : {}),
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
        Connect the Stripe account that holds your products, then map eligible
        fixed prices from that account. Rocket&apos;s platform fee is{" "}
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
      {!error &&
        ["connection_failed", "connection_denied"].includes(
          stripeReturn || "",
        ) && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            Stripe account connection was not completed. Select the intended
            account in Stripe and try again.
          </p>
        )}
      {status && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold">1. Connect your Stripe account</h3>
            <p className="mt-1 text-sm text-neutral-600">
              {status.merchant?.ready
                ? `Merchant ready for card payments and payouts. Account: ${status.merchant.stripe_account_id}.`
                : "Use Stripe Dashboard to select the account that holds your products. You can review the selected account before Rocket uses it for new checkout."}
            </p>
            <button
              type="button"
              onClick={connectExisting}
              disabled={busy}
              className="mt-4 h-10 rounded-lg border border-[#167ac6] px-4 text-sm font-semibold text-[#167ac6] disabled:opacity-50"
            >
              Connect existing Stripe account
            </button>
            {pendingAccount && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-neutral-800">
                <p className="font-semibold">
                  Review the account selected in Stripe
                </p>
                <p className="mt-1">
                  {pendingAccount.stripe_account_name || "Stripe account"} ·{" "}
                  {pendingAccount.stripe_account_id}
                  {pendingAccount.stripe_account_country
                    ? ` · ${pendingAccount.stripe_account_country}`
                    : ""}
                </p>
                <p className="mt-1">
                  {pendingAccount.charges_enabled &&
                  pendingAccount.payouts_enabled
                    ? "Card charges and payouts are enabled."
                    : "This account cannot accept Buy with Rocket payments yet."}
                </p>
                {status.merchant &&
                  status.merchant.stripe_account_id !==
                    pendingAccount.stripe_account_id && (
                    <p className="mt-1">
                      Current Rocket merchant:{" "}
                      {status.merchant.stripe_account_id}. Selecting this
                      account will retire its active offers for new checkout;
                      existing financial records stay attached to that merchant.
                    </p>
                  )}
                <button
                  type="button"
                  onClick={selectAccount}
                  disabled={
                    busy ||
                    !pendingAccount.charges_enabled ||
                    !pendingAccount.payouts_enabled
                  }
                  className="mt-3 h-10 rounded-lg bg-[#167ac6] px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Use this account for Buy with Rocket
                </button>
              </div>
            )}
            {!status.merchant?.ready && (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <p className="w-full text-sm text-neutral-600">
                  Or create a new Rocket-connected Stripe account:
                </p>
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
                      : "Start Stripe setup"}
                </button>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold">
              2. Map a Stripe price to an access plan
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              Your price and Rocket&apos;s {status.platform_fee_bps / 100}% fee
              are recorded server-side. A plan stays private until its payment
              and entitlement integration is verified.
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Import an existing fixed price from this Rocket-connected merchant
              account. Prices on another Stripe account are not available here.
              Imported plans remain inactive.
            </p>
            <button
              type="button"
              onClick={() => void loadCatalog()}
              disabled={busy || !status.merchant?.ready}
              className="mt-4 h-10 rounded-lg border border-[#167ac6] px-4 text-sm font-semibold text-[#167ac6] disabled:opacity-50"
            >
              {catalog ? "Refresh Stripe prices" : "Load Stripe prices"}
            </button>
            {catalog && (
              <form
                onSubmit={importPlan}
                className="mt-3 flex flex-wrap items-end gap-3"
              >
                <label className="text-sm">
                  Existing Stripe price
                  <select
                    value={selectedPrice}
                    onChange={(event) => setSelectedPrice(event.target.value)}
                    className="mt-1 block h-10 max-w-full rounded-lg border border-neutral-200 px-3"
                  >
                    <option value="">Select a price</option>
                    {catalog.map((item) => (
                      <option
                        key={item.stripe_price_id}
                        value={item.stripe_price_id}
                        disabled={item.registered}
                      >
                        {item.name} · ${(item.amount_cents / 100).toFixed(2)}{" "}
                        {item.billing_type === "one_time"
                          ? "one-time"
                          : `/${item.interval}`}
                        {item.registered ? " · Already mapped" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Access key for your app
                  <input
                    value={importKey}
                    onChange={(event) => setImportKey(event.target.value)}
                    pattern="[a-z0-9][a-z0-9_-]{2,80}"
                    placeholder="e.g. grow-access"
                    className="mt-1 block h-10 min-w-48 rounded-lg border border-neutral-200 px-3"
                  />
                </label>
                {catalog.find((item) => item.stripe_price_id === selectedPrice)
                  ?.billing_type === "one_time" && (
                  <label className="text-sm">
                    Approved payment-return URL
                    <input
                      required
                      type="url"
                      value={importReturn}
                      onChange={(event) => setImportReturn(event.target.value)}
                      className="mt-1 block h-10 min-w-72 rounded-lg border border-neutral-200 px-3"
                    />
                  </label>
                )}
                <button
                  disabled={busy || !selectedPrice}
                  className="h-10 rounded-lg border border-[#167ac6] px-4 text-sm font-semibold text-[#167ac6] disabled:opacity-50"
                >
                  Import inactive plan
                </button>
                {catalogCursor && (
                  <button
                    type="button"
                    onClick={() => void loadCatalog(catalogCursor)}
                    disabled={busy}
                    className="h-10 rounded-lg border border-neutral-200 px-4 text-sm disabled:opacity-50"
                  >
                    More prices
                  </button>
                )}
                {!catalog.length && (
                  <p className="text-sm text-neutral-600">
                    No eligible fixed USD prices found on this connected Stripe
                    account.
                  </p>
                )}
              </form>
            )}
            {status.products.map((plan) => (
              <p key={plan.id} className="mt-3 text-sm">
                {plan.name} · ${(plan.amount_cents / 100).toFixed(2)}
                {plan.billing_type === "one_time"
                  ? " one-time"
                  : `/${plan.interval === "year" ? "year" : "month"}`}{" "}
                · {plan.is_active ? "Active" : "Not active"}
              </p>
            ))}
            <p className="mt-5 text-sm font-medium">
              Or create a new Stripe price
            </p>
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
                    setInterval(
                      event.target.value as "month" | "year" | "one_time",
                    )
                  }
                  className="mt-1 block h-10 rounded-lg border border-neutral-200 px-3"
                >
                  <option value="month">Monthly</option>
                  <option value="year">Annual</option>
                  <option value="one_time">One-time</option>
                </select>
              </label>
              {interval === "one_time" && (
                <label className="text-sm">
                  Approved payment-return URL
                  <input
                    required
                    type="url"
                    value={paymentReturn}
                    onChange={(event) => setPaymentReturn(event.target.value)}
                    className="mt-1 block h-10 rounded-lg border border-neutral-200 px-3"
                  />
                </label>
              )}
              <button
                disabled={busy || !status.merchant?.ready}
                className="h-10 rounded-lg border border-[#167ac6] px-4 text-sm font-semibold text-[#167ac6] disabled:opacity-50"
              >
                Create a new price and inactive plan
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
                  className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold disabled:opacity-50"
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
