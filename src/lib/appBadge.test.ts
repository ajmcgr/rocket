import { describe, expect, it } from "vitest";
import { appBadgeEmbed, appBadgeUrl, badgePath } from "./appBadge";

describe("Rocket app badges", () => {
  it("links to the exact public app listing and escapes app identifiers", () => {
    expect(appBadgeUrl('app" onclick="bad')).toBe("https://tryrocket.ai/apps/app%22%20onclick%3D%22bad?utm_source=rocket_badge");
  });
  it.each(["black", "white"] as const)("embeds the %s artwork with accessible copy and fixed proportions", (theme) => {
    const embed = appBadgeEmbed("app-1", theme);
    expect(embed).toContain('href="https://tryrocket.ai/apps/app-1?utm_source=rocket_badge"');
    expect(embed).toContain(badgePath(theme));
    expect(embed).toContain('alt="Discover it on Rocket"');
    expect(embed).toContain('width="160" height="50"');
    expect(embed).toContain('rel="noopener"');
  });
});
