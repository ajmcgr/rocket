import { lookup } from "node:dns/promises";
import { isPublicAddress, parsePublicUrl } from "./appIngestion.ts";

export const AI_CLIENTS = ["Claude", "ChatGPT", "Cursor", "Windsurf", "VS Code"] as const;
export type AgentIntegrations = {
  mcp_url: string | null;
  api_docs_url: string | null;
  github_url: string | null;
  deployment_url: string | null;
  supported_clients: string[];
};

type Resolver = (hostname: string) => Promise<string[]>;
const resolveAddresses: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((record) => record.address);

export async function validateAgentIntegrations(
  input: Record<string, unknown>,
  resolve: Resolver = resolveAddresses,
): Promise<AgentIntegrations> {
  const validateUrl = async (key: keyof Omit<AgentIntegrations, "supported_clients">) => {
    const raw = input[key];
    if (raw == null || raw === "") return null;
    if (typeof raw !== "string" || raw.length > 2048) throw new Error("Invalid integration URL");
    const url = parsePublicUrl(raw.trim());
    if (url.protocol !== "https:") throw new Error("Integration URLs must use HTTPS");
    if (url.search || raw.includes("#"))
      throw new Error("Integration URLs cannot contain query parameters or fragments; never include credentials");
    if (key === "github_url" &&
      (url.hostname !== "github.com" || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname) || url.search))
      throw new Error("Enter a GitHub repository URL");
    const addresses = await resolve(url.hostname);
    if (!addresses.length || addresses.some((address) => !isPublicAddress(address)))
      throw new Error("Integration URL resolves to an unsafe address");
    return url.toString();
  };
  const clients = input.supported_clients ?? [];
  if (!Array.isArray(clients) || clients.length > AI_CLIENTS.length ||
    clients.some((client) => typeof client !== "string" || !AI_CLIENTS.includes(client as typeof AI_CLIENTS[number])))
    throw new Error("Invalid supported AI clients");
  return {
    mcp_url: await validateUrl("mcp_url"),
    api_docs_url: await validateUrl("api_docs_url"),
    github_url: await validateUrl("github_url"),
    deployment_url: await validateUrl("deployment_url"),
    supported_clients: [...new Set(clients)],
  };
}
