import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "@/lib/router-compat";
import { describe, expect, it, vi } from "vitest";
import CreateEntry from "./CreateEntry";

vi.mock("./Generate", () => ({ default: () => <p>Existing generation flow</p> }));

const renderRoute = async (path: string) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/create" element={<CreateEntry />} />
      <Route path="/logos" element={<p>Logo Designer route</p>} />
      <Route path="/icons" element={<p>Icon Designer route</p>} />
    </Routes></MemoryRouter>);
  });
  return { container, cleanup: async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); } };
};

describe("Create entry navigation", () => {
  it("shows the creative hub for the new primary destination", async () => {
    const { container, cleanup } = await renderRoute("/create");
    try {
      expect(container.textContent).toContain("Create your brand");
      for (const path of ["/logos", "/icons", "/wizard", "/templates", "/saved", "/brands", "/editor"]) {
        expect(container.querySelector(`a[href="${path}"]`)).not.toBeNull();
      }
    } finally { await cleanup(); }
  });

  it("keeps parameterized generation and legacy designer deep links working", async () => {
    const generated = await renderRoute("/create?prompt=an%20app");
    try { expect(generated.container.textContent).toContain("Existing generation flow"); }
    finally { await generated.cleanup(); }

    const icon = await renderRoute("/create?asset_type=icon");
    try { expect(icon.container.textContent).toContain("Icon Designer route"); }
    finally { await icon.cleanup(); }
  });
});
