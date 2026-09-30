import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewsletterCta from "./NewsletterCta";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

describe("global Beehiiv signup", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.invoke.mockReset();
    mocks.toast.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const setup = async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<NewsletterCta />));
    const submit = async () => {
      const input = container.querySelector<HTMLInputElement>('input[type="email"]')!;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setter.call(input, "reader@example.com");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    };
    const cleanup = async () => {
      await act(async () => root.unmount());
      container.remove();
    };
    return { container, submit, cleanup };
  };

  it("submits through the existing Beehiiv function and confirms success", async () => {
    mocks.invoke.mockResolvedValue({ error: null });
    const { container, submit, cleanup } = await setup();
    try {
      await submit();
      expect(mocks.invoke).toHaveBeenCalledWith("beehiiv-subscribe", {
        body: { email: "reader@example.com" },
      });
      expect(container.querySelector('[role="status"]')?.textContent).toContain("Thanks for subscribing");
      expect(container.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe("");
    } finally {
      await cleanup();
    }
  });

  it("shows a retry message when the function fails", async () => {
    mocks.invoke.mockResolvedValue({ error: new Error("Unavailable") });
    const { container, submit, cleanup } = await setup();
    try {
      await submit();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("Please try again");
    } finally {
      await cleanup();
    }
  });
});
