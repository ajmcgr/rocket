// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import AppLogo from "./AppLogo";
afterEach(cleanup);
it("rounds app icons and letter fallbacks consistently at every size", () => {
  const { container, rerender } = render(<AppLogo name="Example" src="https://example.com/icon.png" className="h-20 w-20" />);
  expect(container.firstElementChild?.className).toContain("rounded-[22%]");
  expect(container.querySelector("img")?.className).toContain("rounded-[22%]");
  rerender(<AppLogo name="Example" className="h-12 w-12" />);
  expect(container.firstElementChild?.className).toContain("rounded-[22%]");
  expect(container.firstElementChild?.className).toContain("overflow-hidden");
});
it("requests a small transparent logo variant, falls back once, then a letter", () => {
  const src = "https://example.supabase.co/storage/v1/object/public/logos/app.png";
  render(<AppLogo name="Example" src={src} />);
  const image = document.querySelector("img")!;
  expect(image.src).toContain("/render/image/public/");
  expect(image.src).toContain("width=192");
  expect(image.getAttribute("decoding")).toBe("async");
  fireEvent.error(image);
  expect(image.src).toBe(src);
  fireEvent.error(image);
  expect(document.querySelector("img")).toBeNull();
  expect(screen.getByText("E")).toBeTruthy();
});
