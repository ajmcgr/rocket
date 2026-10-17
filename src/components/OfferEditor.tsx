import { useState } from "react";
export default function OfferEditor({
  plan,
  appId,
  busy,
  onSave,
}: {
  plan: {
    id: string;
    name: string;
    description?: string;
    stripe_price_id?: string;
    entitlement_key?: string;
    is_active: boolean;
    amount_cents: number;
    interval: string | null;
  };
  appId: string;
  busy: boolean;
  onSave: (changes: {
    name: string;
    description: string;
    entitlement_key: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(plan.name),
    [description, setDescription] = useState(plan.description || ""),
    [key, setKey] = useState(plan.entitlement_key || "");
  const link = `https://tryrocket.ai/apps/${appId}?buy=1&offer=${plan.id}&source=developer_website#pricing`;
  return (
    <details className="mt-3 rounded-xl border border-neutral-200 p-4">
      <summary className="min-h-11 cursor-pointer text-sm font-medium">
        {plan.name} · ${(plan.amount_cents / 100).toFixed(2)}
        {plan.interval ? `/${plan.interval}` : " one-time"} ·{" "}
        {plan.is_active ? "Published" : "Unpublished"}
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ name, description, entitlement_key: key });
        }}
        className="grid min-w-0 gap-3 sm:grid-cols-2"
      >
        <label className="text-sm">
          Plan name
          <input
            className="mt-1 block min-h-11 w-full rounded-lg border border-neutral-200 px-3"
            value={name}
            maxLength={120}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Entitlement key
          <input
            className="mt-1 block min-h-11 w-full rounded-lg border border-neutral-200 px-3"
            value={key}
            pattern="[a-z0-9][a-z0-9_-]{2,80}"
            required
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Short description
          <textarea
            className="mt-1 block min-h-20 w-full rounded-lg border border-neutral-200 p-3"
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <button
          disabled={busy}
          className="min-h-11 rounded-lg border border-brand px-4 text-sm disabled:opacity-50"
        >
          Save plan details
        </button>
      </form>
      <p className="mt-3 break-all text-xs text-neutral-500">
        Stripe price: {plan.stripe_price_id || "Registered price"} · Offer:{" "}
        {plan.id}
      </p>
      <p className="mt-3 text-sm">Website purchase link</p>
      <a className="block break-all text-sm text-brand underline" href={link}>
        {link}
      </a>
      <p className="mt-2 text-xs text-neutral-500">
        Publish explicitly below before selling. Unpublishing stops new
        checkout; existing subscriptions retain paid access. Use the same key
        for monthly and annual prices of the same tier.
      </p>
    </details>
  );
}
