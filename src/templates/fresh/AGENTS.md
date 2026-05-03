# AGENTS.md — Instructions for AI Coding Assistants

> This file provides context for AI coding tools (Cursor, Claude Code, Windsurf, Copilot, etc.)
> so they understand how to work in this project correctly.

## Project Type

This is an **MCP (Model Context Protocol) server** built with:
- **Hono** — HTTP framework
- **@modelcontextprotocol/sdk** — Official MCP SDK with Streamable HTTP transport
- **TypeScript** — Strict mode enabled
- **Zod** — Input validation for all tool parameters

## Adding a New Tool

1. Create `src/tools/<tool-name>.ts`
2. Export a register function following this exact pattern:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerMyTool(server: McpServer): void {
  server.tool(
    "my_tool",                                    // snake_case name
    "Clear description for AI agent discovery",   // what does this tool do?
    {
      input: z.string().describe("What this input is for"),
    },
    async ({ input }) => ({
      content: [{ type: "text" as const, text: `Result: ${input}` }],
    }),
  );
}
```

3. Register in `src/tools/index.ts`:

```typescript
import { registerMyTool } from "./my-tool.js";

export function registerTools(server: McpServer): void {
  // ... existing tools
  registerMyTool(server);
}
```

4. Test: `npm run inspect` → open Inspector UI → call the tool

## File Structure

```
src/
├── index.ts              # Server entry — Hono + MCP transport (rarely needs changes)
├── middleware/
│   ├── security.ts       # HTTPS, secret auth, CORS, headers (DO NOT REMOVE)
│   ├── rateLimit.ts      # Per-IP rate limiting (DO NOT REMOVE)
│   └── logger.ts         # Dev request logging (auto-disabled in production)
├── tools/
│   ├── index.ts          # Tool registry — import + register all tools here
│   └── echo.ts           # Reference tool implementation
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
- **Tool names** must be `snake_case` (MCP convention)
- **Tool descriptions** should be written for AI agents, not humans — be specific about what the tool does, what input it expects, and what it returns
- **File naming** uses `kebab-case` for filenames, `PascalCase` for register functions
- `.env` is auto-generated with a secret — never commit it (it's in `.gitignore`)

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_SECRET` | *(auto-generated)* | Auth header value |
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
