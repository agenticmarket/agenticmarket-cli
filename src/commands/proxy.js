/**
 * src/commands/proxy.js
 * agenticmarket proxy <username>/<skill>
 *
 * Runs as a local stdio MCP server.
 * Reads API key from ~/.agenticmarket/config.json at runtime.
 * Forwards all MCP traffic to your cloud worker via HTTP.
 */

import { getApiKey, PROXY_BASE_URL } from "../config.js";

export async function proxy(rawSkillName) {
  const apiKey = getApiKey();

  if (!apiKey) {
    process.stderr.write(
      "[AgenticMarket] Not authenticated. Run: agenticmarket auth <api-key>\n"
    );
    process.exit(1);
  }

  const [username, skill] = rawSkillName.split("/");
  if (!username || !skill) {
    process.stderr.write(
      "[AgenticMarket] Invalid format. Use: agenticmarket proxy <username>/<skill>\n"
    );
    process.exit(1);
  }

  const upstreamUrl = `${PROXY_BASE_URL}/mcp/${username}/${skill}`;
  process.stderr.write(`[AgenticMarket] Proxy started → ${upstreamUrl}\n`);

  let buffer = "";
  process.stdin.setEncoding("utf-8");

  process.stdin.on("data", async (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let message;
      try {
        message = JSON.parse(trimmed);
      } catch {
        continue;
      }

      try {
        // Key is read FRESH from config on every call
        const currentKey = getApiKey();

        const response = await fetch(upstreamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": currentKey,
          },
          body: JSON.stringify(message),
        });

        const result = await response.json();
        process.stdout.write(JSON.stringify(result) + "\n");

      } catch (err) {
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          id: message?.id ?? null,
          error: { code: -32000, message: `Proxy error: ${err.message}` },
        }) + "\n");
      }
    }
  });

  process.stdin.on("end", () => process.exit(0));
}