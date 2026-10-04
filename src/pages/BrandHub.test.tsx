import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandKitPreview } from "./BrandHub";

vi.mock("@/components/Logotype", () => ({ Logotype: () => <span>Saved wordmark</span> }));
afterEach(cleanup);

describe("Brand kit card previews", () => {
  it("contains its loader inside a positioned preview rather than covering the page", () => {
    render(<BrandKitPreview brand={{ name: "Example", preview_url: "/logo.png" }} />);
    const loader = screen.getByLabelText("Loading brand preview");
    expect(loader.parentElement?.classList.contains("relative")).toBe(true);
    fireEvent.load(screen.getByRole("img", { name: "Example logo" }));
    expect(screen.queryByLabelText("Loading brand preview")).toBeNull();
  });

  it("shows cached images without leaving a permanent loading overlay", () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(300);
    try {
      render(<BrandKitPreview brand={{ name: "Cached", cover_url: "/cached.png" }} />);
      expect(screen.queryByLabelText("Loading brand preview")).toBeNull();
    } finally {
      complete.mockRestore();
      width.mockRestore();
    }
  });

  it("falls back to the saved wordmark when a preview image fails", () => {
    render(<BrandKitPreview brand={{ name: "Example", preview_url: "/broken.png", logotype_state: {} }} />);
    fireEvent.error(screen.getByRole("img"));
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Saved wordmark")).toBeTruthy();
    expect(screen.queryByLabelText("Loading brand preview")).toBeNull();
  });

  it("shows initials for a kit without preview media", () => {
    render(<BrandKitPreview brand={{ name: "Briefly" }} />);
    expect(screen.getByText("BR")).toBeTruthy();
  });
});
