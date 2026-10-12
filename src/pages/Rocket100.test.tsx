import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Rocket100 from "./Rocket100";
import type { Rocket100Data } from "@/routes/100";
import type { ReactNode } from "react";

vi.mock("@/components/SiteHeader", () => ({ default: () => <header>Rocket</header> }));
vi.mock("@/components/SiteFooter", () => ({ default: () => <footer /> }));
vi.mock("@/components/ProfileAvatarImage", () => ({ default: () => <span /> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => <a href={to} {...rest}>{children}</a> }));
afterEach(cleanup);

it("shows real zero participation without inventing founders or ranks", async () => {
  const data: Rocket100Data = { participants: 0, calculated_at: null, rows: [] };
  render(<Rocket100 data={data} />);
  expect(screen.getByText("100 places remaining")).toBeTruthy();
  expect(screen.getByText("The first places are open.")).toBeTruthy();
  expect(screen.queryByText("Founding Builder #001")).toBeNull();
});

it("keeps permanent numbers distinct from dynamic ranks and scores", () => {
  const data: Rocket100Data = { participants: 1, calculated_at: "2026-10-12T04:05:00Z", rows: [{ username: "builder", name: "A Builder", avatar_url: "", founding_number: 37, awarded_at: "2026-10-11T12:00:00Z", rank: 1, score: 72, popularity: 60, app_count: 2 }] };
  render(<Rocket100 data={data} />);
  expect(screen.getByText("Founding Builder #037", { exact: false })).toBeTruthy();
  expect(screen.getByText("#1")).toBeTruthy();
  expect(screen.getByText("72")).toBeTruthy();
  expect(screen.getByText("99 places remaining")).toBeTruthy();
});
