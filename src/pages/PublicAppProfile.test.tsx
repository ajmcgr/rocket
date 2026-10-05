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
import { supabase } from "@/integrations/supabase/client";
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
it("places public traffic and revenue before the screenshot gallery", async () => {
  vi.mocked(supabase.from).mockImplementation((table) => {
    const data = table === "public_app_traction"
      ? [{ metric_type: "views", visibility: "verified_only", metric_date: "2026-10-04", last_verified_at: "2026-10-05T09:03:35Z" }]
      : table === "public_app_revenue"
        ? [{ currency: "usd", visibility: "verified_only", observed_at: "2026-10-05T09:03:35Z" }]
        : [];
    const result = Promise.resolve({ data, error: null });
    const q: Record<string, unknown> = { then: result.then.bind(result) };
    for (const key of ["select", "eq", "in", "order", "limit", "contains", "neq", "maybeSingle"]) q[key] = () => q;
    return q as never;
  });
  render(<PublicAppProfile initialApp={app} initialMedia={[{
    id: "screenshot1", app_id: app.id, media_type: "screenshot", source_type: "owner",
    source_url: "https://whisperit.ai/screenshot.png", sort_order: 0,
  } as never]} />);
  const traffic = await screen.findByRole("heading", { name: "Traffic" });
  const revenue = await screen.findByRole("heading", { name: "Subscription revenue" });
  const gallery = screen.getByRole("heading", { name: "See Whisperit in action" });
  expect(traffic.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(revenue.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
