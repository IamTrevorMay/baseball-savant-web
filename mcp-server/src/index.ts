#!/usr/bin/env node

/**
 * Triton MCP Server — stdio transport (for Claude Code / CLI usage)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTritonServer } from "./server.js";

async function main() {
  const server = createTritonServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Triton MCP Server (stdio) started — tools: query_database, search_players, export_csv, render_graphic, get_player_stats");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
