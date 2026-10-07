// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: null, loading: true }) }));
vi.mock("@/lib/router-compat", () => ({ useNavigate: () => vi.fn() }));
import { ConsentLogo, publicLogoUrl } from "./RocketConnectAuthorize";
afterEach(cleanup);

it("accepts only valid public HTTPS logo URLs", () => {
  for (const url of [null, "", "invalid", "javascript:alert(1)", "http://example.com/logo.png", "https://user:password@example.com/logo.png"]) expect(publicLogoUrl(url)).toBeNull();
  expect(publicLogoUrl("https://example.com/logo.png")).toBe("https://example.com/logo.png");
});

it("prefers the registered icon and retries the bound public app logo before falling back", () => {
  render(<ConsentLogo name="Launch" configuredUrl="https://example.com/configured.png" publicUrl="https://example.com/public.png" />);
  const image = screen.getByRole("img", { name: "Launch logo" });
  expect(image.getAttribute("src")).toBe("https://example.com/configured.png");
  fireEvent.error(image);
  expect(image.getAttribute("src")).toBe("https://example.com/public.png");
  fireEvent.error(image);
  expect(screen.queryByRole("img")).toBeNull();
});

it("renders the public app logo when the registered icon is missing", () => {
  render(<ConsentLogo name="Launch" publicUrl="https://example.com/launch.png" />);
  expect(screen.getByRole("img", { name: "Launch logo" }).getAttribute("src")).toBe("https://example.com/launch.png");
});