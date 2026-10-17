import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import PlanPicker, { type CommercePlan } from "./PlanPicker";
const plans: CommercePlan[] = [
  {
    id: "month",
    name: "Pro",
    entitlement_key: "pro",
    amount_cents: 1900,
    currency: "usd",
    interval: "month",
  },
  {
    id: "year",
    name: "Pro",
    entitlement_key: "pro",
    amount_cents: 21000,
    currency: "usd",
    interval: "year",
  },
  {
    id: "starter",
    name: "Starter",
    entitlement_key: "starter",
    amount_cents: 900,
    currency: "usd",
    interval: "month",
  },
  {
    id: "once",
    name: "Lifetime",
    amount_cents: 3900,
    currency: "usd",
    interval: null,
    billing_type: "one_time",
  },
];
async function render(offers = plans, initial: string | null = null) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"),
    root = createRoot(container);
  const selected = vi.fn(),
    interval = vi.fn();
  function Fixture() {
    const [id, setId] = useState(initial);
    return (
      <PlanPicker
        plans={offers}
        selectedId={id}
        onSelect={(p) => {
          setId(p?.id || null);
          selected(p);
        }}
        onIntervalChange={interval}
      />
    );
  }
  await act(async () => root.render(<Fixture />));
  return {
    container,
    selected,
    interval,
    cleanup: async () => {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    },
  };
}
describe("native canonical plan picker", () => {
  it("requires explicit selection and shows configured monthly prices plus one-time", async () => {
    const r = await render();
    try {
      expect(r.container.querySelector('[aria-checked="true"]')).toBeNull();
      expect(r.container.textContent).toContain("$19.00/month");
      expect(r.container.textContent).toContain("$39.00 · one-time");
      expect(r.container.textContent).not.toContain("$210.00");
    } finally {
      await r.cleanup();
    }
  });
  it("selects the annual offer of the same entitlement without inventing a discount", async () => {
    const r = await render(plans, "month");
    try {
      await act(async () =>
        [...r.container.querySelectorAll("button")]
          .find((b) => b.textContent === "Annual")!
          .click(),
      );
      expect(r.selected).toHaveBeenLastCalledWith(plans[1]);
      expect(r.container.textContent).toContain("$210.00/year");
      expect(r.container.textContent).not.toMatch(/save|discount|17\.50/i);
      expect(r.interval).toHaveBeenCalledWith("year");
    } finally {
      await r.cleanup();
    }
  });
  it("clears selection when the chosen tier has no matching annual offer", async () => {
    const r = await render(plans, "starter");
    try {
      await act(async () =>
        [...r.container.querySelectorAll("button")]
          .find((b) => b.textContent === "Annual")!
          .click(),
      );
      expect(r.selected).toHaveBeenLastCalledWith(null);
      expect(r.container.querySelector('[aria-checked="true"]')).toBeNull();
    } finally {
      await r.cleanup();
    }
  });
  it("does not show unavailable interval toggles", async () => {
    const r = await render([plans[1]], "year");
    try {
      expect(
        r.container.querySelector('[aria-label="Billing interval"]'),
      ).toBeNull();
      expect(r.container.textContent).toContain("$210.00/year");
    } finally {
      await r.cleanup();
    }
  });
  it("renders untrusted plan copy as text", async () => {
    const r = await render([
      { ...plans[0], description: "<img src=x onerror=alert(1)>" },
    ]);
    try {
      expect(r.container.querySelector("img")).toBeNull();
      expect(r.container.textContent).toContain("<img src=x");
    } finally {
      await r.cleanup();
    }
  });
});
