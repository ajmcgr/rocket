import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "@/test/MemoryRouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LaunchPreview from "./LaunchPreview";
import { emptySubmission } from "../../supabase/functions/_shared/appSubmission";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  user: null as null | { id: string },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));
vi.mock("@/components/SiteHeader", () => ({ default: () => <div /> }));
vi.mock("@/components/SiteFooter", () => ({ default: () => <div /> }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
const preview = (outcome = "new") => ({
  token: "a".repeat(43),
  expires_at: new Date(Date.now() + 100000).toISOString(),
  outcome,
  app: {
    name: "Example",
    description: "A useful public product for teams",
    website_url: "https://example.com",
    logo_url: null,
    categories: ["Productivity"],
  },
});
const mount = async () => {
  const result = render(
    <MemoryRouter>
      <LaunchPreview />
    </MemoryRouter>,
  );
  await screen.findByText("Submit your app.");
  return result;
};
describe("Rocket app submission", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("scrollTo", vi.fn());
    mocks.invoke.mockReset();
    mocks.user = null;
    sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });
  it("fills the editable flow before authentication without creating an app", async () => {
    mocks.invoke.mockResolvedValue({ data: preview(), error: null });
    await mount();
    fireEvent.change(screen.getByPlaceholderText("https://yourapp.com"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add with AI" }));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Example")).toBeTruthy(),
    );
    expect(screen.getByText(/We found your app/)).toBeTruthy();
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.invoke.mock.calls[0][1].body.action).toBe("preview");
    expect(sessionStorage.getItem("rocket:app-submission-v2")).toContain(
      "Example",
    );
  });
  it("lets failed automatic imports continue manually", async () => {
    mocks.invoke.mockResolvedValue({
      data: { error: "Website request timed out" },
      error: null,
    });
    await mount();
    fireEvent.change(screen.getByPlaceholderText("https://yourapp.com"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add with AI" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("timed out"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit manually" }));
    expect(screen.getByLabelText("App name *")).toBeTruthy();
  });
  it("does not offer a duplicate submission or overwrite an existing listing", async () => {
    mocks.invoke.mockResolvedValue({ data: preview("existing"), error: null });
    await mount();
    fireEvent.change(screen.getByPlaceholderText("https://yourapp.com"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add with AI" }));
    await waitFor(() =>
      expect(screen.getByText("Already on Rocket")).toBeTruthy(),
    );
    expect(
      screen
        .getByRole("link", { name: "Claim existing app" })
        .getAttribute("href"),
    ).toContain("url=");
    expect(screen.queryByRole("button", { name: "Publish app" })).toBeNull();
  });
  it("requires media and uses four steps with no scheduling or plan picker", async () => {
    await mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Add details manually" }),
    );
    expect(screen.queryByText("What type of submission is this?")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Community submission/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Founder submission/ }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("App name *"), {
      target: { value: "Example" },
    });
    fireEvent.change(screen.getByLabelText(/Tagline/), {
      target: { value: "Useful software for teams" },
    });
    fireEvent.change(screen.getByLabelText("Website URL *"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText(/Upload app icon/)).toBeTruthy();
    expect(screen.getByLabelText(/Upload hero image/)).toBeTruthy();
    expect(screen.getByLabelText(/Demo video URL/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "app icon and hero image",
    );
    expect(screen.queryByText("Choose Your Plan")).toBeNull();
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });
  it("publishes reviewed details and requests immediate publishing only after confirmation", async () => {
    mocks.user = { id: "owner" };
    const details = {
      ...emptySubmission(),
      name: "Example",
      tagline: "Useful software",
      description: "A useful app for people working in teams.",
      logo_url: "https://example.com/icon.png",
      hero_url: "https://example.com/hero.png",
      categories: ["Productivity"],
      platforms: ["web"],
      slug: "example",
    };
    sessionStorage.setItem(
      "rocket:app-submission-v2",
      JSON.stringify({
        url: "https://example.com",
        details: { ...details, submission_type: "community" },
        step: 3,
        editing: true,
      }),
    );
    mocks.invoke
      .mockResolvedValueOnce({ data: preview(), error: null })
      .mockResolvedValueOnce({
        data: { app_id: "app", slug: "example", published: true },
        error: null,
      });
    await mount();
    expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish app" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2));
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({
      action: "preview",
      manual: true,
      details,
    });
    expect(mocks.invoke.mock.calls[1][1].body).toMatchObject({
      action: "consume_preview",
      publish: true,
    });
  });
});
