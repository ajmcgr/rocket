import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "@/test/MemoryRouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AddApp from "./AddApp";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke }, from: mocks.from },
}));

describe("AddApp", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.invoke.mockReset();
    mocks.from.mockReset();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("clears a successful lookup before showing an invalid URL error", async () => {
    let rejectInvalid!: (value: { data: { error: string }; error: null }) => void;
    mocks.invoke
      .mockResolvedValueOnce({ data: { status: "complete", app_id: "app-1", result: { outcome: "existing" } }, error: null })
      .mockImplementationOnce(() => new Promise((resolve) => { rejectInvalid = resolve; }));
    mocks.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: "app-1", name: "Known app", website_url: "https://known.example" },
      }) }) }),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const submit = async (url: string) => {
      const input = container.querySelector<HTMLInputElement>("#app-url")!;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setter.call(input, url);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    };

    try {
      await act(async () => { root.render(<MemoryRouter><AddApp /></MemoryRouter>); });
      await submit("https://known.example");
      expect(container.querySelector("h2")?.textContent).toBe("Known app");

      await submit("http://127.0.0.1/internal");
      expect(container.textContent).not.toContain("Known app");
      expect(container.textContent).not.toContain("This app is already on Rocket");
      expect(container.textContent).toContain("Finding your app");

      await act(async () => { rejectInvalid({ data: { error: "Only ordinary public HTTP(S) websites are supported" }, error: null }); });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("Only ordinary public HTTP(S) websites are supported");
      expect(container.textContent).not.toContain("Known app");
    } finally {
      await act(async () => { root.unmount(); });
      container.remove();
    }
  });
});
