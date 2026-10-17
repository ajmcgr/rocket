import { useState } from "react";

export type CommercePlan = {
  id: string;
  name: string;
  description?: string;
  entitlement_key?: string;
  amount_cents: number;
  currency: string;
  interval: "month" | "year" | null;
  billing_type?: "one_time" | "subscription";
  product_key?: string;
  return_uri?: string;
};
export const isOneTime = (plan: CommercePlan) =>
  plan.billing_type === "one_time" || plan.interval === null;
export function visiblePlans(plans: CommercePlan[], interval: string) {
  return plans.filter((plan) => isOneTime(plan) || plan.interval === interval);
}
export default function PlanPicker({
  plans,
  selectedId,
  onSelect,
  onIntervalChange,
}: {
  plans: CommercePlan[];
  selectedId: string | null;
  onSelect: (plan: CommercePlan | null) => void;
  onIntervalChange?: (interval: "month" | "year") => void;
}) {
  const selected = plans.find((p) => p.id === selectedId);
  const [interval, setInterval] = useState<"month" | "year">(
    selected?.interval ||
      (plans.some((p) => p.interval === "month") ? "month" : "year"),
  );
  const intervals = (["month", "year"] as const).filter((period) =>
    plans.some((p) => p.interval === period),
  );
  // Explicit URL selection is reflected even before local interval interaction.
  const period = selected?.interval || interval;
  const changeInterval = (next: "month" | "year") => {
    setInterval(next);
    const counterpart =
      selected &&
      !isOneTime(selected) &&
      plans.find(
        (p) =>
          p.interval === next &&
          (p.entitlement_key || p.product_key || p.id) ===
            (selected.entitlement_key || selected.product_key || selected.id),
      );
    if (selected && !isOneTime(selected)) onSelect(counterpart || null);
    onIntervalChange?.(next);
  };
  return (
    <div className="min-w-0 space-y-3">
      {intervals.length > 1 && (
        <div
          role="group"
          aria-label="Billing interval"
          className="inline-flex max-w-full gap-1 rounded-xl border border-neutral-200 p-1"
        >
          {intervals.map((next) => (
            <button
              type="button"
              key={next}
              aria-pressed={period === next}
              onClick={() => changeInterval(next)}
              className={`min-h-11 rounded-lg px-4 text-sm ${period === next ? "bg-[#167ac6] text-white" : ""}`}
            >
              {next === "month" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
      )}
      <div
        role="radiogroup"
        aria-label="Choose your plan"
        className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {visiblePlans(plans, period).map((plan) => (
          <button
            type="button"
            role="radio"
            aria-checked={selectedId === plan.id}
            key={plan.id}
            onClick={() => onSelect(plan)}
            className={`min-w-0 rounded-xl border p-4 text-left transition-colors ${selectedId === plan.id ? "border-[#167ac6] bg-sky-50 dark:bg-sky-950" : "border-neutral-200"}`}
          >
            <span className="block break-words font-semibold">{plan.name}</span>
            <span className="mt-2 block text-lg font-semibold">
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: plan.currency.toUpperCase(),
              }).format(plan.amount_cents / 100)}
              <span className="text-sm font-normal">
                {isOneTime(plan)
                  ? " · one-time"
                  : plan.interval === "year"
                    ? "/year"
                    : "/month"}
              </span>
            </span>
            {plan.description && (
              <span className="mt-2 block break-words text-sm text-neutral-600 dark:text-neutral-300">
                {plan.description}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
