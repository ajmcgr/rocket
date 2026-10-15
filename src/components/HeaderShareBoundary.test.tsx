import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HeaderShareBoundary from "./HeaderShareBoundary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("header share failure", () => {
  it("keeps the page available and offers the exact share link", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onClose = vi.fn();
    const url = "https://tryrocket.ai/?utm_source=rocket_share&utm_content=official_card_20261014";
    const BrokenShare = () => { throw new Error("share chunk unavailable"); };
    const ui = render(<>
      <p>App page is still here</p>
      <HeaderShareBoundary onClose={onClose} url={url}><BrokenShare /></HeaderShareBoundary>
    </>);

    expect(ui.getByText("App page is still here")).toBeTruthy();
    expect(ui.getByRole("dialog", { name: "Share Rocket" })).toBeTruthy();
    expect((ui.getByRole("textbox", { name: "Rocket share link" }) as HTMLInputElement).value).toBe(url);
    expect(ui.getByRole("link", { name: "Open Rocket" }).getAttribute("href")).toBe(url);
    fireEvent.click(ui.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
