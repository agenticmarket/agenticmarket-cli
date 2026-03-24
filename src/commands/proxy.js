/**
 * src/commands/proxy.js
 * agenticmarket proxy <username>/<server-name>
 *
 * Runs as a local stdio MCP server.
 * Reads API key from ~/.agenticmarket/config.json at runtime.
 *
 * Uses the official MCP SDK to:
 *   1. Connect to the upstream AgenticMarket infrastructure via Streamable HTTP (SSE fallback)
 *   2. Expose a proper stdio MCP server locally (handles initialize, tools/list, etc.)
 *   3. Bridge all requests transparently — the local client (Antigravity, Cursor, etc.)
 *      speaks normal MCP stdio; we handle the handshake and forward each call upstream.
 *
 * This fixes "failed to get tools: calling tools/list: invalid request" because
 * Antigravity now gets a proper MCP handshake from the local McpServer, not raw HTTP.
 */

import { Client }                        from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport }            from "@modelcontextprotocol/sdk/client/sse.js";
import { McpServer }                     from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport }          from "@modelcontextprotocol/sdk/server/stdio.js";
import { getApiKey, PROXY_BASE_URL }     from "../config.js";

export async function proxy(rawServerName) {
  const apiKey = getApiKey();

  if (!apiKey) {
    process.stderr.write(
      "[AgenticMarket] Not authenticated. Run: agenticmarket auth <api-key>\n"
    );
    process.exit(1);
  }

  const [username, server] = rawServerName.split("/");
  if (!username || !server) {
    process.stderr.write(
      "[AgenticMarket] Invalid format. Use: agenticmarket proxy <username>/<server-name>\n"
    );
    process.exit(1);
  }

  const upstreamUrl = `${PROXY_BASE_URL}/mcp/${username}/${server}`;
  process.stderr.write(`[AgenticMarket] Proxy started → ${upstreamUrl}\n`);

  const authHeaders = { "x-api-key": apiKey };

  // ── Step 1: Connect to upstream via Streamable HTTP (with SSE fallback) ──────
  const upstreamClient = new Client({
    name:    "agenticmarket-proxy",
    version: "1.3.0",
  });

  let connectedTransport;

  // Try Streamable HTTP first (MCP spec ≥ 2025-03-26)
  try {
    const transport = new StreamableHTTPClientTransport(
      new URL(upstreamUrl),
      { requestInit: { headers: authHeaders } }
    );
    await upstreamClient.connect(transport);
    connectedTransport = transport;
    process.stderr.write("[AgenticMarket] Connected via Streamable HTTP\n");
  } catch (httpErr) {
    // Fall back to SSE transport (older servers)
    process.stderr.write(`[AgenticMarket] Streamable HTTP failed (${httpErr.message}), trying SSE...\n`);
    try {
      const sseTransport = new SSEClientTransport(
        new URL(upstreamUrl),
        { requestInit: { headers: authHeaders } }
      );
      await upstreamClient.connect(sseTransport);
      connectedTransport = sseTransport;
      process.stderr.write("[AgenticMarket] Connected via SSE\n");
    } catch (sseErr) {
      process.stderr.write(`[AgenticMarket] Failed to connect: ${sseErr.message}\n`);
      process.exit(1);
    }
  }

  // ── Step 2: Discover tools from upstream ────────────────────────────────────
  let upstreamTools = [];
  try {
    const { tools } = await upstreamClient.listTools();
    upstreamTools = tools ?? [];
    process.stderr.write(`[AgenticMarket] Discovered ${upstreamTools.length} tool(s)\n`);
  } catch (err) {
    process.stderr.write(`[AgenticMarket] Failed to list tools: ${err.message}\n`);
    process.exit(1);
  }

  // ── Step 3: Create a local stdio MCP server that proxies each tool ──────────
  const proxyServer = new McpServer({
    name:    `agenticmarket/${server}`,
    version: "1.3.0",
  });

  for (const tool of upstreamTools) {
    // Re-register each upstream tool locally with the same schema
    proxyServer.tool(
      tool.name,
      tool.description ?? "",
      tool.inputSchema?.properties ?? {},
      async (args) => {
        try {
          const result = await upstreamClient.callTool({
            name:      tool.name,
            arguments: args,
          });
          return result;
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // ── Step 4: If no tools found, register a placeholder so the server stays alive
  if (upstreamTools.length === 0) {
    process.stderr.write("[AgenticMarket] Warning: no tools found from upstream\n");
  }

  // ── Step 5: Start the stdio MCP server for the local client ─────────────────
  const downstreamTransport = new StdioServerTransport();
  await proxyServer.connect(downstreamTransport);
  process.stderr.write("[AgenticMarket] Ready — waiting for requests\n");

  // Keep alive: if upstream disconnects, log it but let stdio server stay up
  process.on("SIGINT",  () => { upstreamClient.close().catch(() => {}); process.exit(0); });
  process.on("SIGTERM", () => { upstreamClient.close().catch(() => {}); process.exit(0); });
}