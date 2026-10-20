import { describe, expect, it } from "vitest";
import type { ParsedLocation } from "@tanstack/react-router";
import { createScrollRestorationKey } from "./scroll-restoration";

const location = (key?: string, href = "/pricing") =>
  ({ state: { __TSR_key: key }, href }) as ParsedLocation;

describe("scroll restoration", () => {
  it("keeps history positions available for Back/Forward within a document", () => {
    const getKey = createScrollRestorationKey();
    const first = getKey(location("first"));
    expect(getKey(location("second"))).not.toBe(first);
    expect(getKey(location("first"))).toBe(first);
  });

  it("does not reuse the previous document's position on refresh", () => {
    const beforeRefresh = createScrollRestorationKey();
    const afterRefresh = createScrollRestorationKey();
    const entry = location("same-history-entry");
    expect(afterRefresh(entry)).not.toBe(beforeRefresh(entry));
  });

  it("uses the URL fallback, preserving distinct hash destinations", () => {
    const getKey = createScrollRestorationKey();
    expect(getKey(location())).toBe(getKey(location()));
    expect(getKey(location(undefined, "/pricing#faq"))).not.toBe(
      getKey(location()),
    );
  });
});
