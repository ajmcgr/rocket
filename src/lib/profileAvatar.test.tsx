import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { profileAvatarUrl } from "./profileAvatar";
import ProfileAvatarImage from "@/components/ProfileAvatarImage";

afterEach(cleanup);
const source = "https://pbs.twimg.com/profile_images/123/avatar_normal.jpg";
it("requests a larger X image without touching uploads or unrelated hosts", () => {
  expect(profileAvatarUrl(source)).toBe(source.replace("_normal", "_400x400"));
  for (const url of [
    "https://example.com/avatar_normal.jpg",
    "https://pbs.twimg.com.attacker.invalid/profile_images/a_normal.jpg",
    "https://example.com/storage/v1/object/public/avatars/upload.webp",
  ])
    expect(profileAvatarUrl(url)).toBe(url);
  expect(profileAvatarUrl("javascript:alert(1)")).toBeUndefined();
});
it("requests a retina-sized Google photo while preserving crop flags", () => {
  expect(
    profileAvatarUrl("https://lh3.googleusercontent.com/photo=s96-c"),
  ).toBe("https://lh3.googleusercontent.com/photo=s384-c");
  expect(
    profileAvatarUrl("https://lh3.googleusercontent.com/photo?sz=96"),
  ).toBe("https://lh3.googleusercontent.com/photo?sz=384");
});
it("falls back once to the original, then initials, and resets for another profile", () => {
  const ui = render(
    <ProfileAvatarImage src={source} alt="Avatar" fallback="A" />,
  );
  expect(ui.getByRole("img").getAttribute("src")).toContain("_400x400");
  fireEvent.error(ui.getByRole("img"));
  expect(ui.getByRole("img").getAttribute("src")).toBe(source);
  fireEvent.error(ui.getByRole("img"));
  expect(ui.queryByRole("img")).toBeNull();
  expect(ui.getByText("A")).toBeTruthy();
  ui.rerender(
    <ProfileAvatarImage
      src="https://example.com/upload.jpg"
      alt="Avatar"
      fallback="B"
    />,
  );
  expect(ui.getByRole("img").getAttribute("src")).toBe(
    "https://example.com/upload.jpg",
  );
});
