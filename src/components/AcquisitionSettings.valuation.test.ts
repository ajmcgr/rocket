import { describe, expect, it } from "vitest";
import { valuationPriceSuggestion } from "./AcquisitionSettings";

describe("valuation listing prefill", () => {
  it("allows a positive suggested USD price", () => expect(valuationPriceSuggestion("?valuation_price=30000")).toBe("30000"));
  it("ignores malformed, zero and excessive values", () => {
    for (const search of ["?valuation_price=-1", "?valuation_price=0", "?valuation_price=1e9", "?valuation_price=1234567890", ""]) expect(valuationPriceSuggestion(search)).toBe("");
  });
});
