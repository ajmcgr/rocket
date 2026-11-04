import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { PublicCatalogue } from "./catalog";

const limit = z.number().int().min(1).max(10).optional();
const category = z.string().max(80).optional();

export function createRocketMcpHandler(catalogue: PublicCatalogue) {
  return createMcpHandler(() => {
    const server = new McpServer({ name: "rocket-public-catalogue", version: "1.0.0" });
    const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

    server.registerTool("search_apps", {
      description: "Search Rocket's public app catalogue by name or idea.",
      inputSchema: { query: z.string().min(1).max(80), category, limit },
      annotations: { readOnlyHint: true },
    }, async ({ query, category, limit }) => result(await catalogue.search(query, category, limit)));

    server.registerTool("get_app", {
      description: "Get a public Rocket app profile by its ID or slug. Private metrics are excluded.",
      inputSchema: { app_id_or_slug: z.string().min(1).max(120) },
      annotations: { readOnlyHint: true },
    }, async ({ app_id_or_slug }) => result(await catalogue.getApp(app_id_or_slug)));

    server.registerTool("browse_categories", {
      description: "List public Rocket app categories and their public app counts.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    }, async () => result(await catalogue.categories()));

    server.registerTool("get_trending_apps", {
      description: "Get apps ordered by Rocket's existing Rising app-page-view ranking.",
      inputSchema: { category, limit },
      annotations: { readOnlyHint: true },
    }, async ({ category, limit }) => result(await catalogue.trending(category, limit)));

    return server;
  });
}
