import { describe, expect, it } from "vitest";
import { APP_CATEGORIES, availableCategories, categoryEmoji } from "./appCategories";

describe("app categories", () => {
  it("keeps existing Rocket categories while adding distinct marketplace choices", () => {
    const names = APP_CATEGORIES.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Productivity");
    expect(names).toContain("Books");
    expect(names).toContain("Weather");
    expect(names).not.toContain("Graphics & Design"); // Design & Creative already exists.
  });

  it("retains legacy source categories instead of hiding them", () => {
    expect(availableCategories(["Legacy category", "Books"]).filter((name) => name === "Books")).toHaveLength(1);
    expect(availableCategories(["Legacy category"])).toContain("Legacy category");
    expect(categoryEmoji("Legacy category")).toBe("📱");
  });
});
