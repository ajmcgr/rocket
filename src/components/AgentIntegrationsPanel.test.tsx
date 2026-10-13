import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AgentIntegrationsPanel from "./AgentIntegrationsPanel";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query: Record<string, any> = {};
      for (const method of ["select", "eq", "limit"]) query[method] = () => query;
      query.maybeSingle = async () => ({
        data: table === "public_app_sources" ? { source_url: "https://github.com/ajmcgr/launch" } : null,
        error: null,
      });
      return query;
    },
    functions: { invoke: mocks.invoke },
  },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("lets a verified owner save public links and reuses an existing GitHub source", async () => {
  mocks.invoke.mockResolvedValue({ data: { status: "saved" }, error: null });
  render(<AgentIntegrationsPanel appId="app-1" />);
  const github = await screen.findByRole("textbox", { name: "GitHub repository URL" }) as HTMLInputElement;
  expect(github.value).toBe("https://github.com/ajmcgr/launch");
  fireEvent.change(screen.getByRole("textbox", { name: "MCP server URL" }), { target: { value: "https://launch.ai/mcp" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Claude" }));
  fireEvent.click(screen.getByRole("button", { name: "Save agent integrations" }));
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("rocket-apps", { body: expect.objectContaining({
    action: "update_agent_integrations", app_id: "app-1",
    mcp_url: "https://launch.ai/mcp", github_url: "https://github.com/ajmcgr/launch",
    supported_clients: ["Claude"],
  }) }));
  expect(await screen.findByText("Agent integrations saved.")).toBeTruthy();
});
