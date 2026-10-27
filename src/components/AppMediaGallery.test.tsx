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

it("navigates screenshots with accessible arrows", () => {
  render(
    <AppMediaGallery
      name="Example"
      media={[0, 1, 2].map((index) => ({
        id: `image-${index}`,
        app_id: "app",
        media_type: "screenshot" as const,
        source_type: "owner" as const,
        source_url: `https://example.com/${index}.png`,
        sort_order: index,
      }))}
    />,
  );
  const previous = screen.getByRole("button", { name: "Previous screenshot" });
  const next = screen.getByRole("button", { name: "Next screenshot" });
  expect((previous as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText("1 / 3")).not.toBeNull();
  fireEvent.click(next);
  expect(screen.queryByText("2 / 3")).not.toBeNull();
  fireEvent.click(next);
  expect(screen.queryByText("3 / 3")).not.toBeNull();
  expect((next as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(previous);
  expect(screen.queryByText("2 / 3")).not.toBeNull();
});
