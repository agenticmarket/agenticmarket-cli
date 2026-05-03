# __PROJECT_NAME__

[![Built with AgenticMarket](https://agenticmarket.dev/badge/built-with.svg)](https://agenticmarket.dev)
[![Security First](https://agenticmarket.dev/badge/security-first.svg)](https://agenticmarket.dev/docs/security)
[![MCP Compatible](https://agenticmarket.dev/badge/mcp.svg)](https://modelcontextprotocol.io)

> __DESCRIPTION__

## Quick Start

```bash
npm install
npm run dev            # starts server at http://localhost:3000
```

Your `.env` was pre-configured during scaffolding with a generated `MCP_SECRET`.
Edit `.env` to adjust settings. See `.env.example` for all available options.

## Development

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev server with hot-reload (port 3000) |
| `npm run inspect` | Open MCP Inspector UI at localhost:6274 |
| `npm run test:tools` | Run tools in CLI mode (CI-ready) |
| `npm run build` | Bundle for production (`dist/`) |
| `npm start` | Run production build |

<br />

![Inspector UI](https://cdn.agenticmarket.dev/docs/Screenshot_3-5-2026_175552_localhost.jpeg)

## Tools

| Tool | Description | Input |
|------|-------------|-------|
| `echo` | Echoes back the provided message | `message: string` |

## Adding Tools

1. Create a new file in `src/tools/` — use `echo.ts` as a reference
2. Define your Zod input schema for type-safe validation
3. Register the tool in `src/tools/index.ts`
4. Test with `npm run inspect`

**Example pattern:**

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerMyTool(server: McpServer): void {
  server.tool(
    "my_tool",
    "Description for AI agent discovery",
    { input: z.string().describe("What this input is for") },
    async ({ input }) => ({
      content: [{ type: "text" as const, text: `Result: ${input}` }],
    }),
  );
}
```

## Architecture

```
Request → Security Middleware → Rate Limiter → Hono Router
                                                  ├─ GET  /health  → status check
                                                  ├─ POST /mcp     → MCP tool calls
                                                  ├─ GET  /mcp     → SSE notifications
                                                  └─ DEL  /mcp     → close session
```

## Security

All security layers ship enabled by default and are **difficult to accidentally remove** —
they're imported as middleware in `src/index.ts`.

| Layer | Default | Configure via |
|-------|---------|---------------|
| **Secret Header** | ✅ Enabled (auto-generated) | `MCP_SECRET` in `.env` |
| **HTTPS Enforcement** | ✅ In production | `NODE_ENV=production` |
| **Rate Limiting** | 100 req/min per IP | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` |
| **CORS** | No origins allowed | `CORS_ORIGINS` (comma-separated) |
| **Header Stripping** | `X-Powered-By`, `Server` removed | Automatic |
| **Request IDs** | UUID per request | `X-Request-ID` response header |

### How Rate Limiting Works

Per-IP sliding window. Each IP gets a list of request timestamps. When a new request
arrives, old timestamps (outside the window) are pruned. If remaining count ≥ max,
the request is rejected with `429 Too Many Requests` and a `Retry-After` header.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_SECRET` | *(generated)* | Secret for `x-mcp-secret` header auth |
| `MCP_SECRET_HEADER` | `x-mcp-secret` | Custom header name for auth |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | `development` or `production` |
| `CORS_ORIGINS` | *(none)* | Comma-separated allowed origins |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window size in milliseconds |

## Deploy

### Cloudflare Workers

```bash
npx wrangler deploy
```

Set `MCP_SECRET` as a Wrangler secret:
```bash
npx wrangler secret put MCP_SECRET
```

### Railway / Render / Fly.io

Push to GitHub → connect repo → set env vars → deploy.

### Docker

```bash
docker build -t __PROJECT_NAME__ .
docker run -p 3000:3000 --env-file .env __PROJECT_NAME__
```

## Publish to AgenticMarket

List your server on [AgenticMarket](https://agenticmarket.dev) and earn revenue
per API call. You set pricing, we handle billing and distribution.

```bash
npm run validate       # pre-publish checks
npm run release        # bump version + publish
```

→ [Submit your server](https://agenticmarket.dev/dashboard/submit)
→ [Publishing docs](https://agenticmarket.dev/docs/publishing)

## License

MIT

---

<!-- Built with agenticmarket create — agenticmarket.dev -->
