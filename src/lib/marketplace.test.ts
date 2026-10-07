import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));
import { sourceAttribution } from "./marketplace";
describe("Source attribution", () => {
  it("retains only explicit badge/share sources, never arbitrary visitor data", () => {
    expect(sourceAttribution("?utm_source=rocket_badge")).toBe("rocket_badge");
    expect(sourceAttribution("?utm_source=rocket_share")).toBe("rocket_share");
    expect(sourceAttribution("?utm_source=email@example.com")).toBe("direct");
    expect(sourceAttribution("")).toBe("direct");
  });
});
