import process from "node:process";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { bodyLimit } from "hono/body-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import { securityMiddleware } from "./middleware/security.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
import { devLogger } from "./middleware/logger.js";
import { registerTools } from "./tools/index.js";

// ── App Setup ──────────────────────────────────────────────────────────────────

const app = new Hono();

// Apply middleware — order matters:
// 1. Logger (captures final status code from downstream)
// 2. Body limit (reject oversized payloads before parsing)
// 3. Security (auth, HTTPS, CORS, headers)
// 4. Rate limiting (per-IP sliding window)
app.use("*", devLogger());
app.use("*", bodyLimit({ maxSize: 1024 * 1024 })); // 1 MB
app.use("*", securityMiddleware());
app.use("*", rateLimitMiddleware());

// ── Health Endpoint ────────────────────────────────────────────────────────────

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    server: "__PROJECT_NAME__",
    timestamp: new Date().toISOString(),
  });
});

// ── MCP Transport ──────────────────────────────────────────────────────────────
// Each session gets its own McpServer + transport instance.
// The mcp-session-id header tracks sessions across requests.

interface Session {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

// Session timeout — close idle sessions after 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;
const sessionCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      session.transport.close().catch(() => {});
      session.server.close().catch(() => {});
      sessions.delete(id);
    }
  }
}, 60 * 1000);
sessionCleanupTimer.unref();

/**
 * Create a new MCP server + transport pair and register tools.
 */
function createSession(): Session {
  const server = new McpServer({
    name: "__PROJECT_NAME__",
    version: "1.0.0",
  });

  registerTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  return { server, transport, lastActivity: Date.now() };
}

// POST /mcp — main MCP request handler (initialize, tool calls, etc.)
app.post("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");
  const { req, res } = toReqRes(c.req.raw);

  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    // New session — create server + transport, connect them
    session = createSession();
    await session.server.connect(session.transport);

    // Store session once transport assigns an ID
    const assignedId = session.transport.sessionId;
    if (assignedId) {
      sessions.set(assignedId, session);
    }
  }

  // Update activity timestamp
  session.lastActivity = Date.now();

  await session.transport.handleRequest(req, res);

  res.on("close", () => {
    // If this was the final message, the transport will have closed
    if (session && session.transport.sessionId) {
      const sid = session.transport.sessionId;
      if (!sessions.has(sid)) return;
      // Keep session alive — transport handles lifecycle
    }
  });

  return toFetchResponse(res);
});

// GET /mcp — SSE stream for server-to-client notifications
app.get("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");
  if (!sessionId || !sessions.has(sessionId)) {
    return c.json({ error: "No active session. Send a POST first." }, 400);
  }

  const session = sessions.get(sessionId)!;
  session.lastActivity = Date.now();
  const { req, res } = toReqRes(c.req.raw);
  await session.transport.handleRequest(req, res);
  return toFetchResponse(res);
});

// DELETE /mcp — close a session
app.delete("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.close();
    await session.server.close();
    sessions.delete(sessionId);
  }
  return c.json({ status: "session closed" });
});

// ── Start Server ───────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? "3000", 10);
const isDev = process.env.NODE_ENV !== "production";

const serverInstance = serve({ fetch: app.fetch, port }, () => {
  console.log("");
  console.log("  ╔════════════════════════════════════════════════════╗");
  console.log("  ║  ✦ __PROJECT_NAME__                               ║");
  console.log("  ╠════════════════════════════════════════════════════╣");
  console.log(`  ║  → Local:     http://localhost:${port}${" ".repeat(Math.max(0, 20 - String(port).length))}  ║`);
  console.log(`  ║  → Health:    http://localhost:${port}/health${" ".repeat(Math.max(0, 13 - String(port).length))}  ║`);
  console.log(`  ║  → MCP:       http://localhost:${port}/mcp${" ".repeat(Math.max(0, 16 - String(port).length))}  ║`);
  if (isDev) {
    console.log("  ║                                                    ║");
    console.log("  ║  Inspector:  npm run inspect  (in another term)    ║");
    console.log("  ║  Publish:    npm run validate → npm run release    ║");
  }
  console.log("  ╚════════════════════════════════════════════════════╝");
  console.log("");
});

// ── Graceful Shutdown ──────────────────────────────────────────────────────────
// Close all sessions, stop accepting connections, then exit.

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n  ⏻ ${signal} received — shutting down gracefully...`);

  // Close all MCP sessions
  for (const [id, session] of sessions) {
    try {
      await session.transport.close();
      await session.server.close();
    } catch {
      // Best-effort cleanup
    }
    sessions.delete(id);
  }

  // Stop HTTP server
  serverInstance.close(() => {
    console.log("  ✓ Server stopped.\n");
    process.exit(0);
  });

  // Force exit after 5 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error("  ✗ Forced exit after timeout.\n");
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
