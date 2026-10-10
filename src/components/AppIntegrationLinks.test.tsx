import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import AppIntegrationLinks from "./AppIntegrationLinks";
vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));
afterEach(cleanup);

describe("settings integration hub", () => {
  it("shows the supported app integration destinations without inventing connection status", () => {
    const ui = render(<AppIntegrationLinks />);
    for (const name of ["Google Analytics", "PostHog", "Stripe · revenue verification", "Stripe · Buy with Rocket", "Rocket ID"]) {
      expect(ui.getByRole("heading", { name })).toBeTruthy();
    }
    expect(ui.getByRole("link", { name: "Manage payments" }).getAttribute("href")).toBe("/buy-with-rocket");
    expect(ui.getByRole("link", { name: "Set up Rocket ID" }).getAttribute("href")).toBe("/rocket-id");
    expect(ui.getByRole("link", { name: "View app connections" }).getAttribute("href")).toBe("/your-apps");
    expect(ui.queryByText("Connected", { exact: true })).toBeNull();
  });
  it("keeps the integrations tab without showing the Google Drive option", () => {
    const source = readFileSync("src/pages/Settings.tsx", "utf8");
    expect(source).not.toContain("Connected applications");
    expect(source).not.toContain("rocket-connect-applications");
    expect(source).toContain("<AppIntegrationLinks />");
    expect(source).not.toContain("Google Drive");
    expect(source).toContain('to: "/settings/integrations"');
  });
});
