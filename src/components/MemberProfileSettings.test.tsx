import { cleanup, render, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemberProfileSettings from "./MemberProfileSettings";
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), updateUser: vi.fn(), toast: vi.fn(), upload: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner-id", user_metadata: { username: "alex" } } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children }: any) => <a href={to}>{children}</a> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }), upsert: mocks.save }), auth: { updateUser: mocks.updateUser }, storage: { from: () => ({ upload: mocks.upload, getPublicUrl: () => ({ data: { publicUrl: "https://example.com/banner.png" } }) }) } } }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ data: null, error: null }); mocks.save.mockResolvedValue({ error: null }); mocks.updateUser.mockResolvedValue({ error: null }); mocks.upload.mockResolvedValue({ error: null }); });
describe("member settings", () => {
  it("uploads to an owner-scoped path and saves banner removal", async () => {
    const ui = render(<MemberProfileSettings />);
    await waitFor(() => expect(ui.queryByText("Loading profile…")).toBeNull());
    fireEvent.change(ui.getByLabelText("Profile banner"), { target: { files: [new File(["image"], "banner.png", { type: "image/png" })] } });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^owner-id\/banner_url-.*\.png$/), expect.any(File), { contentType: "image/png" }));
    await waitFor(() => expect(ui.getByText("Remove banner")).toBeTruthy());
    fireEvent.click(ui.getByText("Remove banner")); fireEvent.click(ui.getByText("Save profile"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ banner_url: "" }), expect.anything()));
  });
  it("saves all new fields and exposes the public link", async () => {
    const ui = render(<MemberProfileSettings />);
    await waitFor(() => expect(ui.queryByText("Loading profile…")).toBeNull());
    for (const label of ["Avatar", "Profile banner", "Username", "Full name", "Bio", "X username", "Instagram username", "LinkedIn username", "YouTube channel", "Telegram username", "Website"]) expect(ui.getByLabelText(label)).toBeTruthy();
    fireEvent.change(ui.getByLabelText("Full name"), { target: { value: "Alex" } });
    fireEvent.change(ui.getByLabelText("Website"), { target: { value: "example.com" } });
    fireEvent.click(ui.getByText("Save profile"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ user_id: "owner-id", full_name: "Alex", website: "https://example.com/" }), { onConflict: "user_id" }));
    expect(ui.getByRole("link", { name: "View public profile →" }).getAttribute("href")).toBe("/u/alex");
  });
  it("blocks saving after load errors", async () => {
    mocks.read.mockResolvedValue({ error: { message: "unavailable" } });
    const ui = render(<MemberProfileSettings />);
    await waitFor(() => expect(ui.getByRole("alert")).toBeTruthy());
    fireEvent.click(ui.getByText("Save profile")); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("reports username conflicts without publishing a link", async () => {
    mocks.save.mockResolvedValue({ error: { code: "23505" } });
    const ui = render(<MemberProfileSettings />);
    await waitFor(() => expect(ui.queryByText("Loading profile…")).toBeNull());
    fireEvent.click(ui.getByText("Save profile"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "That username is already taken." })));
    expect(ui.queryByRole("link")).toBeNull(); expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
