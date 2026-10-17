import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import PlanPicker, { type CommercePlan } from "../../src/components/PlanPicker";
import RocketButton from "../../src/components/RocketButton";
import "../../src/styles.css";
const plans: CommercePlan[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Starter",
    description: "Everything to get started",
    entitlement_key: "starter",
    amount_cents: 900,
    currency: "usd",
    interval: "month",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Pro",
    description: "More capacity for your growing app",
    entitlement_key: "pro",
    amount_cents: 1900,
    currency: "usd",
    interval: "month",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Pro",
    description: "Annual billing, charged in full",
    entitlement_key: "pro",
    amount_cents: 21000,
    currency: "usd",
    interval: "year",
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    name: "Lifetime",
    description: "One-time software purchase",
    amount_cents: 3900,
    currency: "usd",
    interval: null,
    billing_type: "one_time",
  },
];
function Fixture() {
  const [plan, setPlan] = useState<CommercePlan | null>(null);
  return (
    <main className="mx-auto max-w-3xl p-5">
      <h1 className="mb-5 text-3xl font-semibold">Example app</h1>
      <a
        className="mb-6 inline-block min-h-11 rounded-xl bg-brand p-3 text-white"
        href="https://merchant.example"
      >
        Visit website →
      </a>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Get Example app</h2>
        <PlanPicker
          plans={plans}
          selectedId={plan?.id || null}
          onSelect={setPlan}
        />
        <RocketButton
          action="buy"
          disabled={!plan}
          onActivate={() =>
            window.location.assign(
              `https://checkout.stripe.com/fixture?offer=${plan!.id}`,
            )
          }
        />
      </section>
      <p className="mt-4 text-sm">Fixture only — no real payments.</p>
      <div id="external" className="mt-8"></div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
