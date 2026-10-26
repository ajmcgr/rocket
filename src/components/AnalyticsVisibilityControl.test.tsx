import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsVisibilityControl } from "./AnalyticsVisibilityControl";

afterEach(cleanup);
describe("public metric visibility explanations", () => {
  it.each([
    ["private", "Your pageviews stay private."],
    ["verified_only", "Visitors see a verification badge for pageviews, without a number."],
    ["range", "Visitors see your pageviews as a range instead of an exact count."],
    ["exact", "Visitors see your exact pageviews count."],
  ])("explains the saved %s selection without changing it", (value, explanation) => {
    const onChange = vi.fn();
    render(<AnalyticsVisibilityControl value={value} onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "What should visitors see?" }) as HTMLSelectElement;
    expect(select.value).toBe(value);
    expect(document.getElementById(select.getAttribute("aria-describedby")!)?.textContent).toContain(explanation);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: "private" } });
    expect(onChange).toHaveBeenCalledWith("private");
  });
  it("keeps publishing disabled when stale while allowing privacy to be restored", () => {
    render(<AnalyticsVisibilityControl value="exact" publicDisabled onChange={vi.fn()} />);
    expect((screen.getByRole("option", { name: "Show exact pageviews" }) as HTMLOptionElement).disabled).toBe(true);
    expect((screen.getByRole("option", { name: "Keep pageviews private" }) as HTMLOptionElement).disabled).toBe(false);
  });
});
