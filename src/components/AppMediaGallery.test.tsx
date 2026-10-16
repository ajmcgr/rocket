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
