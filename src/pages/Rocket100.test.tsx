import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Rocket100 from "./Rocket100";
import type { Rocket100Data } from "@/routes/100";
import type { ReactNode } from "react";

vi.mock("@/components/SiteHeader", () => ({ default: () => <header>Rocket</header> }));
vi.mock("@/components/ProfileAvatarImage", () => ({ default: () => <span /> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => <a href={to} {...rest}>{children}</a> }));
afterEach(cleanup);

it("shows real zero participation without inventing builders or ranks", async () => {
  const data: Rocket100Data = { participants: 0, calculated_at: null, rows: [] };
  render(<Rocket100 data={data} />);
  expect(screen.getByText("Builders ranked by their MRR on Rocket.")).toBeTruthy();
  expect((await screen.findByRole("link", { name: "Join Rocket 100" })).getAttribute("href")).toBe("/signup?next=%2F100");
  expect(screen.getByText("0 / 100 builders")).toBeTruthy();
  expect(screen.getByRole("table", { name: "Rocket 100 leaderboard" })).toBeTruthy();
  expect(screen.getByText("No builders yet.")).toBeTruthy();
  expect(screen.queryByText("Rocket 100 member #001")).toBeNull();
});

it("shows public MRR and comparable growth without displaying a score or member number", () => {
  const data: Rocket100Data = { participants: 1, calculated_at: "2026-10-12T04:05:00Z", rows: [{ username: "builder", name: "A Builder", avatar_url: "", founding_number: 37, awarded_at: "2026-10-11T12:00:00Z", rank: 1, score: 72, popularity: 60, app_count: 2, mrr_minor: 125000, mrr_currency: "USD", mrr_growth_percent: 25 }] };
  render(<Rocket100 data={data} />);
  expect(screen.getByText("@builder")).toBeTruthy();
  expect(screen.queryByText(/Rocket 100 member #/)).toBeNull();
  expect(screen.queryByText(/founding builder/i)).toBeNull();
  expect(screen.getByText("#1")).toBeTruthy();
  expect(screen.getByText("$1.3K")).toBeTruthy();
  expect(screen.getByText("+25.0%")).toBeTruthy();
  expect(screen.queryByText("Score")).toBeNull();
  expect(screen.getByText("1 / 100 builders")).toBeTruthy();
});

it("does not invent revenue or growth when no public snapshot exists", () => {
  const data: Rocket100Data = { participants: 1, calculated_at: null, rows: [{ username: "builder", name: "A Builder", avatar_url: "", founding_number: 37, awarded_at: "2026-10-11T12:00:00Z", rank: 1, score: 72, popularity: 60, app_count: 2, mrr_minor: null, mrr_currency: null, mrr_growth_percent: null }] };
  render(<Rocket100 data={data} />);
  expect(screen.getAllByText("—")).toHaveLength(2);
});

it("sorts by public MRR and growth in both directions, keeping missing values last", () => {
  const builder = (username: string, rank: number, mrr_minor: number | null, mrr_growth_percent: number | null) => ({
    username, name: username, avatar_url: "", founding_number: rank, awarded_at: "2026-10-11T12:00:00Z",
    rank, score: null, popularity: null, app_count: 1, mrr_minor,
    mrr_currency: mrr_minor === null ? null : "USD", mrr_growth_percent,
  });
  const data: Rocket100Data = { participants: 4, calculated_at: null, rows: [
    builder("bravo", 1, 20000, -5), builder("alpha", 2, 10000, 10),
    builder("charlie", 3, 5000, null), builder("missing", 4, null, null),
  ] };
  render(<Rocket100 data={data} />);
  const order = () => Array.from(screen.getByRole("table").querySelectorAll(".rocket100-row"), (row) => row.getAttribute("href"));
  expect(order()).toEqual(["/@bravo", "/@alpha", "/@charlie", "/@missing"]);
  fireEvent.click(screen.getByRole("button", { name: /MRR/ }));
  expect(order()).toEqual(["/@bravo", "/@alpha", "/@charlie", "/@missing"]);
  expect(screen.getByRole("columnheader", { name: /MRR/ }).getAttribute("aria-sort")).toBe("descending");
  fireEvent.click(screen.getByRole("button", { name: /MRR/ }));
  expect(order()).toEqual(["/@charlie", "/@alpha", "/@bravo", "/@missing"]);
  fireEvent.click(screen.getByRole("button", { name: /Growth/ }));
  expect(order()).toEqual(["/@alpha", "/@bravo", "/@charlie", "/@missing"]);
  fireEvent.click(screen.getByRole("button", { name: /Growth/ }));
  expect(order()).toEqual(["/@bravo", "/@alpha", "/@charlie", "/@missing"]);
  fireEvent.click(screen.getByRole("button", { name: /Rank/ }));
  expect(order()).toEqual(["/@bravo", "/@alpha", "/@charlie", "/@missing"]);
});
