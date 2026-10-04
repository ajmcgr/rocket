import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ShareExportModal from "./ShareExportModal";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/exporters", () => ({ exportAsset: vi.fn(), formatsForAsset: () => [], FORMAT_LABEL: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("site share card", () => {
  it("shares the exact new tagline with the site link", async () => {
    const source = readFileSync("src/components/AppShell.tsx", "utf8");
    const title = source.match(/id: "site", title: "([^"]+)"/)?.[1];
    expect(title).toBe("The open app platform.");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const ui = render(<ShareExportModal open onOpenChange={vi.fn()} asset={{ id: "site", title: title! }} onCreateShareLink={async () => "https://tryrocket.ai"} />);
    fireEvent.click(ui.getByRole("button", { name: "X", exact: true }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    const url = new URL(String(open.mock.calls[0][0]));
    expect(url.searchParams.get("text")).toBe("The open app platform.");
    expect(url.searchParams.get("url")).toBe("https://tryrocket.ai");
    expect(ui.getByRole("dialog").className).toContain("gentle-dialog-content");
    expect(ui.getByRole("button", { name: "Close" })).toBeTruthy();
  });
  it("uses small vertical movement and respects reduced motion", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain("transform: translateY(6px)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain('.gentle-dialog-content[data-state], .gentle-dialog-overlay[data-state] { animation: none; }');
  });
});
