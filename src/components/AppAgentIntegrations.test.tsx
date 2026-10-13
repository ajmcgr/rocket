import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AppAgentIntegrations from "./AppAgentIntegrations";

afterEach(cleanup);

it("shows only declared actions and identifies unverified compatibility", () => {
  render(<AppAgentIntegrations integration={{
    mcp_url: "https://example.com/mcp", api_docs_url: "https://example.com/docs",
    github_url: null, deployment_url: null, supported_clients: ["Claude"],
  }} linkedGithubUrl="https://github.com/ajmcgr/launch" />);
  expect(screen.getByRole("heading", { name: "Works with AI Agents" })).toBeTruthy();
  expect(screen.getByText(/Rocket has not verified/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "View API" }).getAttribute("href")).toBe("https://example.com/docs");
  expect(screen.getByRole("link", { name: "View Source" }).getAttribute("href")).toBe("https://github.com/ajmcgr/launch");
  expect(screen.queryByRole("link", { name: "Deployment Guide" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Connect MCP" }));
  expect(screen.getByText("https://example.com/mcp")).toBeTruthy();
});

it("does not expose a section without a current integration", () => {
  const { container } = render(<AppAgentIntegrations integration={null} linkedGithubUrl="https://github.com/ajmcgr/launch" />);
  expect(container.innerHTML).toBe("");
});

it("does not render unsafe links even if a row is malformed", () => {
  render(<AppAgentIntegrations integration={{
    mcp_url: "http://localhost/mcp", api_docs_url: "javascript:alert(1)",
    github_url: null, deployment_url: null, supported_clients: ["Cursor"],
  }} />);
  expect(screen.queryByRole("button", { name: "Connect MCP" })).toBeNull();
  expect(screen.queryByRole("link", { name: "View API" })).toBeNull();
  expect(screen.getByText("Cursor")).toBeTruthy();
});
