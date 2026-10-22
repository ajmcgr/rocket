import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/test/MemoryRouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LaunchPreview from "./LaunchPreview";
import { emptySubmission } from "../../supabase/functions/_shared/appSubmission";
import { track } from "@/lib/analytics";
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
    ...(outcome === "existing" ? { id: "existing-app-id" } : {}),
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
  await screen.findByText("Submit my app.");
  return result;
};
describe("Rocket app submission", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("scrollTo", vi.fn());
    mocks.invoke.mockReset();
    mocks.user = null;
    vi.mocked(track).mockClear();
    sessionStorage.clear();
  });
  it("offers public discovery before the submission form", async () => {
    await mount();
    const notice = screen.getByRole("region", {
      name: "Already listed on Rocket?",
    });
    expect(
      screen
        .getByRole("link", { name: "Find & Claim Your App →" })
        .getAttribute("href"),
    ).toBe("/discover?view=all");
    expect(
      notice.compareDocumentPosition(
        screen.getByRole("region", { name: "AI-assisted app submission" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mocks.invoke).not.toHaveBeenCalled();
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
      screen.getByRole("link", { name: "Claim This App" }).getAttribute("href"),
    ).toBe("/apps/add?app=existing-app-id");
    expect(screen.queryByRole("button", { name: "Publish app" })).toBeNull();
  });
  it("closes an editable draft when its URL resolves to an existing listing", async () => {
    mocks.invoke.mockResolvedValue({ data: preview("existing"), error: null });
    await mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Add details manually" }),
    );
    fireEvent.change(screen.getByPlaceholderText("https://yourapp.com"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add with AI" }));
    await screen.findByText("Already on Rocket");
    expect(screen.queryByLabelText("App name *")).toBeNull();
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });
  it("sends a match discovered at publish time to the existing claim flow", async () => {
    mocks.user = { id: "owner" };
    sessionStorage.setItem(
      "rocket:launch-preview-v1",
      JSON.stringify({ ...preview(), publishAfterAuth: true }),
    );
    mocks.invoke.mockResolvedValue({
      data: { app_id: "existing-app-id", published: true, existing: true },
      error: null,
    });
    render(
      <MemoryRouter initialEntries={["/submit"]}>
        <Routes>
          <Route path="/submit" element={<LaunchPreview />} />
          <Route path="/apps/add" element={<h1>Existing claim flow</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Existing claim flow");
    expect(track).toHaveBeenCalledWith("launch_existing_app_resolved", {
      app_id: "existing-app-id",
    });
    expect(track).not.toHaveBeenCalledWith(
      "launch_new_app_created",
      expect.anything(),
    );
    expect(sessionStorage.getItem("rocket:just-published")).toBeNull();
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
    fireEvent.change(screen.getByLabelText(/^App icon \*/), {
      target: { value: "https://example.com/icon.png" },
    });
    fireEvent.change(screen.getByLabelText(/^Hero image \*/), {
      target: { value: "https://example.com/hero.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "at least one app screenshot",
    );
    fireEvent.change(screen.getByLabelText(/^Screenshot URLs/), {
      target: { value: "https://example.com/screenshot.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByRole("alert")).toBeNull();
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
      screenshots: ["https://example.com/screenshot.png"],
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
