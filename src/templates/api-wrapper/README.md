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
Edit `.env` to add your API credentials. See `.env.example` for all options.

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

## Configuration

Set these in your `.env`:

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `API_BASE_URL` | — | ✅ | Base URL of the upstream REST API |
| `API_KEY` | — | ✅ | Your API key or token |
| `API_AUTH_HEADER` | `__AUTH_HEADER__` | ✅ | Header name for auth injection |
| `API_TIMEOUT_MS` | `10000` | — | Request timeout in ms |
| `MCP_SECRET` | *(generated)* | Recommended | Secret for MCP client auth |

## Tools

| Tool | Description | Input |
|------|-------------|-------|
| `get_data` | Fetches data from the API | `query: string` |

## Adding Tools

1. Create a new file in `src/tools/` — use `get-data.ts` as a reference
2. Use `apiClient.get()` / `apiClient.post()` to call the upstream API
3. Define your Zod input schema for validation
4. Register in `src/tools/index.ts`
5. Test with `npm run inspect`

**Example pattern:**

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiClient } from "../lib/api-client.js";

export function registerWeatherTool(server: McpServer): void {
  server.tool(
    "get_weather",
    "Get current weather for a city",
    { city: z.string().describe("City name") },
    async ({ city }) => {
      const data = await apiClient.get("/weather", { q: city });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
```

## Architecture

```
AI Agent → MCP tool call
               ↓
         Security Middleware (secret header, HTTPS, CORS)
               ↓
         Rate Limiter (100 req/min per IP)
               ↓
         MCP Server (tool dispatch)
               ↓
         api-client.ts (auth injection, timeout, error mapping)
               ↓
         Upstream REST API
               ↓
         Zod validation → structured response → AI Agent
```

The `api-client.ts` handles auth injection, timeouts, and HTTP-to-MCP error mapping.
You only write: endpoint path + input schema + response mapping.

## Security

All security layers ship enabled by default:

| Layer | Default | Configure via |
|-------|---------|---------------|
| **Secret Header** | ✅ Enabled | `MCP_SECRET` in `.env` |
| **HTTPS Enforcement** | ✅ In production | `NODE_ENV=production` |
| **Rate Limiting** | 100 req/min per IP | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` |
| **CORS** | No origins allowed | `CORS_ORIGINS` (comma-separated) |
| **Header Stripping** | Automatic | `X-Powered-By`, `Server` removed |
| **Request IDs** | UUID per request | `X-Request-ID` header |

## Deploy

### Cloudflare Workers

```bash
npx wrangler deploy
npx wrangler secret put MCP_SECRET
npx wrangler secret put API_KEY
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
