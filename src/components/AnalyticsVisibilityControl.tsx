import { useId } from "react";

export type AnalyticsVisibility = "private" | "verified_only" | "range" | "exact";

export function AnalyticsVisibilityControl({ value, metric = "pageviews", label = "What should visitors see?", disabled, publicDisabled, onChange }: {
  value: string;
  metric?: string;
  label?: string;
  disabled?: boolean;
  publicDisabled?: boolean;
  onChange: (value: AnalyticsVisibility) => void;
}) {
  const id = useId();
  const descriptions: Record<string, string> = {
    private: `Your ${metric} stay private. Visitors see neither this metric nor its verification badge.`,
    verified_only: `Visitors see a verification badge for ${metric}, without a number.`,
    range: `Visitors see your ${metric} as a range instead of an exact count.`,
    exact: `Visitors see your exact ${metric} count.`,
  };
  return <div>
    <label htmlFor={id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span>{label}</span>
      <select id={id} value={value} disabled={disabled} aria-describedby={`${id}-description`}
        onChange={(event) => onChange(event.target.value as AnalyticsVisibility)}
        className="w-full min-w-0 rounded-lg border p-2 sm:w-auto">
        <option value="private">Keep {metric} private</option>
        <option value="verified_only" disabled={publicDisabled}>Show verification badge only</option>
        <option value="range" disabled={publicDisabled}>Show {metric} as a range</option>
        <option value="exact" disabled={publicDisabled}>Show exact {metric}</option>
      </select>
    </label>
    <p id={`${id}-description`} aria-live="polite" className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{descriptions[value]}</p>
  </div>;
}
