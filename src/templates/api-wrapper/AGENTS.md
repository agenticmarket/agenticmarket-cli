# AGENTS.md — Instructions for AI Coding Assistants

> This file provides context for AI coding tools (Cursor, Claude Code, Windsurf, Copilot, etc.)
> so they understand how to work in this project correctly.

## Project Type

This is an **MCP (Model Context Protocol) API wrapper server** built with:
- **Hono** — HTTP framework
- **@modelcontextprotocol/sdk** — Official MCP SDK with Streamable HTTP transport
- **TypeScript** — Strict mode enabled
- **Zod** — Input validation for all tool parameters
- **api-client.ts** — Pre-configured HTTP client for the upstream REST API

## Adding a New Tool

1. Create `src/tools/<tool-name>.ts`
2. Use `apiClient` to call the upstream API — auth is auto-injected
3. Export a register function following this exact pattern:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiClient, ApiClientError } from "../lib/api-client.js";

export function registerMyTool(server: McpServer): void {
  server.tool(
    "my_tool",                                    // snake_case name
    "Clear description for AI agent discovery",   // what does this tool do?
    {
      query: z.string().describe("What this input is for"),
    },
    async ({ query }) => {
      try {
        const data = await apiClient.get("/endpoint", { q: query });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        const message =
          err instanceof ApiClientError
            ? `API Error (${err.statusCode}): ${err.message}`
            : `Unexpected error: ${err instanceof Error ? err.message : "Unknown"}`;
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }
    },
  );
}
```

4. Register in `src/tools/index.ts`:

```typescript
import { registerMyTool } from "./my-tool.js";

export function registerTools(server: McpServer): void {
  // ... existing tools
  registerMyTool(server);
}
```

5. Test: `npm run inspect` → open Inspector UI → call the tool

## API Client Usage

The `src/lib/api-client.ts` provides pre-configured methods:

```typescript
// GET with query params
const data = await apiClient.get("/users", { limit: "10" });

// POST with body
const result = await apiClient.post("/users", { name: "Alice" });

// PUT and DELETE
await apiClient.put("/users/1", { name: "Bob" });
await apiClient.delete("/users/1");
```

Auth header, base URL, and timeout are injected automatically from `.env`.

## File Structure

```
src/
├── index.ts              # Server entry — Hono + MCP transport (rarely needs changes)
├── lib/
│   └── api-client.ts     # HTTP client — auth injection, timeout, error mapping
├── middleware/
│   ├── security.ts       # HTTPS, secret auth, CORS, headers (DO NOT REMOVE)
│   ├── rateLimit.ts      # Per-IP rate limiting (DO NOT REMOVE)
│   └── logger.ts         # Dev request logging (auto-disabled in production)
├── tools/
│   ├── index.ts          # Tool registry — import + register all tools here
│   └── get-data.ts       # Reference tool implementation
└── types.ts              # Shared TypeScript types
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with hot reload (port 3000) |
| `npm run inspect` | Open MCP Inspector UI at localhost:6274 |
| `npm run test:tools` | CLI-mode testing (CI-ready) |
| `npm run build` | Production build to `dist/` |
| `npm run validate` | Pre-publish security + schema check |
| `npm run release` | Bump version + publish to AgenticMarket |

## Rules

- **Never remove** security middleware imports from `index.ts`
- **Always use** `import process from "node:process"` (not bare `process` — Zod v4 conflicts)
- **Always use** Zod schemas for tool input validation
- **Always use** `apiClient` methods for upstream API calls — never raw `fetch`
- **Always handle** `ApiClientError` separately from generic errors
- **Tool names** must be `snake_case` (MCP convention)
- **Tool descriptions** should be written for AI agents — be specific about what the tool does
- **File naming** uses `kebab-case` for filenames, `PascalCase` for register functions
- `.env` is auto-generated with a secret — never commit it (it's in `.gitignore`)

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_BASE_URL` | — | Upstream REST API base URL |
| `API_KEY` | — | API key or token |
| `API_AUTH_HEADER` | `x-api-key` | Header name for auth injection |
| `API_TIMEOUT_MS` | `10000` | Request timeout in ms |
| `MCP_SECRET` | *(auto-generated)* | Auth header value for MCP clients |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `CORS_ORIGINS` | *(none)* | Comma-separated allowed origins |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms |

## Publishing

When ready to list on AgenticMarket:
1. `npm run validate` — checks server.json, security, endpoints
2. `npm run release` — bumps version + submits
3. Set pricing on [agenticmarket.dev/dashboard/submit](https://agenticmarket.dev/dashboard/submit)
