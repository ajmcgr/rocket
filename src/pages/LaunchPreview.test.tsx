import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "@/test/MemoryRouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LaunchPreview from "./LaunchPreview";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  user: null as null | { id: string },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));
vi.mock("@/components/SiteHeader", () => ({ default: () => <div /> }));
vi.mock("@/components/SiteFooter", () => ({ default: () => <div /> }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

describe("signed-out Launch preview", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.invoke.mockReset();
    mocks.user = null;
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("shows extracted value before authentication without creating an app", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        token: "a".repeat(43),
        expires_at: new Date(Date.now() + 100000).toISOString(),
        outcome: "new",
        app: {
          name: "Example",
          description: "A useful public product",
          website_url: "https://example.com",
          logo_url: null,
          categories: [],
        },
      },
      error: null,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <LaunchPreview />
          </MemoryRouter>,
        );
      });
      expect(container.textContent).toContain("Submit your app.");
      expect(container.textContent).toContain("URLs Rocket can use to submit apps");
      expect(container.textContent).toContain("Product Hunt, Apple App Store, and Google Play listing URLs are not supported yet.");
      const input = container.querySelector<HTMLInputElement>("#launch-url")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(input, "https://example.com");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        container
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      });
      expect(container.textContent).toContain("We found your app");
      expect(container.textContent).toContain("Example");
      expect(mocks.invoke).toHaveBeenCalledOnce();
      expect(mocks.invoke.mock.calls[0][1].body.action).toBe("preview");
      expect(sessionStorage.getItem("rocket:launch-preview-v1")).toContain(
        "example.com",
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
