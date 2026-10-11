import type { LucideIcon } from "lucide-react";
import { ShieldCheck } from "lucide-react";

export default function PublicMetricCard({
  label,
  value,
  icon: Icon,
  details,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  details: string;
}) {
  return (
    <div
      className="relative h-full overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 p-5 sm:p-6"
      title={details}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-5 left-0 w-1 rounded-r bg-[#167ac6]"
      />
      <p className="flex items-center gap-2 text-base font-medium text-neutral-600">
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
        {label}
      </p>
      <p className="mt-2 break-words text-3xl font-semibold tabular-nums tracking-tight text-sky-700 sm:text-4xl">
        {value}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-neutral-600">
        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
        Verified
      </p>
      <p className="mt-1 text-xs text-neutral-500">{details}</p>
    </div>
  );
}

export function publicTrafficValue(
  visibility: string,
  value: number | null,
  range: string | null,
) {
  if (visibility === "range") return range || "Private";
  if (visibility !== "exact" || value === null || !Number.isFinite(value))
    return "Private";
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function revenueMoney(minor: number, currency: string) {
  try {
    const options = {
      style: "currency",
      currency: currency.toUpperCase(),
    } as const;
    const digits =
      new Intl.NumberFormat("en-US", options).resolvedOptions()
        .maximumFractionDigits ?? 2;
    const amount = minor / 10 ** digits;
    return new Intl.NumberFormat("en-US", {
      ...options,
      ...(amount >= 10000
        ? { notation: "compact" as const, maximumFractionDigits: 1 }
        : {}),
    }).format(amount);
  } catch {
    return `${minor} ${currency.toUpperCase()} minor units`;
  }
}

export function publicRevenueValue(
  visibility: string,
  minor: number | null,
  lower: number | null,
  upper: number | null,
  currency: string,
) {
  if (visibility === "range" && lower !== null) {
    return `${revenueMoney(lower, currency)}${upper === null ? "+" : `–${revenueMoney(upper, currency)}`}`;
  }
  return visibility === "exact" && minor !== null && Number.isFinite(minor)
    ? revenueMoney(minor, currency)
    : "Private";
}
