# AgenticMarket CLI

> Install AI skills into your IDE in seconds — no JSON editing, no manual config.

AgenticMarket is a marketplace for MCP (Model Context Protocol) skills. This CLI lets you browse, install, and manage skills directly from your terminal. seamlessly.

---

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Supported IDEs](#supported-ides)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Contributing](#contributing)

---

## Requirements

- Node.js 18 or higher
- One of the [supported IDEs](#supported-ides) installed
- An AgenticMarket account and API key

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

---

## Quick Start

```bash
# 1. Authenticate with your API key
agenticmarket auth <your-api-key>

# 2. Check your credit balance
agenticmarket balance

# 3. Install a skill
agenticmarket install username/skill-name

# 4. Restart your IDE, then ask your AI to use the skill
```

---

## Commands

### `auth`
Save and verify your API key locally.

```bash
agenticmarket auth <api-key>
```

Your key is stored in `~/.agenticmarket/config.json`. It is never sent anywhere except the AgenticMarket proxy to authenticate your requests.
Keep it Secure.

---

### `install`
Install a skill into your IDE's MCP config.

```bash
agenticmarket install <username>/<skill-name>

# The @ prefix is optional — both work
agenticmarket install @alice/summarizer
agenticmarket install alice/summarizer
```

The CLI will:
1. Verify the skill exists on the marketplace
2. Detect all supported IDEs on your machine
3. Ask which IDE(s) to install to
4. Write the MCP config entry automatically

**Name conflicts** — if a skill with the same name is already installed from a different author, you'll be prompted to choose an alias so both can coexist:

```
⚠ A different skill is already installed under the name "summarizer".

  Choose an alias:
  ❯ alice-summarizer
    summarizer-2
    summarizer-am
    Enter a custom name...
```

---

### `remove`
Remove a skill from your IDE's MCP config.

```bash
agenticmarket remove <skill-name>
```

---

### `list`
Show all skills currently installed across your IDEs.

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

## Supported IDEs

| IDE | Config location |
|---|---|
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |
| **Cursor** (global) | `~/.cursor/mcp.json` |
| **Cursor** (project) | `.cursor/mcp.json` in current directory |
| **VS Code** | `.vscode/mcp.json` in current directory |

The CLI detects which IDE you're running in and pre-selects it. If multiple IDEs are found, you can choose which ones to install to.

> **Linux users:** Claude Desktop config is read from `~/.config/claude/claude_desktop_config.json`.

---

## How It Works

```
Your IDE (MCP client)
  → POST /mcp/<username>/<skill>   (with x-api-key header)
  → AgenticMarket Proxy            (Cloudflare Worker)
      ├─ Authenticates your key
      ├─ Checks your credit balance
      ├─ Forwards request to the skill creator's MCP server
      └─ Deducts credits on success
  → Response returned to your IDE
```

Skills are charged **per tool call**, only on success. If the upstream server is unreachable or returns an error, you are not charged.

The CLI installs skills using just the plain skill name as the MCP server key (e.g. `summarizer`, not `alice/summarizer`). This ensures compatibility across all MCP clients — slashes in server names cause issues in most IDEs.

---

## Project Structure

```
bin/
  cli.js               ← Entry point and command router
src/
  config.js            ← API key storage, IDE detection, MCP config read/write
  commands/
    auth.js            ← Save and verify API key
    balance.js         ← Check credit balance
    install.js         ← Install a skill into IDE config files
    list.js            ← List installed skills
    remove.js          ← Remove a skill from IDE config files
```

---

## Local Development

```bash
# Install dependencies
npm install

# Run any command locally
node bin/cli.js --help
node bin/cli.js auth <api-key>
node bin/cli.js balance
node bin/cli.js install username/skill-name
node bin/cli.js list
node bin/cli.js remove skill-name
```


---

## Contributing

Pull requests are welcome. For significant changes, please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-change`
3. Commit your changes: `git commit -m 'add: my change'`
4. Push and open a pull request

---

## License

MIT