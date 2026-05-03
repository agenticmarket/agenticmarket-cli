# `agenticmarket create` — Build MCP Servers in Under 5 Minutes

> Scaffold a production-ready, security-first MCP server project with one command.

[![npm version](https://img.shields.io/npm/v/agenticmarket)](https://www.npmjs.com/package/agenticmarket)
[![Node.js 20.6+](https://img.shields.io/badge/node-%3E%3D20.6-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## What It Does

```bash
npm install -g agenticmarket
agenticmarket create my-weather-api
cd my-weather-api && npm install && npm run dev
```

You get a **fully working MCP server** with:
- Hono HTTP framework + MCP SDK Streamable HTTP transport
- Secret-header authentication (auto-generated)
- Per-IP rate limiting with `Retry-After` headers
- HTTPS enforcement, CSP headers, CORS controls
- Dev request logger (timestamped, color-coded)
- Session management with idle timeout cleanup
- Graceful shutdown (SIGTERM/SIGINT → clean exit)
- MCP Inspector integration for interactive testing
- `AGENTS.md` for AI coding assistant compatibility
- Deployment configs (Cloudflare Workers / Docker)
- AgenticMarket marketplace publish pipeline

---

## Quick Start

```bash
agenticmarket create my-server
cd my-server
npm install
npm run dev
```

```
  ╔════════════════════════════════════════════════════╗
  ║  ✦ my-server                                      ║
  ╠════════════════════════════════════════════════════╣
  ║  → Local:     http://localhost:3000                ║
  ║  → Health:    http://localhost:3000/health          ║
  ║  → MCP:       http://localhost:3000/mcp             ║
  ║                                                    ║
  ║  Inspector:  npm run inspect  (in another term)    ║
  ║  Publish:    npm run validate → npm run release    ║
  ╚════════════════════════════════════════════════════╝
```

---

## Templates

### Fresh Server (default)

Blank MCP server with one reference tool (`echo`). Start here if building something new.

```bash
agenticmarket create my-server
# → Template: Fresh server
```

### API Wrapper

REST API → MCP bridge. Pre-configured HTTP client with auth injection, timeouts, and error mapping.

```bash
agenticmarket create my-api-wrapper
# → Template: API wrapper
# → Base URL: https://api.example.com
# → Auth: api-key
# → Header: x-api-key
```

Generates `src/lib/api-client.ts` with pre-configured `apiClient.get()`, `apiClient.post()`, etc.

---

## What Gets Generated

```
my-server/
├── src/
│   ├── index.ts                  # Hono server + MCP transport + graceful shutdown
│   ├── middleware/
│   │   ├── security.ts           # Auth, HTTPS, CORS, CSP, header stripping
│   │   ├── rateLimit.ts          # Per-IP sliding window rate limiter
│   │   └── logger.ts             # Dev request logger (auto-disabled in prod)
│   ├── tools/
│   │   ├── index.ts              # Tool registry
│   │   └── echo.ts               # Reference tool with Zod validation
│   └── types.ts                  # Shared TypeScript types + config loader
├── .mcp/
│   └── server.json               # Official MCP registry schema
├── .env                          # Auto-generated with MCP_SECRET
├── .env.example                  # All available env vars documented
├── .gitignore                    # .env, node_modules, dist
├── AGENTS.md                     # AI coding assistant instructions
├── README.md                     # Project-specific docs with badges
├── package.json                  # All scripts pre-configured
├── tsconfig.json                 # Strict TypeScript
├── Dockerfile                    # Multi-stage, non-root, HEALTHCHECK
└── wrangler.toml                 # Cloudflare Workers config
```

---

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev server with hot-reload, `.env` loaded via `--env-file` |
| `npm run inspect` | Open MCP Inspector UI at `localhost:6274` |
| `npm run test:tools` | Run tools in CLI mode (CI-ready, no browser) |
| `npm run build` | Bundle to `dist/` via tsup |
| `npm start` | Run production build with `.env` loading |
| `npm run validate` | Pre-publish security + schema checks |
| `npm run release` | Bump version + publish to AgenticMarket |

---

## Security Architecture

Every security layer ships **enabled by default** and is imported as middleware in `index.ts` — difficult to accidentally remove.

### Layers (in middleware order)

```
Request
  ↓
1. Dev Logger       — timestamped [HH:MM:SS] method path status duration
  ↓
2. Body Limit       — rejects payloads > 1 MB (prevents memory DoS)
  ↓
3. Security         — HTTPS enforcement, secret validation, headers
  ↓
4. Rate Limiter     — per-IP sliding window (100 req/60s default)
  ↓
5. Router           — /health, /mcp (POST/GET/DELETE)
```

### Security Middleware Detail

| Feature | Implementation |
|---------|---------------|
| **Secret header** | Timing-safe constant-time `timingSafeEqual()`. Pads to max length — no length oracle. |
| **HTTPS enforcement** | Hard reject (400) on HTTP in production. Warning (once) in development. |
| **Production secret** | Missing `MCP_SECRET` in production → 500 hard block. Server refuses to operate unsecured. |
| **Header stripping** | `X-Powered-By` and `Server` headers deleted from every response. |
| **CSP** | `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` — MCP servers return JSON only. |
| **X-Frame-Options** | `DENY` — prevents clickjacking even in legacy browsers. |
| **X-Content-Type-Options** | `nosniff` — prevents MIME-type sniffing attacks. |
| **Request ID** | UUID `X-Request-ID` on every response — trace individual requests. |
| **CORS** | No origins allowed by default. `localhost` allowed in dev mode. Configured via `CORS_ORIGINS`. |

### Rate Limiting Detail

Per-IP sliding window. Not fixed buckets.

```
IP 203.0.113.42 hits POST /mcp:

Request 1   @ t=0s    → timestamps: [0]         → ✅ (1/100)
Request 100 @ t=30s   → timestamps: [0..30000]  → ✅ (100/100)
Request 101 @ t=31s   → timestamps: [0..31000]  → ❌ 429
                        Retry-After: 29 seconds
Request 102 @ t=61s   → prune < 1000            → ✅ (old ones expired)
```

- Skips `/health` endpoint (health checks should never rate-limited)
- Stale entries cleaned every 5 minutes (timer uses `.unref()` — won't block exit)
- IP extracted from `x-forwarded-for` (first IP) or `x-real-ip` fallback

### Session Management

- Each MCP client gets isolated `McpServer` + `StreamableHTTPServerTransport`
- Sessions stored in `Map` with `lastActivity` timestamp
- Idle timeout: 30 minutes → auto-close transport + server
- Cleanup runs every 60 seconds (`.unref()` timer)
- DELETE `/mcp` explicitly closes a session
- Graceful shutdown closes all sessions before stopping HTTP

### Graceful Shutdown

Handles `SIGTERM` (Docker/K8s stop) and `SIGINT` (Ctrl+C):

1. Close all active MCP sessions (transport + server)
2. Stop accepting new HTTP connections
3. Exit cleanly (code 0)
4. Force exit after 5 seconds if shutdown hangs (code 1)

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_SECRET` | *(auto-generated)* | Secret for header-based auth |
| `MCP_SECRET_HEADER` | `x-mcp-secret` | Custom header name |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | `development` or `production` |
| `CORS_ORIGINS` | *(none)* | Comma-separated allowed origins |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms |

**API Wrapper additional:**

| Variable | Default | Description |
|----------|---------|-------------|
| `API_BASE_URL` | — | Upstream REST API base URL |
| `API_KEY` | — | API key or token |
| `API_AUTH_HEADER` | *(from scaffold prompt)* | Auth header name |
| `API_TIMEOUT_MS` | `10000` | Request timeout in ms |

---

## Adding Tools

### 1. Create tool file

```typescript
// src/tools/get-weather.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerGetWeatherTool(server: McpServer): void {
  server.tool(
    "get_weather",
    "Get current weather for a city",
    {
      city: z.string().describe("City name, e.g. 'London'"),
      units: z.enum(["celsius", "fahrenheit"]).default("celsius"),
    },
    async ({ city, units }) => {
      // Your logic here
      return {
        content: [{
          type: "text" as const,
          text: `Weather for ${city}: 22°${units === "celsius" ? "C" : "F"}`,
        }],
      };
    },
  );
}
```

### 2. Register in tools/index.ts

```typescript
import { registerGetWeatherTool } from "./get-weather.js";

export function registerTools(server: McpServer): void {
  registerEchoTool(server);
  registerGetWeatherTool(server);
}
```

### 3. Test

```bash
npm run inspect     # Browser UI at localhost:6274
npm run test:tools  # CLI mode for CI
```

---

## AGENTS.md — AI Coding Assistant Support

Every scaffolded project includes an `AGENTS.md` file that teaches AI coding assistants (Cursor, Claude Code, Windsurf, Copilot) how to work in the project.

The AI assistant learns:
- How to add new MCP tools (exact file pattern + registration)
- Which files to never modify (security middleware)
- Import conventions (`node:process`, not bare `process`)
- Tool naming rules (`snake_case`)
- Available npm scripts
- Environment variables

**Result:** Developer opens project in Cursor → says "add a weather tool" → Cursor produces correct code following project conventions. Zero-friction tool creation.

---

## Deployment

### Docker

```bash
docker build -t my-server .
docker run -p 3000:3000 --env-file .env my-server
```

The Dockerfile:
- Multi-stage build (builder → production)
- Node.js 22 Alpine
- Runs as non-root user (`mcpuser`)
- Built-in `HEALTHCHECK` directive
- Uses `--env-file` for .env loading
- npm cache cleaned in production

### Cloudflare Workers

```bash
npx wrangler deploy
npx wrangler secret put MCP_SECRET
```

### Railway / Render / Fly.io

Push to GitHub → connect repo → set env vars in dashboard → deploy.

---

## Dev Request Logger

Every request logged with timestamp, status color, and duration:

```
  [14:32:01] ← POST   /mcp 200 12ms        # green
  [14:32:02] ← GET    /health 200 1ms       # green
  [14:32:05] ← POST   /mcp 401 0ms          # yellow
  [14:32:06] ← POST   /mcp 429 0ms          # yellow
  [14:32:10] ← POST   /mcp 500 3ms          # red
```

- **Green** = 2xx success
- **Yellow** = 4xx client error
- **Red** = 5xx server error
- Auto-disabled when `NODE_ENV=production`

---

## MCP Inspector Integration

Two modes:

**Interactive (browser UI):**
```bash
npm run dev       # Terminal 1: start server
npm run inspect   # Terminal 2: open Inspector at localhost:6274
```
In Inspector: select "Streamable HTTP" → enter `http://localhost:3000/mcp` → add `x-mcp-secret` header → Connect → call tools.

**CLI mode (CI-ready):**
```bash
npm run test:tools
```

---

## Publishing to AgenticMarket

```bash
npm run validate    # Pre-publish checks: server.json schema, security posture, endpoints
npm run release     # Bump version + submit to agenticmarket.dev
```

Set pricing on [agenticmarket.dev/dashboard/submit](https://agenticmarket.dev/dashboard/submit). You earn 80% of every call.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **HTTP** | [Hono](https://hono.dev) | Ultra-fast, 0-dep, middleware-first |
| **MCP** | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | Official SDK, Streamable HTTP transport |
| **Bridging** | [fetch-to-node](https://github.com/nicolo-ribaudo/fetch-to-node) | Hono Fetch↔Node IncomingMessage/ServerResponse |
| **Validation** | [Zod](https://zod.dev) | Type-safe input schemas for tools |
| **TypeScript** | Strict mode | Full type safety across the project |
| **Build** | [tsup](https://tsup.egoist.dev) | Zero-config ESM bundler |
| **Dev** | [tsx](https://tsx.is) | TypeScript execute with hot-reload |

---

## Roadmap

### ✅ Shipped

| Feature | Status |
|---------|--------|
| Fresh + API wrapper templates | ✅ |
| Security middleware (auth, HTTPS, CORS, CSP, headers) | ✅ |
| Per-IP rate limiting with Retry-After | ✅ |
| Body size limit (1 MB) | ✅ |
| Session timeout (30 min idle) | ✅ |
| Graceful shutdown (SIGTERM/SIGINT) | ✅ |
| Dev request logger with timestamps | ✅ |
| Rich startup banner | ✅ |
| AGENTS.md for AI assistants | ✅ |
| MCP Inspector integration | ✅ |
| Hardened Dockerfile (non-root, HEALTHCHECK) | ✅ |
| Auto-generated .env with secret | ✅ |

### 🔜 Next Sprint

| Feature | Description |
|---------|-------------|
| `--json` flag | CI-friendly output for automation pipelines |
| `agenticmarket add tool <name>` | Post-scaffold tool generator (like `ng generate`) |
| Audit logging middleware | Log tool name + IP + timestamp per call |
| `agenticmarket validate` | Pre-publish security audit + schema check |

### 📋 Phase 2

| Feature | Description |
|---------|-------------|
| `agenticmarket publish` | Direct registry submission from CLI |
| Community templates | Template marketplace (RSS, GitHub API, VectorDB wrappers) |
| OAuth 2.1 starter | Optional auth upgrade for enterprise servers |
| Multi-language | Python template support |

---

## Test Coverage

```bash
node test/test-create.js    # 108 assertions — templates, tokens, security, infra
node test/test-e2e.js       # Scaffold → install → run → health → auth check
```

| Category | Assertions |
|----------|-----------|
| File existence | 16 |
| Token resolution | 2 |
| Branding (_meta, badges) | 10 |
| package.json | 10 |
| Security middleware | 11 |
| Rate limiter | 3 |
| .gitignore | 3 |
| API wrapper | 9 |
| MCP transport | 13 |
| Security hardening (CSP, X-Frame) | 3 |
| Infrastructure (body limit, shutdown, sessions) | 10 |
| AGENTS.md | 7 |
| Logger middleware | 5 |
| Startup banner | 3 |
| Name validation | 6 |
| **Total** | **108 + E2E** |

---

## License

MIT — see [LICENSE](./LICENSE)

---

<sub>Built by [AgenticMarket](https://agenticmarket.dev) — the CLI for Model Context Protocol servers.</sub>
