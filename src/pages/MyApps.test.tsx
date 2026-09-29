import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppJourney from "@/components/AppJourney";

const item = {
  id: "claim-1", app_id: "app-1", status: "verified", verification_state: "domain_verified",
  owned: false, owner_verification_level: null,
  app: { name: "Example", website_url: "https://example.com" },
};

describe("My Apps developer journey", () => {
  const render = async (owned: boolean) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<MemoryRouter><AppJourney item={{ ...item, owned, owner_verification_level: owned ? "domain_verified" : null }} /></MemoryRouter>); });
    return { container, cleanup: async () => { await act(async () => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); } };
  };

  it("does not claim ownership from a stale verified claim after owner revocation", async () => {
    const { container, cleanup } = await render(false);
    try {
      expect(container.textContent).toContain("Not yet verified");
      expect(container.textContent).toContain("Verification required");
      expect(container.textContent).not.toContain("Domain verified");
    } finally { await cleanup(); }
  });

  it("shows domain verification only for an active owner relationship", async () => {
    const { container, cleanup } = await render(true);
    try {
      expect(container.textContent).toContain("Domain verified");
      expect(container.textContent).toContain("Google Analytics settings");
    } finally { await cleanup(); }
  });
});
