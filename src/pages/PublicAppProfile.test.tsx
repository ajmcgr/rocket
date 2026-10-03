// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Tables } from "@/integrations/supabase/types";

vi.mock("@/lib/router-compat", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useParams: () => ({ id: "whisperit" }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useDocumentMeta", () => ({ useDocumentMeta: vi.fn() }));
vi.mock("@/components/SiteHeader", () => ({ default: () => null }));
vi.mock("@/components/SiteFooter", () => ({ default: () => null }));
vi.mock("@/components/AppReviews", () => ({ default: () => null }));
vi.mock("@/components/AppProfileBuyAction", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: vi.fn(() => { const q: Record<string, unknown> = { then: () => new Promise(() => {}) }; for (const key of ["select", "eq", "in", "order", "limit", "contains", "neq", "maybeSingle"]) q[key] = () => q; return q; }),
} }));
import PublicAppProfile from "./PublicAppProfile";
const app = { id: "app1", slug: "whisperit", name: "Whisperit", tagline: "Useful software", description: "Real description", categories: ["Productivity"], tags: [], platforms: ["web"], website_url: "https://whisperit.ai", canonical_host: "whisperit.ai", logo_url: null } as Tables<"public_apps">;
afterEach(cleanup);
it("includes useful profile identity in server-rendered HTML", () => {
  const html = renderToStaticMarkup(<PublicAppProfile initialApp={app} />);
  expect(html).toContain("Whisperit");
  expect(html).toContain("Visit website");
  expect(html).not.toContain('aria-label="Loading app profile"');
});
it("does not hide the profile while optional queries remain pending", () => {
  render(<PublicAppProfile initialApp={app} />);
  expect(screen.getByRole("heading", { name: "Whisperit", level: 1 })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Visit website/ })).toBeTruthy();
});
