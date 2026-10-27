import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import PlanPicker, { type CommercePlan } from "./PlanPicker";
import RocketButton from "./RocketButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Plan = CommercePlan;
type Entitlement = {
  offer_id?: string;
  plan_name?: string;
  billing_type?: string;
  status: string;
  valid_until: string | null;
  active: boolean;
} | null;
async function request<T>(
  action: string,
  appId: string,
  details: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("rocket-buy", {
    body: { action, app_id: appId, ...details },
  });
  if (error || data?.error) {
    let serverError = data?.error;
    if (
      !serverError &&
      error &&
      "context" in error &&
      error.context instanceof Response
    ) {
      const response = await error.context
        .clone()
        .json()
        .catch(() => null);
      serverError = response?.error;
    }
    throw new Error(
      serverError || error?.message || "Buy with Rocket is unavailable",
    );
  }
  return data as T;
}

export default function AppProfileBuyAction({
  appId,
  appName,
  websiteUrl,
}: {
  appId: string;
  appName: string;
  websiteUrl: string;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [ownedPlan, setOwnedPlan] = useState<Plan | null>(null);
  const source =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("source") ===
      "developer_website"
      ? "developer_website"
      : "marketplace";
  const [canBuy, setCanBuy] = useState(false);
  const [sellerCannotBuy, setSellerCannotBuy] = useState(false);
  const [rawEntitlement, setEntitlement] = useState<Entitlement>(null);
  const [entitlementOwner, setEntitlementOwner] = useState("");
  const entitlement =
    entitlementOwner === `${appId}:${userId}` ? rawEntitlement : null;
  const [busy, setBusy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const purchaseRequestId = useRef<string | null>(null);
  const pilot =
    appId === "b202d75a-02ae-46e6-8419-5b3410cbaac8" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("acceptance") === "1";
  const [error, setError] = useState("");
  const processing =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("purchase") ===
      "processing";
  useEffect(() => {
    let cancelled = false;
    setCanBuy(false);
    setSellerCannotBuy(false);
    setPlans([]);
    setError("");
    setPlan(null);
    setAcceptedTerms(false);
    const catalog = pilot
      ? userId
        ? supabase.functions
            .invoke("launch-rocket-acceptance", { body: { action: "status" } })
            .then(({ data, error }) => {
              if (error) throw error;
              return { plan: data?.available ? data.plan : null };
            })
        : Promise.resolve({ plan: null })
      : request<{
          plan: Plan | null;
          plans?: Plan[];
          viewer_is_seller?: boolean;
        }>("catalog", appId);
    catalog
      .then((result) => {
        if (!cancelled) {
          const offers =
            ("plans" in result ? (result.plans as Plan[]) : undefined) ||
            (result.plan ? [result.plan] : []);
          setPlans(offers);
          const isSeller =
            "viewer_is_seller" in result && !!result.viewer_is_seller;
          setSellerCannotBuy(isSeller);
          setCanBuy(offers.length > 0 && !isSeller);
          const explicit = new URLSearchParams(window.location.search).get(
            "offer",
          );
          setPlan(
            explicit
              ? offers.find((p) => p.id === explicit) || null
              : offers.length === 1
                ? offers[0]
                : null,
          );
          if (explicit && !offers.some((p) => p.id === explicit))
            setError(
              "This offer is no longer available. Review and select a published plan below.",
            );
          if (offers.length)
            track("plan_picker_viewed", {
              app_id: appId,
              source,
              offer_count: offers.length,
            });
        }
      })
      .catch(() => {
        if (!cancelled) setCanBuy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, pilot, userId]);
  useEffect(() => {
    setEntitlement(null);
    setOwnedPlan(null);
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = () =>
      request<{ plan: Plan | null; entitlement: Entitlement }>("status", appId)
        .then((result) => {
          if (!cancelled) {
            setEntitlementOwner(`${appId}:${userId}`);
            setEntitlement(result.entitlement || null);
            if (result.plan) setOwnedPlan(result.plan);
          }
          if (result.entitlement?.active && timer) clearInterval(timer);
        })
        .catch(() => undefined);
    void refresh();
    if (processing) timer = setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [appId, userId, processing]);
  if (!plan && pilot)
    return (
      <div className="space-y-2 rounded-xl border border-neutral-200 p-4 text-sm">
        <p className="font-semibold">Launch Pro private purchase test</p>
        {!user ? (
          <>
            <p>
              Sign into the Rocket account selected by the developer to start
              this test.
            </p>
            <a
              className="text-brand underline"
              href={`/login?next=${encodeURIComponent("/apps/launch?acceptance=1")}`}
            >
              Log in to test purchase
            </a>
          </>
        ) : (
          <p role="status">
            This test is only available to the selected tester while Launch Pro
            is unpublished. Ask the developer to check the selected Rocket
            username in payment setup.
          </p>
        )}
      </div>
    );
  if (!plan && !plans.length && !entitlement?.active) return null;
  if (
    userId &&
    entitlement?.active &&
    (entitlement.billing_type === "subscription" || !canBuy)
  )
    return (
      <div
        className="rounded-xl border border-emerald-300 px-4 py-2 text-sm"
        role="status"
      >
        <span className="font-semibold">You&apos;re in.</span> {appName} ·{" "}
        {entitlement.plan_name || ownedPlan?.name || "Purchased plan"}
        <a href="/library" className="ml-3 underline">
          Manage subscription
        </a>
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-3 font-semibold text-[#167ac6] underline"
        >
          Open App
        </a>
      </div>
    );
  const buy = async () => {
    if (busy || !plan) return;
    if (!user) {
      const next = `${window.location.pathname}?buy=1&offer=${encodeURIComponent(plan.id)}&source=${source}#pricing`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      track("checkout_started", {
        app_id: appId,
        offer_id: plan.id,
        source,
        commerce: "buy_with_rocket",
      });
      const result = pilot
        ? await supabase.functions
            .invoke("launch-rocket-acceptance", {
              body: {
                action: "checkout",
                confirm_purchase_terms: acceptedTerms
                  ? "39 USD one-time for one Launch Pro"
                  : "",
                amount_limit_cents: 3900,
              },
            })
            .then(({ data, error }) => {
              if (error || data?.error)
                throw new Error(
                  data?.error || "Acceptance checkout unavailable",
                );
              return data;
            })
        : await request<{ checkout_url: string }>("checkout", appId, {
            offer_id: plan.id,
            source,
            ...(plan.billing_type === "one_time" || plan.interval === null
              ? {
                  product_key: plan.product_key,
                  return_uri: plan.return_uri,
                  purchase_request_id: (purchaseRequestId.current ||=
                    crypto.randomUUID()),
                }
              : {}),
          });
      window.location.assign(result.checkout_url);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error &&
          /existing_subscription|checkout_in_progress/.test(caught.message)
          ? "You already have a subscription or checkout for this app. Manage subscriptions in My Purchases. To resume an open checkout, select its original plan; wait for it to expire before changing plans."
          : caught instanceof Error
            ? caught.message === "cannot_buy_own_app"
              ? "You can't buy your own app. Use a separate buyer account to test checkout."
              : caught.message
            : "Checkout unavailable",
      );
      setBusy(false);
    }
  };
  return (
    <section
      id="pricing"
      aria-label="Buy with Rocket plans"
      className="mt-6 min-w-0 space-y-4"
    >
      <h2 className="text-xl font-semibold">Get {appName}</h2>
      {plans.length > 0 && (
        <PlanPicker
          key={appId}
          plans={plans}
          selectedId={plan?.id || null}
          onSelect={(next) => {
            setPlan(next);
            purchaseRequestId.current = null;
            if (next)
              track("plan_selected", {
                app_id: appId,
                offer_id: next.id,
                entitlement_key: next.entitlement_key,
                source,
              });
          }}
          onIntervalChange={(interval) =>
            track("billing_interval_changed", {
              app_id: appId,
              interval,
              source,
            })
          }
        />
      )}
      {sellerCannotBuy && (
        <p role="status" className="text-sm text-neutral-600">
          You can’t buy your own app. Use a separate buyer account to test
          checkout.
        </p>
      )}
      {processing && (
        <span role="status" className="text-sm text-neutral-600">
          Waiting for confirmed payment…
        </span>
      )}
      {!canBuy && entitlement && (
        <span className="text-sm text-neutral-600">
          {entitlement.status.replaceAll("_", " ")}
        </span>
      )}
      {canBuy && pilot && (
        <label className="text-sm">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
          />{" "}
          I approve a new $39 USD one-time Launch Pro acceptance purchase.
        </label>
      )}
      {canBuy && (
        <RocketButton
          action="buy"
          onActivate={buy}
          loading={busy}
          disabled={!plan || processing || (pilot && !acceptedTerms)}
        />
      )}
      {error && (
        <span role="alert" className="w-full text-sm text-red-600">
          {error}
        </span>
      )}
      {!plan && canBuy && (
        <p className="text-sm text-neutral-600">Select a plan to continue.</p>
      )}
      <p className="text-xs text-neutral-500">
        Already subscribed? Manage your subscription in{" "}
        <a className="underline" href="/library">
          My Purchases
        </a>
        . Plan changes are not supported yet; cancel your current subscription
        and wait for it to end before buying another.
      </p>
    </section>
  );
}
