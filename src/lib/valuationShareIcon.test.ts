import { describe, expect, it } from "vitest";
import { valuationShareIconUrl } from "./valuationShareIcon";

describe("valuationShareIconUrl", () => {
  it("uses only the public hostname from an app URL", () => {
    expect(valuationShareIconUrl("https://user:secret@www.trylaunch.ai/pricing?token=private"))
      .toBe("https://icon.horse/icon/trylaunch.ai/256?fallback=404");
  });

  it("skips invalid and private URLs", () => {
    for (const url of ["", "not a URL", "file:///etc/passwd", "http://localhost:3000", "http://192.168.1.2", "https://app.internal", "https://example.com"]) {
      expect(valuationShareIconUrl(url)).toBeNull();
    }
  });
});
