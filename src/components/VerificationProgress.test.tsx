import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import VerificationProgress from "./VerificationProgress";

const { invoke, track } = vi.hoisted(() => ({ invoke: vi.fn(), track: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/lib/analytics", () => ({ track }));
vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children, onClick }: { to: string; children: React.ReactNode; onClick?: () => void }) => <a href={to} onClick={(event: React.MouseEvent) => { event.preventDefault(); onClick?.(); }}>{children}</a> }));
vi.mock("@/components/RocketShare", () => ({ default: ({ label, onOpen }: { label: string; onOpen: () => void }) => <button onClick={onOpen}>{label}</button> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { appId: "app-1", kind: "revenue" as const, provider: "stripe" as const, connected: true, status: "active", successfulSync: new Date().toISOString(), visibility: "private" };

it("keeps pending and failed connections from claiming verification", async () => {
  invoke.mockResolvedValue({ data: { revenue_provider: "stripe" }, error: null });
  const { rerender } = render(<VerificationProgress {...props} successfulSync={null} />);
  expect(await screen.findByText(/Connection successful/)).toBeTruthy();
  expect(screen.queryByText(/Share verified profile/)).toBeNull();
  rerender(<VerificationProgress {...props} lastError="sync failed" />);
  expect(await screen.findByText(/couldn't verify/)).toBeTruthy();
  expect(screen.queryByText(/Share verified profile/)).toBeNull();
});

it("shows private, badge-only, and public states without numeric values in events", async () => {
  invoke.mockResolvedValue({ data: { revenue_provider: "stripe" }, error: null });
  const { rerender } = render(<VerificationProgress {...props} />);
  expect(await screen.findByText(/verified and private/)).toBeTruthy();
  const preview = screen.getByRole("link", { name: "Preview public profile" });
  expect(preview.getAttribute("href")).toBe("/apps/app-1");
  fireEvent.click(preview);
  fireEvent.click(screen.getByRole("button", { name: "Share app" }));
  rerender(<VerificationProgress {...props} visibility="verified_only" />);
  expect(await screen.findByText(/verification status is visible/)).toBeTruthy();
  expect(screen.getByText(/amount remains private/)).toBeTruthy();
  rerender(<VerificationProgress {...props} visibility="exact" />);
  expect(await screen.findByText(/now visible on your Rocket listing/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Share verified profile" }));
  expect(track.mock.calls.map(([event]) => event)).toEqual([
    "verification_profile_preview_clicked", "verification_share_clicked", "verification_share_clicked",
  ]);
  expect(JSON.stringify(track.mock.calls)).not.toMatch(/value_minor|revenue_amount|metric_value/);
});

it("does not expose another or unselected source when selection lookup fails", async () => {
  invoke.mockResolvedValueOnce({ data: { revenue_provider: "revenuecat" }, error: null });
  const { rerender } = render(<VerificationProgress {...props} visibility="exact" />);
  expect(await screen.findByText(/synced privately/)).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Preview public profile" })).toBeNull();
  invoke.mockResolvedValueOnce({ data: null, error: new Error("forbidden") });
  rerender(<VerificationProgress {...props} successfulSync={new Date(Date.now() + 1000).toISOString()} />);
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(/now visible/)).toBeNull();
});
