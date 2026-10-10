import { useEffect, useRef, useState } from "react";
import RocketButton from "./RocketButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Plan = {
  id: string;
  name: string;
  amount_cents: number;
  currency: string;
  interval: "month" | "year" | null;
  billing_type?: "one_time" | "subscription";
  product_key?: string;
  return_uri?: string;
};
type Entitlement = {
  status: string;
  valid_until: string | null;
  active: boolean;
} | null;
const money = (plan: Plan) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: plan.currency.toUpperCase(),
  }).format(plan.amount_cents / 100);

const billingPeriod = (plan: Plan) =>
  plan.billing_type === "one_time" || plan.interval === null
    ? "one-time"
    : plan.interval;

async function request<T>(action: string, appId: string, details: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("rocket-buy", {
    body: { action, app_id: appId, ...details },
  });
  if (error || data?.error)
    throw new Error(
      data?.error || error?.message || "Buy with Rocket is unavailable",
    );
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
  const [canBuy, setCanBuy] = useState(false);
  const [entitlement, setEntitlement] = useState<Entitlement>(null);
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
      : request<{ plan: Plan | null }>("catalog", appId);
    catalog
      .then((result) => {
        if (!cancelled) {
          setCanBuy(!!result.plan);
          if (result.plan) setPlan(result.plan);
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
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = () =>
      request<{ plan: Plan | null; entitlement: Entitlement }>("status", appId)
        .then((result) => {
          if (!cancelled) {
            setEntitlement(result.entitlement || null);
            if (result.plan) setPlan(result.plan);
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
  if (!plan) return null;
  if (entitlement?.active)
    return (
      <div
        className="rounded-xl border border-emerald-300 px-4 py-2 text-sm"
        role="status"
      >
        <span className="font-semibold">You&apos;re in.</span> {appName} ·{" "}
        {plan.name} · {money(plan)}/{billingPeriod(plan)}
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
    if (!user) {
      const next = `${window.location.pathname}?buy=1`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
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
        : await request<{ checkout_url: string }>("checkout", appId,
            plan.billing_type === "one_time" || plan.interval === null
              ? {
                  product_key: plan.product_key,
                  return_uri: plan.return_uri,
                  purchase_request_id: (purchaseRequestId.current ||= crypto.randomUUID()),
                }
              : {});
      window.location.assign(result.checkout_url);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Checkout unavailable",
      );
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {processing && (
        <span role="status" className="text-sm text-neutral-600">
          Waiting for confirmed payment…
        </span>
      )}
      <span className="text-sm font-medium">
        {plan.name} · {money(plan)}/{billingPeriod(plan)}
      </span>
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
          disabled={processing || (pilot && !acceptedTerms)}
        />
      )}
      {error && (
        <span role="alert" className="w-full text-sm text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
