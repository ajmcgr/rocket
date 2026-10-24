// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MyApp } from "@/components/AppJourney";

const mocks = vi.hoisted(() => ({
  user: { id: "submitter" } as { id: string } | null,
  loading: false,
  load: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks }));
vi.mock("@/lib/myApps", () => ({ loadMyApps: mocks.load }));
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/RocketShare", () => ({
  default: () => <button>Share your app</button>,
}));
import AppSubmissionSuccess from "./AppSubmissionSuccess";

const appId = "12345678-abcd-4000-8000-123456789abc";
const item = (changes: Partial<MyApp> = {}): MyApp => ({
  id: "claim",
  app_id: appId,
  status: "pending",
  verification_state: "pending",
  owned: false,
  owner_verification_level: null,
  app: { name: "Example" },
  ...changes,
});
const props = { appId, slug: "example", name: "Example", onViewApp: vi.fn() };
beforeEach(() => {
  mocks.user = { id: "submitter" };
  mocks.loading = false;
  mocks.load.mockReset().mockResolvedValue([]);
  props.onViewApp.mockClear();
});
afterEach(cleanup);

it("keeps publication, optional sharing and view actions without a membership check", async () => {
  render(<AppSubmissionSuccess {...props} />);
  expect(
    screen.getByRole("heading", { name: "Your app is live on Rocket!" }),
  ).toBeTruthy();
  expect(screen.getByText("Sell your app with Buy with Rocket")).toBeTruthy();
  expect(
    await screen.findByRole("link", { name: "Verify ownership" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Share your app" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "View your app" }));
  expect(props.onViewApp).toHaveBeenCalledOnce();
  expect(mocks.load).toHaveBeenCalledOnce();
});

it.each(["claimed", "domain_verified"])(
  "routes a confirmed %s owner directly to the canonical app setup",
  async (level) => {
    mocks.load.mockResolvedValue([
      item({
        owned: true,
        status: "verified",
        owner_verification_level: level,
      }),
    ]);
    render(<AppSubmissionSuccess {...props} />);
    const link = await screen.findByRole("link", {
      name: "Set up monetization",
    });
    expect(link.getAttribute("href")).toBe(`/buy-with-rocket?app=${appId}`);
    expect(screen.queryByRole("link", { name: "Verify ownership" })).toBeNull();
  },
);

it.each(["pending", "review"])(
  "sends a %s claim to existing ownership verification",
  async (status) => {
    mocks.load.mockResolvedValue([item({ status })]);
    render(<AppSubmissionSuccess {...props} />);
    expect(
      (
        await screen.findByRole("link", { name: "Verify ownership" })
      ).getAttribute("href"),
    ).toBe(`/apps/add?app=${appId}`);
    expect(
      screen.getByText("Verify your app ownership to enable monetization."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Set up monetization" }),
    ).toBeNull();
  },
);

it("does not authorize from a verification label without current ownership or another app", async () => {
  mocks.load.mockResolvedValue([
    item({ owned: false, owner_verification_level: "domain_verified" }),
    item({
      app_id: "other-app",
      owned: true,
      owner_verification_level: "domain_verified",
    }),
  ]);
  render(<AppSubmissionSuccess {...props} />);
  await screen.findByRole("link", { name: "Verify ownership" });
  expect(
    screen.queryByRole("link", { name: "Set up monetization" }),
  ).toBeNull();
});

it("has no merchant action while signed out or ownership is unavailable", async () => {
  mocks.user = null;
  const { rerender } = render(<AppSubmissionSuccess {...props} />);
  expect(mocks.load).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("link", { name: "Set up monetization" }),
  ).toBeNull();
  mocks.user = { id: "submitter" };
  mocks.load.mockRejectedValue(new Error("Unavailable"));
  rerender(<AppSubmissionSuccess {...props} />);
  await screen.findByRole("link", { name: "My Apps" });
  expect(
    screen.queryByRole("link", { name: "Set up monetization" }),
  ).toBeNull();
});

it("ignores delayed ownership responses after an account or app change", async () => {
  let resolve!: (items: MyApp[]) => void;
  mocks.load.mockReturnValueOnce(
    new Promise<MyApp[]>((done) => {
      resolve = done;
    }),
  );
  const { rerender } = render(<AppSubmissionSuccess {...props} />);
  mocks.user = { id: "other-user" };
  rerender(<AppSubmissionSuccess {...props} appId="different-app" />);
  await screen.findByRole("link", { name: "Verify ownership" });
  await act(async () =>
    resolve([
      item({ owned: true, owner_verification_level: "domain_verified" }),
    ]),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: "Set up monetization" }),
    ).toBeNull(),
  );
});
