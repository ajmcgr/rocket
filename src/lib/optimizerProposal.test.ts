import { describe, expect, it } from "vitest";
import { safeProposedDescription } from "../../supabase/functions/_shared/optimizerProposal";

const original = "Media AI is the all-in-one PR and Influencer Marketing media database that helps you find the right journalists and influencers for your campaigns. Easily search and connect with top contacts, manage outreach, and track campaign success—all in one place.";

describe("optimizer listing proposal safety", () => {
  it("allows an extractive description rewrite", () => {
    const proposed = "Find the right journalists and influencers for your PR and Influencer Marketing campaigns with Media AI. Search and connect with top contacts, manage outreach, and track campaign success—all in one place.";
    expect(safeProposedDescription(proposed, original)).toBe(proposed);
  });

  it("rejects the production suggestion that invented engagement metrics", () => {
    expect(safeProposedDescription("Media AI helps you track campaign success, including engagement metrics and media mentions.", original)).toBeNull();
  });

  it("rejects short invented feature words", () => {
    expect(safeProposedDescription("Media AI helps you find the right journalists and run ad campaigns.", original)).toBeNull();
  });

  it("rejects missing source descriptions", () => {
    expect(safeProposedDescription("A useful app for your campaigns", "")).toBeNull();
    expect(safeProposedDescription(null, original)).toBeNull();
  });
});
