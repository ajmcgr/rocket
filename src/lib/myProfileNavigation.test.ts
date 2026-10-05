import { expect, it } from "vitest";
import { myProfileHref } from "./myProfileNavigation";

it("links to the normalized public username", () => {
  expect(myProfileHref({ username: " Alex " })).toBe("/u/alex");
});
it("opens profile setup instead of a broken public link when no username exists", () => {
  expect(myProfileHref()).toBe("/settings/profile");
  expect(myProfileHref({ username: "https://evil.example" })).toBe("/settings/profile");
});
