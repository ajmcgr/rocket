import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "@/test/MemoryRouter";
import DeveloperRedirect from "./DeveloperRedirect";
import { useLocation } from "@/lib/router-compat";
function Destination() {
  const location = useLocation();
  return (
    <div data-testid="destination">
      {location.pathname}
      {location.search}
    </div>
  );
}
afterEach(cleanup);
describe("legacy Developer links", () => {
  it.each([
    ["/developer?app=owned#rocket-id", "/rocket-id?app=owned"],
    ["/developer?app=owned#buy-with-rocket", "/buy-with-rocket?app=owned"],
    ["/developer?checkout=success", "/settings/developer?checkout=success"],
    ["/developer", "/settings/developer"],
  ])("redirects %s to %s", async (from, target) => {
    vi.stubGlobal("scrollTo", vi.fn());
    const { getByTestId } = render(
      <MemoryRouter initialEntries={[from]}>
        <Routes>
          <Route path="/developer" element={<DeveloperRedirect />} />
          <Route path="/rocket-id" element={<Destination />} />
          <Route path="/buy-with-rocket" element={<Destination />} />
          <Route path="/settings/developer" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(getByTestId("destination").textContent).toBe(target),
    );
    vi.unstubAllGlobals();
  });
});
