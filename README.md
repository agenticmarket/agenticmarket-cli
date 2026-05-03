# AgenticMarket — Build and Install MCP Servers in One Command

> The CLI for Model Context Protocol servers. Create production-ready MCP servers from scratch, or install existing ones into every IDE — no JSON editing, no manual configuration.

[![npm version](https://img.shields.io/npm/v/agenticmarket)](https://www.npmjs.com/package/agenticmarket)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## TL;DR

**Build a new MCP server:**

```bash
npm install -g agenticmarket
agenticmarket create my-weather-server
cd my-weather-server && npm install && npm run dev
```

**Install an existing MCP server:**

```bash
agenticmarket auth <your-api-key>
agenticmarket install username/server-name
```

`create` scaffolds a production-ready Hono + TypeScript MCP server with security middleware, rate limiting, and deployment config in ~30 seconds.

`install` writes MCP entries into VS Code, Cursor, Claude Desktop, and every other IDE you have — automatically.

**[Browse MCP servers →](https://agenticmarket.dev/servers)**  
**[Get your API key →](https://agenticmarket.dev/dashboard/api-keys)**  
**[Publish your MCP server and earn →](https://agenticmarket.dev/dashboard/submit)**

---

## Contents

- [What Is AgenticMarket](#what-is-agenticmarket)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
  - [`create`](#create) — scaffold a new MCP server
  - [`auth`](#auth) / [`install`](#install) / [`remove`](#remove) / [`list`](#list) / [`balance`](#balance) / [`whoami`](#whoami)
- [Supported IDEs](#supported-ides)
- [How It Works](#how-it-works)
- [For MCP Server Creators](#for-mcp-server-creators)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [FAQ](#faq)
- [License](#license)

---

## What Is AgenticMarket

AgenticMarket is where developers build and install MCP servers in one command and creators earn on every call.

The Model Context Protocol (MCP) is the open standard that lets AI assistants — in VS Code, Cursor, Claude Desktop, and other tools — call external tools and data sources. AgenticMarket is the distribution and monetization layer built on top of it.

**For developers using MCP servers:**  
One command installs any server into every IDE you have. No hunting for JSON config paths. No manual authentication setup. Credits are prepaid and consumed per successful call — you only pay when a tool actually runs.

**For developers publishing MCP servers:**  
Submit your HTTP MCP server to AgenticMarket, get a proxy secret, and start earning 80% of every call routed through the platform. No changes required if you're already serving over HTTPS. The [Founding Creator program](https://agenticmarket.dev/creators) offers 90% revenue share for the first 100 approved creators.

---

## Requirements

- Node.js 20.6 or higher
- For `install` commands: at least one [supported IDE](#supported-ides) and an [AgenticMarket API key](https://agenticmarket.dev/dashboard/api-keys)
- For `create`: no account required

---

## Installation

Install globally via npm:

```bash
npm install -g agenticmarket
```

Or run without installing via npx:

```bash
npx agenticmarket <command>
```

The shorthand alias `amkt` is available after global install:

```bash
amkt install username/server-name
```

---

## Quick Start

```bash
# Step 1 — Authenticate with your API key
agenticmarket auth am_live_xxxx

# Step 2 — Install an MCP server
agenticmarket install agenticmarket/web-reader

# Step 3 — Open your AI assistant
# The tool is ready. No restart required in most IDEs.
```

The CLI detects every IDE installed on your machine and writes the correct configuration automatically. If you are running the command from inside VS Code or Cursor, those entries appear pre-selected at the top of the prompt.

---

## Commands

### `create`

Scaffold a new MCP server project with security middleware, rate limiting, and deployment config.

```bash
agenticmarket create <project-name>
agenticmarket create my-weather-api
```

**Option A: Fresh Server** (Start from scratch)
![Fresh Server Scaffold UI](https://cdn.agenticmarket.dev/docs/fresh-mcp-creation-terminal-ui.jpg)

**Option B: API Wrapper** (Turn an existing REST API into an MCP server)
![API Wrapper Scaffold UI](https://cdn.agenticmarket.dev/docs/api-wrapper-terminal-ui.jpg)

Interactive prompts ask for:

| Prompt | Options |
|--------|---------|
| **Template** | `Fresh server` (blank) or `API wrapper` (REST API → MCP bridge) |
| **Deploy target** | Cloudflare Workers, Docker (Railway/Render), or None |
| **Secret auth** | Auto-generates `MCP_SECRET` in `.env` |
| **API config** *(wrapper only)* | Base URL, auth type, auth header |

**What you get:**

```
my-weather-api/
├── src/
│   ├── index.ts              # Hono server + MCP transport
│   ├── middleware/
│   │   ├── security.ts       # HTTPS, secret header, CORS, header stripping
│   │   └── rateLimit.ts      # Per-IP sliding window (100 req/min)
│   ├── tools/
│   │   ├── index.ts          # Tool registry
│   │   └── echo.ts           # Reference tool (Zod validated)
│   └── types.ts
├── .mcp/server.json          # Official MCP registry schema
├── .env                      # Auto-generated secret
├── .env.example
├── package.json              # dev, build, inspect, validate, release scripts
├── tsconfig.json
├── wrangler.toml             # or Dockerfile, depending on deploy target
└── README.md
```

**Security layers** ship enabled by default and are imported as middleware — difficult to accidentally remove:

- Secret header validation (timing-safe constant-time comparison)
- HTTPS enforcement in production (hard reject on HTTP)
- Per-IP rate limiting with `Retry-After` headers
- CORS (no origins by default)
- `X-Powered-By` / `Server` header stripping
- Production requires `MCP_SECRET` (500 if missing)
- CSP headers + X-Frame-Options DENY
- Body size limit (1 MB — prevents memory DoS)
- Session idle timeout (30 min auto-cleanup)
- Graceful shutdown on SIGTERM/SIGINT

**After scaffolding:**

```bash
cd my-weather-api
npm install
npm run dev        # server at http://localhost:3000
npm run inspect    # MCP Inspector UI at localhost:6274
```

→ **[Full `create` documentation — security details, architecture, roadmap](./CREATE.md)**

---

### `auth`

Save and verify your API key locally.

```bash
agenticmarket auth <api-key>
```

Your key is stored in `~/.agenticmarket/config.json`. It is never transmitted anywhere except the AgenticMarket platform to authenticate your requests.

---

### `install`

Install an MCP server into your IDE configuration files.

```bash
agenticmarket install <username>/<server-name>

# The @ prefix is optional — both are equivalent
agenticmarket install @alice/summarizer
agenticmarket install alice/summarizer
```

The CLI will:

1. Verify the server exists on AgenticMarket
2. Detect every IDE installed on your machine
3. Present a selection prompt — your active IDE's options appear first
4. Write the MCP configuration entry for each selected target, creating config directories if they do not exist

**Smart pre-selection** — if you run the command from inside VS Code, Cursor, Windsurf, or Gemini CLI, that IDE's project and global options are pre-ticked.

**Name conflict resolution** — if a server with the same name is already installed from a different author, you are prompted to assign an alias so both coexist without overwriting each other.

---

### `remove`

Remove an MCP server from all IDE configurations it was installed to.

```bash
agenticmarket remove <server-name>
```

---

### `list`

Show all AgenticMarket MCP servers currently installed across your IDEs.

```bash
agenticmarket list
```

---

### `balance`

Check your current credit balance.

```bash
agenticmarket balance
```

---

### `whoami`

Display your current account details.

```bash
agenticmarket whoami
```

---

## Supported IDEs

The CLI automatically detects which IDEs are installed on your machine by checking well-known configuration paths. Only IDEs that are actually present on your system appear in the selection menu.

> If an IDE does not appear in the prompt, it is not installed or has not been opened at least once to initialise its config directory.

### Detection and Scope

Each IDE supports one or both of:

- **Project** — configuration lives inside your project folder (e.g. `.cursor/mcp.json`). Can be committed with your project and shared with your team.
- **Global** — configuration lives in your home or app-data directory. Available across all projects.

| IDE | Project Config | Global Config | Detection Signal |
|---|---|---|---|
| **VS Code** | `.vscode/mcp.json` | See paths below | VS Code user-data dir exists |
| **Cursor** | `.cursor/mcp.json` | `~/.cursor/mcp.json` | `~/.cursor` dir exists |
| **Claude Desktop** | — | See paths below | App config dir exists |
| **Claude Code** | `.mcp.json` | `~/.claude.json` | `~/.claude` dir exists |
| **Windsurf** | — | `~/.codeium/windsurf/mcp_config.json` | `~/.codeium/windsurf` dir exists |
| **Gemini CLI** | `.gemini/settings.json` | `~/.gemini/settings.json` | `~/.gemini` dir exists |
| **Zed** | — | See paths below | Zed config dir exists |
| **Cline** (VS Code ext) | — | VS Code globalStorage | Extension settings dir exists |
| **Codex** | — | `~/.codex/config.json` | `~/.codex` dir exists |
| **Antigravity** | `.gemini/antigravity/mcp_config.json` | `~/.gemini/antigravity/mcp_config.json` | `~/.gemini/antigravity` dir exists |

### Platform-Specific Global Paths

| IDE | Windows | macOS | Linux |
|---|---|---|---|
| VS Code | `%APPDATA%\Code\User\mcp.json` | `~/Library/Application Support/Code/User/mcp.json` | `~/.config/Code/User/mcp.json` |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `~/Library/Application Support/Claude/claude_desktop_config.json` | `~/.config/claude/claude_desktop_config.json` |
| Zed | `%APPDATA%\Zed\settings.json` | `~/Library/Application Support/Zed/settings.json` | `~/.config/zed/settings.json` |

---

## How It Works

```
Your AI assistant calls a tool
  → AgenticMarket authenticates your API key
  → Your credit balance is verified
  → The request is forwarded to the creator's MCP server
  → The result is returned to your AI assistant
  → Credits are deducted only on a successful response
```

Charges apply **per successful tool call only**. If the server is unreachable or returns an error, you are not charged.

The CLI writes MCP server entries using just the plain server name as the key (e.g. `web-reader`, not `agenticmarket/web-reader`). This ensures compatibility across all MCP clients — slashes in server names cause parsing issues in several IDEs.

---

## For MCP Server Creators

If you have built an MCP server and want it to earn revenue, AgenticMarket handles the distribution, authentication, billing, and payouts.

**What you need:**

- A publicly accessible HTTPS endpoint serving the MCP protocol
- An [AgenticMarket account](https://agenticmarket.dev)

**How publishing works:**

1. Submit your server at [agenticmarket.dev/dashboard/submit](https://agenticmarket.dev/dashboard/submit)
2. The AgenticMarket team reviews it within 24 hours
3. On approval, you receive a proxy secret to validate in your server
4. Users install your server via the CLI — you earn 80% of every call
5. Withdraw earnings via Wise (global) or Razorpay (India) once you reach the $20 minimum

**Founding Creator program:**  
The first 100 approved creators earn 90% revenue share for 12 months, receive featured placement, priority review, and a permanent Founding Creator badge. [Learn more →](https://agenticmarket.dev/creators)

---

## Project Structure

```
bin/
  cli.js                  Entry point and command router
src/
  config.js               IDE registry, detection, config read/write, API key storage
  commands/
    create.js             Scaffold engine — prompts, template copy, token substitution
    auth.js               Save and verify API key
    balance.js            Check credit balance
    install.js            Install an MCP server into IDE config files
    list.js               List installed MCP servers
    remove.js             Remove an MCP server from IDE config files
    whoami.js             Show account info
    logout.js             Clear stored API key
  templates/
    fresh/                Blank MCP server template (Hono + MCP SDK)
    api-wrapper/          REST API → MCP bridge template
```

---

## Local Development

```bash
# Install dependencies
npm install

# Run any command locally without global install
node bin/cli.js --help
node bin/cli.js auth <api-key>
node bin/cli.js install username/server-name
node bin/cli.js list
node bin/cli.js remove server-name
```

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss the proposed change.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-change`
3. Commit your changes: `git commit -m 'add: my change'`
4. Push and open a pull request

Please note the [license terms](#license) before contributing. By submitting a pull request you agree that your contribution will be governed by the same license.

---

## FAQ

### What is the Model Context Protocol (MCP)?

MCP is an open standard developed by Anthropic that lets AI assistants call external tools, APIs, and data sources during a conversation. When you ask an AI assistant to read a webpage, check a URL, or query an API, it uses an MCP server to do that. AgenticMarket is the platform where developers find, install, and monetize those servers.

### How do I install an MCP server into VS Code?

Run `npm install -g agenticmarket`, authenticate with `agenticmarket auth <your-key>`, then run `agenticmarket install username/server-name`. The CLI detects VS Code automatically and writes the correct entry into `.vscode/mcp.json` or the global VS Code MCP config. No manual JSON editing required.

### How do I install an MCP server into Cursor?

Same process. After authenticating, run `agenticmarket install username/server-name`. If you run the command from inside Cursor, the Cursor project and global options appear pre-selected in the IDE prompt. The CLI writes the entry into `.cursor/mcp.json` or `~/.cursor/mcp.json` depending on your selection.

### Does this work with Claude Desktop?

Yes. AgenticMarket automatically detects Claude Desktop and writes to the correct platform-specific config path — `claude_desktop_config.json` on Windows and macOS, `~/.config/claude/claude_desktop_config.json` on Linux.

### How does billing work?

AgenticMarket uses a prepaid credits system. You purchase credits ($15 minimum, no expiry) and they are consumed per successful MCP tool call. If a call fails or the server is unreachable, you are not charged. You can check your balance at any time with `agenticmarket balance`.

### Can I install the same MCP server into multiple IDEs at once?

Yes. The install prompt lets you select multiple targets in one command. You can install to VS Code project config, VS Code global, Cursor global, and Claude Desktop all in a single `agenticmarket install` run.

### What IDEs are supported?

VS Code, Cursor, Claude Desktop, Claude Code, Windsurf, Gemini CLI, Zed, Cline (VS Code extension), Codex, and Antigravity. See the [Supported IDEs](#supported-ides) section for the full detection and configuration path details.

### I built an MCP server. How do I publish it and start earning?

Submit your server at [agenticmarket.dev/dashboard/submit](https://agenticmarket.dev/dashboard/submit). Your server needs to be a publicly accessible HTTPS endpoint implementing the MCP protocol. After a 24-hour review, you receive a proxy secret to validate on your server. From that point, every call users make through the platform earns you 80% of the call price. The first 100 approved creators earn 90% for 12 months under the Founding Creator program.

### How do I create my own MCP server from scratch?

Run `agenticmarket create my-server`. The CLI scaffolds a production-ready Hono + TypeScript project with security middleware, rate limiting, Zod-validated tools, and deployment config. Choose the `Fresh server` template for a blank server or `API wrapper` to bridge an existing REST API. After scaffolding, run `npm install && npm run dev` to start, then `npm run inspect` to test with the MCP Inspector.

### Is the CLI open source?

The source code is publicly visible on GitHub under the MIT license. See [LICENSE](./LICENSE) for the full terms.

### Where can I find MCP servers to install?

Browse all available servers at [agenticmarket.dev/servers](https://agenticmarket.dev/servers). AgenticMarket publishes and maintains a set of general-purpose servers under the `@agenticmarket` namespace — including `web-reader`, `rss-reader`, `url-status`, `site-metadata`, `sitemap-reader`, and `json-tools` — available immediately after you authenticate.

---

## Links

- [agenticmarket.dev](https://agenticmarket.dev) — Platform homepage
- [agenticmarket.dev/servers](https://agenticmarket.dev/servers) — Browse MCP servers
- [agenticmarket.dev/docs](https://agenticmarket.dev/docs) — Full documentation
- [agenticmarket.dev/pricing](https://agenticmarket.dev/pricing) — Credits and pricing
- [agenticmarket.dev/docs/founding-creator](https://agenticmarket.dev/docs/founding-creator) — Founding Creator program
- [support@agenticmarket.dev](mailto:support@agenticmarket.dev) — Support

---

## License

MIT — see LICENSE file for details.

Support contact [support@agenticmarket.dev](mailto:support@agenticmarket.dev).