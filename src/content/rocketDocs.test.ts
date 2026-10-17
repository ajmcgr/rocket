import { describe, expect, it } from "vitest";
import { docArticles, docGroups, getDoc, searchDocs } from "./rocketDocs";

describe("documentation navigation integrity", () => {
  it("resolves every related guide and section link", () => {
    expect(new Set(docArticles.map((doc) => doc.slug)).size).toBe(
      docArticles.length,
    );
    for (const doc of docArticles) {
      expect(docGroups).toContain(doc.group);
      expect(new Set(doc.sections.map((section) => section.id)).size).toBe(
        doc.sections.length,
      );
      for (const section of doc.sections) {
        for (const [, slug, anchor] of section.body.matchAll(
          /\]\(\/docs\/([a-z0-9-]+)(?:#([a-z0-9-]+))?\)/g,
        )) {
          const target = getDoc(slug);
          expect(
            target,
            `Broken guide link in ${doc.slug}: ${slug}`,
          ).toBeDefined();
          if (anchor)
            expect(target?.sections.some((item) => item.id === anchor)).toBe(
              true,
            );
        }
      }
    }
    expect(getDoc("not-a-guide")).toBeUndefined();
  });
  it("finds task and provider terms within detailed guide content", () => {
    expect(searchDocs("gross project").map((doc) => doc.slug)).toContain(
      "revenuecat",
    );
    expect(searchDocs("PKCE").map((doc) => doc.slug)).toContain("rocket-id");
    expect(searchDocs("unlikely-nonexistent-query")).toEqual([]);
  });
});
