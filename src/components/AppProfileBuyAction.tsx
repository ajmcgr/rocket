import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Plan = {
  id: string;
  name: string;
  amount_cents: number;
  currency: string;
  interval: "month" | "year";
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

async function request<T>(action: string, appId: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("rocket-buy", {
    body: { action, app_id: appId },
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
  const [error, setError] = useState("");
  const processing =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("purchase") ===
      "processing";
  useEffect(() => {
    let cancelled = false;
    request<{ plan: Plan | null }>("catalog", appId)
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
  }, [appId]);
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
        {plan.name} · {money(plan)}/
        {plan.interval === "year" ? "year" : "month"}
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
      const result = await request<{ checkout_url: string }>("checkout", appId);
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
        {plan.name} · {money(plan)}/
        {plan.interval === "year" ? "year" : "month"}
      </span>
      {!canBuy && entitlement && (
        <span className="text-sm text-neutral-600">
          {entitlement.status.replaceAll("_", " ")}
        </span>
      )}
      {canBuy && (
        <button
          type="button"
          onClick={buy}
          disabled={busy || processing}
          className="inline-flex min-h-11 items-center rounded-xl border border-[#167ac6] bg-transparent px-4 text-sm font-semibold text-[#167ac6] disabled:opacity-50"
        >
          {busy ? "Opening checkout…" : "Buy with Rocket"}
        </button>
      )}
      {error && (
        <span role="alert" className="w-full text-sm text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
