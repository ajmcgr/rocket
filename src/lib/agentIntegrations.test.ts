import { describe, expect, it } from "vitest";
import { validateAgentIntegrations } from "../../supabase/functions/_shared/agentIntegrations";

const publicDns = async () => ["93.184.216.34"];

describe("developer-declared agent integrations", () => {
  it("accepts public HTTPS links and the supported clients without fetching endpoints", async () => {
    const result = await validateAgentIntegrations({
      mcp_url: "https://example.com/mcp",
      api_docs_url: "https://example.com/api",
      github_url: "https://github.com/ajmcgr/launch",
      deployment_url: "https://example.com/deploy",
      supported_clients: ["Claude", "Cursor"],
    }, publicDns);
    expect(result.mcp_url).toBe("https://example.com/mcp");
    expect(result.github_url).toBe("https://github.com/ajmcgr/launch");
    expect(result.supported_clients).toEqual(["Claude", "Cursor"]);
  });

  it.each([
    "http://example.com/mcp", "https://localhost/mcp", "https://127.0.0.1/mcp",
    "https://service.internal/mcp", "https://user:secret@example.com/mcp",
    "https://example.com/mcp?api_key=secret", "https://example.com/mcp#token",
  ])("rejects unsafe MCP URL %s", async (mcp_url) => {
    await expect(validateAgentIntegrations({ mcp_url }, publicDns)).rejects.toThrow();
  });

  it("rejects DNS names resolving to a private address", async () => {
    await expect(validateAgentIntegrations({ mcp_url: "https://example.com/mcp" }, async () => ["10.0.0.5"]))
      .rejects.toThrow("unsafe address");
  });

  it("rejects non-repository GitHub URLs and unlisted client claims", async () => {
    await expect(validateAgentIntegrations({ github_url: "https://github.com/ajmcgr" }, publicDns)).rejects.toThrow("repository");
    await expect(validateAgentIntegrations({ supported_clients: ["Unknown Agent"] }, publicDns)).rejects.toThrow("clients");
  });
});
