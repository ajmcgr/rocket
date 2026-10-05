import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/router-compat", () => ({ Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a> }));
import Logo from "./Logo";
afterEach(cleanup);
it("avoids baseline spacing for both theme variants of the header logo", () => {
  const { container } = render(<Logo size="md" />);
  const link = container.querySelector("a")!;
  expect(link.className).toContain("items-center");
  expect(link.className).toContain("align-middle");
  expect(link.className).toContain("leading-none");
  expect(container.querySelectorAll("img")).toHaveLength(2);
  for (const image of container.querySelectorAll("img")) expect(image.className).toContain("block");
});
