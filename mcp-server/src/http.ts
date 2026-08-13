#!/usr/bin/env node

/**
 * Triton MCP Server — HTTP transport (for web UI / remote access)
 *
 * Uses the MCP Streamable HTTP transport so any MCP-compatible client
 * (including browser-based ones) can connect over the network.
 *
 * Usage:
 *   PORT=3100 tsx mcp-server/src/http.ts
 *
 * Endpoint:
 *   POST http://localhost:3100/mcp   — JSON-RPC messages
 *   GET  http://localhost:3100/mcp   — SSE stream (server-initiated messages)
 *   DELETE http://localhost:3100/mcp — close session
 *
 * Health check:
 *   GET http://localhost:3100/health
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createTritonServer } from "./server.js";
import { randomUUID } from "node:crypto";

const PORT = parseInt(process.env.PORT || "3100", 10);
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") || ["*"];

/**
 * Bearer token required on every /mcp request.
 *
 * This server exposes a `query_database` tool that executes caller-supplied SQL through the
 * service_role Supabase client (see server.ts), which bypasses every RLS policy. Without a
 * token, any client that can reach the port has unauthenticated read access to production.
 *
 * Fails closed: if MCP_AUTH_TOKEN is unset the server refuses to start rather than silently
 * serving unauthenticated — an unset secret must not be the permissive case.
 */
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
if (!MCP_AUTH_TOKEN) {
  console.error(
    "FATAL: MCP_AUTH_TOKEN is not set. This server exposes arbitrary SQL as service_role;\n" +
    "refusing to start without a token. Generate one with: openssl rand -hex 32"
  );
  process.exit(1);
}

if (ALLOWED_ORIGINS.includes("*")) {
  console.warn(
    "WARNING: ALLOWED_ORIGINS is '*'. Set it to your real origins in production."
  );
}

/** Constant-time-ish bearer check. Returns true when the request carries the right token. */
function isAuthorized(req: IncomingMessage): boolean {
  const header = req.headers["authorization"];
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const presented = header.slice("Bearer ".length);
  const expected = MCP_AUTH_TOKEN as string;
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ── Session management ──────────────────────────────────────────────────────
// Each client session gets its own transport + server instance.
// This allows multiple concurrent clients.

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: ReturnType<typeof createTritonServer> }>();

function setCorsHeaders(res: ServerResponse) {
  const origin = ALLOWED_ORIGINS.includes("*") ? "*" : ALLOWED_ORIGINS.join(", ");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, Authorization");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  setCorsHeaders(res);

  // CORS preflight — answered before auth so browsers can learn the allowed headers.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth gate. Must come before session creation: without it, a POST with no
  // mcp-session-id mints a new session and receives the full toolset.
  if (!isAuthorized(req)) {
    res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // For POST requests, check if it's an initialization (no session ID header)
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "POST" && !sessionId) {
    // New session — create transport + server
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const server = createTritonServer();
    await server.connect(transport);

    // Store session once transport has an ID
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
        console.error(`Session closed: ${transport.sessionId}`);
      }
    };

    await transport.handleRequest(req, res);

    // After handling, the transport will have a session ID
    if (transport.sessionId) {
      sessions.set(transport.sessionId, { transport, server });
      console.error(`New session: ${transport.sessionId}`);
    }
    return;
  }

  // Existing session — look up by session ID
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      await session.transport.handleRequest(req, res);
      return;
    }
  }

  // No valid session found
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Session not found. Send a POST without mcp-session-id to initialize." }));
}

// ── HTTP Server ─────────────────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    setCorsHeaders(res);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      server: "triton-tools",
      version: "1.0.0",
      activeSessions: sessions.size,
    }));
    return;
  }

  if (url.pathname === "/mcp") {
    try {
      await handleMcpRequest(req, res);
    } catch (err: any) {
      console.error("MCP request error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found. Use /mcp for MCP protocol or /health for status." }));
});

httpServer.listen(PORT, () => {
  console.error(`Triton MCP Server (HTTP) listening on http://localhost:${PORT}/mcp`);
  console.error(`Health check: http://localhost:${PORT}/health`);
  console.error(`Tools: query_database, search_players, export_csv, render_graphic, get_player_stats`);
});
