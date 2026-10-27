import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  user: { id: "buyer" } as { id: string } | null,
  invoke: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mock.user }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mock.invoke } },
}));
import AppProfileBuyAction from "./AppProfileBuyAction";
import "../../public/buttons/v1/rocket-buttons.js";
const launch = "b202d75a-02ae-46e6-8419-5b3410cbaac8";
describe("controlled acceptance Buy action", () => {
  it("passes a ready one-time offer's exact key and return URI with a stable purchase request", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/apps/eligible");
    mock.user = { id: "buyer" };
    mock.invoke.mockReset().mockImplementation(async (_name, options) => {
      if (options.body.action === "catalog")
        return {
          data: {
            plan: {
              id: "plan",
              name: "Eligible",
              amount_cents: 3900,
              currency: "usd",
              interval: null,
              billing_type: "one_time",
              product_key: "eligible-key",
              return_uri: "https://merchant.example/access",
            },
          },
          error: null,
        };
      if (options.body.action === "status")
        return { data: { plan: null, entitlement: null }, error: null };
      return { data: { error: "unavailable" }, error: null };
    });
    const container = document.createElement("div"),
      root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <AppProfileBuyAction
            appId="eligible"
            appName="Eligible"
            websiteUrl="https://merchant.example"
          />,
        ),
      );
      const button = container.querySelector("rocket-button")!;
      expect(button).not.toBeNull();
      await act(async () => button.dispatchEvent(new Event("rocket-activate")));
      await act(async () => button.dispatchEvent(new Event("rocket-activate")));
      const checkoutBodies = mock.invoke.mock.calls
        .filter(([, options]) => options.body.action === "checkout")
        .map(([, options]) => options.body);
      expect(checkoutBodies).toHaveLength(2);
      expect(checkoutBodies[0]).toMatchObject({
        app_id: "eligible",
        product_key: "eligible-key",
        return_uri: "https://merchant.example/access",
        purchase_request_id: expect.any(String),
      });
      expect(checkoutBodies[1].purchase_request_id).toBe(
        checkoutBodies[0].purchase_request_id,
      );
    } finally {
      await act(async () => root.unmount());
      window.history.replaceState(null, "", "/");
      vi.unstubAllGlobals();
    }
  });
  it("shows only the server-eligible pilot and requires one-time-payment agreement", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/apps/launch?acceptance=1");
    mock.user = { id: "buyer" };
    mock.invoke.mockReset().mockImplementation(async (name) => ({
      data:
        name === "launch-rocket-acceptance"
          ? {
              available: true,
              plan: {
                id: "plan",
                name: "Acceptance",
                amount_cents: 3900,
                currency: "usd",
                interval: null,
                billing_type: "one_time",
              },
            }
          : { plan: null, entitlement: null },
      error: null,
    }));
    const container = document.createElement("div"),
      root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <AppProfileBuyAction
            appId={launch}
            appName="Launch"
            websiteUrl="https://trylaunch.ai"
          />,
        );
      });
      const button = container
          .querySelector("rocket-button")!
          .shadowRoot!.querySelector("button")!,
        checkbox = container.querySelector("input")!;
      expect(button.disabled).toBe(true);
      expect(container.textContent).toContain("$39.00 · one-time");
      expect(container.textContent).toContain("$39 USD one-time Launch Pro");
      await act(async () => checkbox.click());
      expect(button.disabled).toBe(false);
      expect(
        mock.invoke.mock.calls.some(
          ([, options]) => options.body.action === "checkout",
        ),
      ).toBe(false);
    } finally {
      await act(async () => root.unmount());
      window.history.replaceState(null, "", "/");
      vi.unstubAllGlobals();
    }
  });
  it("a different app cannot get Launch's private acceptance offer", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/apps/other?acceptance=1");
    mock.invoke.mockReset().mockResolvedValue({
      data: { plan: null, entitlement: null },
      error: null,
    });
    const container = document.createElement("div"),
      root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <AppProfileBuyAction
            appId="other-app"
            appName="Other"
            websiteUrl="https://other.test"
          />,
        ),
      );
      expect(
        mock.invoke.mock.calls.some(
          ([name]) => name === "launch-rocket-acceptance",
        ),
      ).toBe(false);
      expect(container.querySelector("button")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      window.history.replaceState(null, "", "/");
      vi.unstubAllGlobals();
    }
  });
});

describe("multi-plan public checkout selection", () => {
  const offers = [
    {
      id: "monthly",
      name: "Pro",
      entitlement_key: "pro",
      amount_cents: 1900,
      currency: "usd",
      interval: "month",
      billing_type: "subscription",
    },
    {
      id: "annual",
      name: "Pro",
      entitlement_key: "pro",
      amount_cents: 21000,
      currency: "usd",
      interval: "year",
      billing_type: "subscription",
    },
  ];
  async function fixture(path = "/apps/example") {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", path);
    mock.user = { id: "buyer" };
    mock.invoke.mockReset().mockImplementation(async (_name, options) => ({
      data:
        options.body.action === "catalog"
          ? { plans: offers, plan: null }
          : options.body.action === "status"
            ? { plan: null, entitlement: null }
            : { error: "fixture_no_payment" },
      error: null,
    }));
    const container = document.createElement("div"),
      root = createRoot(container);
    await act(async () =>
      root.render(
        <AppProfileBuyAction
          appId="example"
          appName="Example"
          websiteUrl="https://merchant.example"
        />,
      ),
    );
    return {
      container,
      cleanup: async () => {
        await act(async () => root.unmount());
        window.history.replaceState(null, "", "/");
        vi.unstubAllGlobals();
      },
    };
  }
  it("waits for explicit choice, then sends the exact annual offer to canonical checkout", async () => {
    const h = await fixture();
    try {
      const button = h.container
        .querySelector("rocket-button")!
        .shadowRoot!.querySelector("button")!;
      expect(button.disabled).toBe(true);
      await act(async () =>
        h.container.querySelector<HTMLButtonElement>('[role="radio"]')!.click(),
      );
      await act(async () =>
        [...h.container.querySelectorAll("button")]
          .find((b) => b.textContent === "Annual")!
          .click(),
      );
      expect(h.container.textContent).toContain("$210.00/year");
      await act(async () =>
        h.container
          .querySelector("rocket-button")!
          .dispatchEvent(new Event("rocket-activate")),
      );
      expect(mock.invoke).toHaveBeenCalledWith("rocket-buy", {
        body: {
          action: "checkout",
          app_id: "example",
          offer_id: "annual",
          source: "marketplace",
        },
      });
    } finally {
      await h.cleanup();
    }
  });
  it("preserves a developer-site deep link's exact annual choice and source", async () => {
    const h = await fixture(
      "/apps/example?buy=1&offer=annual&source=developer_website#pricing",
    );
    try {
      expect(
        h.container.querySelector('[role="radio"][aria-checked="true"]')
          ?.textContent,
      ).toContain("$210.00/year");
      await act(async () =>
        h.container
          .querySelector("rocket-button")!
          .dispatchEvent(new Event("rocket-activate")),
      );
      expect(mock.invoke).toHaveBeenCalledWith("rocket-buy", {
        body: {
          action: "checkout",
          app_id: "example",
          offer_id: "annual",
          source: "developer_website",
        },
      });
    } finally {
      await h.cleanup();
    }
  });
  it("does not silently replace a stale offer URL with a different purchasable plan", async () => {
    const h = await fixture("/apps/example?buy=1&offer=unpublished#pricing");
    try {
      expect(h.container.querySelector('[aria-checked="true"]')).toBeNull();
      expect(
        h.container
          .querySelector("rocket-button")!
          .shadowRoot!.querySelector("button")!.disabled,
      ).toBe(true);
      expect(h.container.textContent).toContain("no longer available");
      expect(
        mock.invoke.mock.calls.some(([, o]) => o.body.action === "checkout"),
      ).toBe(false);
    } finally {
      await h.cleanup();
    }
  });
});

describe("seller checkout", () => {
  it("shows the published offer without offering its seller a checkout", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/apps/launch");
    mock.user = { id: "seller" };
    mock.invoke.mockReset().mockImplementation(async (_name, options) => ({
      data:
        options.body.action === "catalog"
          ? {
              plan: {
                id: "plan",
                name: "Launch Pro",
                amount_cents: 3900,
                currency: "usd",
                interval: null,
                billing_type: "one_time",
              },
              viewer_is_seller: true,
            }
          : { plan: null, entitlement: null },
      error: null,
    }));
    const container = document.createElement("div"),
      root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <AppProfileBuyAction
            appId={launch}
            appName="Launch"
            websiteUrl="https://trylaunch.ai"
          />,
        ),
      );
      expect(container.textContent).toContain("Launch Pro");
      expect(container.textContent).toContain("can’t buy your own app");
      expect(container.querySelector("rocket-button")).toBeNull();
      expect(
        mock.invoke.mock.calls.some(
          ([, options]) => options.body.action === "checkout",
        ),
      ).toBe(false);
    } finally {
      await act(async () => root.unmount());
      window.history.replaceState(null, "", "/");
      vi.unstubAllGlobals();
    }
  });

  it("explains an owner rejection returned by the checkout function", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/apps/launch");
    mock.user = { id: "seller" };
    mock.invoke.mockReset().mockImplementation(async (_name, options) => {
      if (options.body.action === "catalog")
        return {
          data: {
            plan: {
              id: "plan",
              name: "Launch Pro",
              amount_cents: 3900,
              currency: "usd",
              interval: null,
              billing_type: "one_time",
              product_key: "launch-pro",
              return_uri: "https://trylaunch.ai/return",
            },
          },
          error: null,
        };
      if (options.body.action === "checkout")
        return {
          data: null,
          error: {
            message: "Edge Function returned a non-2xx status code",
            context: new Response(
              JSON.stringify({ error: "cannot_buy_own_app" }),
              {
                status: 403,
              },
            ),
          },
        };
      return { data: { plan: null, entitlement: null }, error: null };
    });
    const container = document.createElement("div"),
      root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <AppProfileBuyAction
            appId={launch}
            appName="Launch"
            websiteUrl="https://trylaunch.ai"
          />,
        ),
      );
      await act(async () =>
        container
          .querySelector("rocket-button")!
          .dispatchEvent(new Event("rocket-activate")),
      );
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "You can't buy your own app",
      );
    } finally {
      await act(async () => root.unmount());
      window.history.replaceState(null, "", "/");
      vi.unstubAllGlobals();
    }
  });
});
