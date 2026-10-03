import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import AdminDeveloperTesting from "./AdminDeveloperTesting";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

describe("admin-only developer testing surface", () => {
  it("does not expose invitation controls when the server denies operator permission", async () => {
    invoke.mockClear();
    invoke.mockResolvedValue({ data: { operator: false }, error: null });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    const root = createRoot(element);
    try {
      await act(async () => root.render(<AdminDeveloperTesting />));
      expect(element.querySelector("form")).toBeNull();
      expect(element.textContent).toContain("authorized developer operator");
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
  it("exposes internal tools only after the server confirms operator permission", async () => {
    invoke.mockClear();
    invoke.mockResolvedValue({ data: { operator: true }, error: null });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    const root = createRoot(element);
    try {
      await act(async () => root.render(<AdminDeveloperTesting />));
      expect(element.querySelector('input[type="email"]')).not.toBeNull();
      expect(element.textContent).toContain("Create test invitation");
      expect(invoke).toHaveBeenCalledWith("rocket-connect-developer", {
        method: "GET",
      });
      expect(invoke).toHaveBeenCalledTimes(1); // Never create/send an invitation on page load.
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
