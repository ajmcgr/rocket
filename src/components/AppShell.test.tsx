import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import { useLocation } from "@/lib/router-compat";
import AppShell, { useAppShell } from "./AppShell";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "owner", email: "owner@example.com" },
    loading: false,
    signOut: vi.fn(),
  }),
}));
vi.mock("@/hooks/useMyProfileHref", () => ({
  useMyProfileHref: () => "/u/owner",
}));
vi.mock("./OnboardingTour", () => ({ default: () => null }));
vi.mock("./CommandPalette", () => ({ default: () => null }));
vi.mock("./LanguageSelector", () => ({
  default: () => <button>Choose language</button>,
}));
vi.mock("./ThemeToggle", () => ({
  default: () => <button>Choose theme</button>,
}));
vi.mock("./Logo", () => ({ default: () => <a href="/">rocket</a> }));
vi.mock("./NotificationsBell", () => ({
  default: () => <button aria-label="Notifications">Notifications</button>,
}));
vi.mock("./WorkspaceSwitcher", () => ({
  default: () => <button>Personal workspace</button>,
}));
vi.mock("./ShareExportModal", () => ({ default: () => null }));
vi.mock("@/lib/router-compat", async (original) => ({
  ...(await original<any>()),
  Outlet: () => <EditorControls />,
}));

function EditorControls() {
  const { setHeaderLeft, setHeaderCenter, setHeaderActions } = useAppShell();
  const location = useLocation();
  return (
    <>
      <p>Page content</p>
      <p data-testid="current-route">
        {location.pathname}
        {location.search}
      </p>
      <button
        onClick={() => {
          setHeaderLeft(<button>File</button>);
          setHeaderCenter(<button>Rename design</button>);
          setHeaderActions(<button>Export design</button>);
        }}
      >
        Open design
      </button>
      <button
        onClick={() => {
          setHeaderLeft(null);
          setHeaderCenter(null);
          setHeaderActions(null);
        }}
      >
        Leave design
      </button>
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("uses one standard header/sidebar and keeps search and mobile navigation available on protected pages", async () => {
  render(
    <MemoryRouter initialEntries={["/your-apps"]}>
      <AppShell />
    </MemoryRouter>,
  );
  await screen.findByText("Page content");
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(
    screen.getAllByRole("navigation", { name: "Marketplace" }),
  ).toHaveLength(1);
  expect(
    screen.getByRole("link", { name: "Rising" }).getAttribute("href"),
  ).toBe("/rising");
  expect(screen.getByRole("link", { name: "Saved" }).getAttribute("href")).toBe(
    "/my-collections",
  );
  expect(screen.getByRole("link", { name: "New" })).toBeTruthy();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search apps and categories" }),
    { target: { value: "tools" } },
  );
  fireEvent.submit(screen.getByRole("search"));
  await waitFor(() =>
    expect(screen.getByTestId("current-route").textContent).toBe(
      "/discover?q=tools",
    ),
  );
  expect(
    screen.getAllByRole("navigation", { name: "Mobile primary" }),
  ).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Account menu" })).toBeTruthy();
});

it("preserves editor header controls and restores site search when leaving the editor", async () => {
  render(
    <MemoryRouter initialEntries={["/editor"]}>
      <AppShell />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Open design" }));
  expect(
    screen.getByRole("button", { name: "File" }).closest("header"),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Rename design" }).closest("header"),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Export design" }).closest("header"),
  ).toBeTruthy();
  expect(screen.queryByRole("search")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Leave design" }));
  expect(screen.getByRole("search")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "File" })).toBeNull();
});

it("keeps workspace selection in the shared account menu without duplicate header actions", async () => {
  render(
    <MemoryRouter initialEntries={["/create"]}>
      <AppShell />
    </MemoryRouter>,
  );
  fireEvent.keyDown(
    await screen.findByRole("button", { name: "Account menu" }),
    { key: "Enter" },
  );
  expect(
    await screen.findByRole("button", { name: "Personal workspace" }),
  ).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Notifications" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Share Rocket" })).toBeNull();
});
