import { expect, it } from "vitest";
import { myProfileHref } from "./myProfileNavigation";

it("links to the normalized public username", () => {
  expect(myProfileHref({ username: " Alex " })).toBe("/@alex");
  expect(myProfileHref({ username: "new_builder" })).toBe("/@new_builder");
  expect(myProfileHref({ username: "builder123" })).toBe("/@builder123");
});
it("opens profile setup instead of a broken public link when no username exists", () => {
  expect(myProfileHref()).toBe("/settings/profile");
  expect(myProfileHref({ username: "https://evil.example" })).toBe("/settings/profile");
});
