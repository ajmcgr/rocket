import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import AppMediaGallery from "./AppMediaGallery";

afterEach(cleanup);

it("keeps the blurred fill in sync through the original-image fallback, then removes broken media", () => {
  const source =
    "https://example.supabase.co/storage/v1/object/public/app-media/portrait.png";
  const { container } = render(
    <AppMediaGallery
      name="Portrait app"
      media={[
        {
          id: "portrait",
          app_id: "app",
          media_type: "screenshot",
          source_type: "owner",
          source_url: source,
          sort_order: 0,
        },
      ]}
    />,
  );
  const image = screen.getByAltText("Portrait app product image 1");
  expect(image.getAttribute("src")).toContain("/render/image/");
  fireEvent.error(image);
  expect(image.getAttribute("src")).toBe(source);
  expect(
    container.querySelector(".app-screenshot-backdrop")?.getAttribute("src"),
  ).toBe(source);
  expect(screen.getAllByRole("img")).toHaveLength(1);
  fireEvent.error(image);
  expect(container.innerHTML).toBe("");
});

const images = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `image-${index}`,
    app_id: "app",
    media_type: "screenshot" as const,
    source_type: "owner" as const,
    source_url: `https://example.com/${index}.png`,
    sort_order: index,
  }));

it.each([
  [0, null, 0],
  [1, "single", 1],
  [2, "pair", 2],
  [3, "triple", 3],
  [4, "quad", 4],
  [5, "quad", 4],
] as const)("lays out %i screenshots as %s", (count, layout, shown) => {
  const { container } = render(
    <AppMediaGallery name="Example" media={images(count)} />,
  );
  const grid = container.querySelector(".rocket-screenshot-grid");
  expect(grid?.getAttribute("data-layout") ?? null).toBe(layout);
  expect(grid?.querySelectorAll("a").length ?? 0).toBe(shown);
});

it("retains access to images beyond the first four", () => {
  render(<AppMediaGallery name="Example" media={images(6)} />);
  const previous = screen.getByRole("button", { name: "Previous screenshot" });
  const next = screen.getByRole("button", { name: "Next screenshot" });
  expect((previous as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText("1–4 / 6")).not.toBeNull();
  fireEvent.click(next);
  expect(screen.queryByText("5–6 / 6")).not.toBeNull();
  expect(screen.getByAltText("Example product image 6")).not.toBeNull();
  expect((next as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(previous);
  expect(screen.queryByText("1–4 / 6")).not.toBeNull();
});
