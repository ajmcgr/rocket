import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PublicMemberProfile from "./PublicMemberProfile";
import { profileFromData } from "@/lib/memberProfile";
vi.mock("@/components/SiteHeader", () => ({ default: () => <header>Rocket</header> }));
vi.mock("@/components/PublicMemberApps", () => ({ default: ({ username }: { username: string }) => <section>Public apps for {username}</section> }));
afterEach(cleanup);
it("renders published fields and safe social links without private data", () => {
  const ui = render(<PublicMemberProfile profile={profileFromData({ username: "alex", full_name: "Alex", bio: "Builder", website: "javascript:alert(1)", x_username: "alex", email: "private@example.com" })} />);
  expect(ui.getByText("Builder")).toBeTruthy(); expect(ui.getByRole("link", { name: "X ↗" }).getAttribute("href")).toBe("https://x.com/alex");
  expect(ui.getByText("Public apps for alex")).toBeTruthy();
  expect(ui.queryByRole("link", { name: "Website ↗" })).toBeNull(); expect(ui.queryByText("private@example.com")).toBeNull();
});
it("handles missing profiles", () => { const ui = render(<PublicMemberProfile profile={null} />); expect(ui.getByText("Profile not found")).toBeTruthy(); });
