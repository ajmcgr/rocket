import { describe, expect, it } from "vitest";
import { publicTemplates } from "./templates";

describe("publicTemplates", () => {
  it("only returns complete templates explicitly approved for indexing", () => {
    const templates = publicTemplates();

    expect(templates).toHaveLength(6);
    expect(templates.every((template) => template.indexable)).toBe(true);
    expect(templates.every((template) => template.colors.length >= 3 && template.fonts.length >= 2)).toBe(true);
    expect(templates.map((template) => template.id)).toContain("saas-modern");
  });
});
