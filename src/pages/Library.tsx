import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Purchase = {
  purchase_id?: string;
  app_id: string;
  app_name: string;
  website_url: string;
  plan: {
    name: string;
    amount_cents: number;
    currency: string;
    interval: string | null;
    billing_type?: "one_time" | "subscription";
  };
  status: string;
  valid_until: string | null;
  active: boolean;
};

async function request<T>(action: string, appId?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("rocket-buy", {
    body: { action, app_id: appId },
  });
  if (error || data?.error)
    throw new Error(data?.error || error?.message || "Library unavailable");
  return data as T;
}

export default function Library() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    setPurchases([]);
    setError("");
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    request<{ purchases: Purchase[] }>("library")
      .then((result) => {
        if (!cancelled) setPurchases(result.purchases || []);
      })
      .catch((caught: unknown) => {
        if (!cancelled)
          setError(
            caught instanceof Error ? caught.message : "Library unavailable",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const cancel = async (purchase: Purchase) => {
    if (
      !window.confirm(
        `Cancel ${purchase.app_name} at the end of the paid period?`,
      )
    )
      return;
    setBusy(purchase.app_id);
    setError("");
    try {
      await request<{ cancellation_requested: boolean }>(
        "cancel",
        purchase.app_id,
      );
      const result = await request<{ purchases: Purchase[] }>("library");
      setPurchases(result.purchases || []);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not request cancellation",
      );
    } finally {
      setBusy("");
    }
  };
  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
      <h1 className="font-display text-4xl sm:text-5xl">My Purchases</h1>
      <p className="mt-3 text-neutral-600">
        Access your subscriptions and one-time purchases through Buy with Rocket,
        see payment status, and manage subscriptions. This is separate from
        your own apps and Rocket Developer membership.
      </p>
      {(loading || authLoading) && (
        <div
          role="status"
          className="mt-8 space-y-4 animate-pulse"
          aria-label="Loading subscriptions"
        >
          <div className="h-28 rounded-2xl bg-neutral-100" />
          <div className="h-28 rounded-2xl bg-neutral-100" />
        </div>
      )}
      {!authLoading && !user && (
        <p className="mt-8">
          <Link
            to="/login?next=%2Flibrary"
            className="font-semibold text-[#167ac6] underline"
          >
            Log in to see your subscriptions
          </Link>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {error}
        </p>
      )}
      {!loading && !error && user && !purchases.length && (
        <div className="mt-8 rounded-2xl border border-neutral-200 p-6">
          <p>No purchases yet.</p>
          <p className="mt-2 text-sm text-neutral-600">Subscriptions and one-time purchases through Buy with Rocket appear here once payment is confirmed.</p>
          <Link
            to="/discover"
            className="mt-3 inline-block font-semibold text-[#167ac6]"
          >
            Explore apps →
          </Link>
        </div>
      )}
      {!loading && user && purchases.length > 0 && (
        <div className="mt-8 space-y-4">
          {purchases.map((purchase) => (
            <article
              key={purchase.purchase_id || `${purchase.app_id}:${purchase.plan.name}`}
              className="rounded-2xl border border-neutral-200 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    to={`/apps/${purchase.app_id}`}
                    className="text-lg font-semibold hover:text-[#167ac6]"
                  >
                    {purchase.app_name}
                  </Link>
                  <p className="mt-1 text-sm text-neutral-600">
                    {purchase.plan.name} · {new Intl.NumberFormat("en-US", { style: "currency", currency: purchase.plan.currency }).format(purchase.plan.amount_cents / 100)}
                    {purchase.plan.billing_type === "one_time" ? " · One-time" : `/${purchase.plan.interval === "year" ? "year" : "month"}`}
                  </p>
                  <p className="mt-1 text-sm text-neutral-600">
                    {purchase.status === "canceling" && purchase.valid_until
                      ? `Cancels on ${new Date(purchase.valid_until).toLocaleDateString()}`
                      : purchase.active
                        ? purchase.plan.billing_type === "one_time" ? "Purchased" : "Active"
                        : purchase.status.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {purchase.active && (
                    <a
                      href={purchase.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-[#167ac6] px-4 py-2 text-sm font-semibold text-[#167ac6]"
                    >
                      Open App
                    </a>
                  )}
                  {purchase.plan.billing_type !== "one_time" && purchase.status === "active" && (
                    <button
                      type="button"
                      onClick={() => cancel(purchase)}
                      disabled={busy === purchase.app_id}
                      className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      Cancel at period end
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
