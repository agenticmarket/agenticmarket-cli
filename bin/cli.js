#!/usr/bin/env node

/**
 * bin/cli.js — AgenticMarket CLI
 *
 * Commands:
 *   agenticmarket create <name>              — scaffold a new MCP server project
 *   agenticmarket create <name> --json        — scaffold with JSON output (CI mode)
 *   agenticmarket add tool <name>             — add a new tool to an existing project
 *   agenticmarket validate                    — pre-publish security audit
 *   agenticmarket auth <api-key>            — save your API key
 *   agenticmarket install <user>/<skill>    — add an official server to your IDE
 *   agenticmarket install <slug>            — add a community server to your IDE
 *   agenticmarket remove <server-name>      — remove an installed MCP server
 *   agenticmarket list                      — show installed servers
 *   agenticmarket balance                   — check your credits
 *   agenticmarket whoami                    — display current user info
 *   agenticmarket logout                    — clear API key
 */

import chalk from "chalk";
import { auth } from "../src/commands/auth.js";
import { install } from "../src/commands/install.js";
import { installCommunity } from "../src/commands/install-community.js";
import { remove } from "../src/commands/remove.js";
import { list } from "../src/commands/list.js";
import { balance } from "../src/commands/balance.js";
import { logout } from "../src/commands/logout.js";
import { whoami } from "../src/commands/whoami.js";
import { proxy } from "../src/commands/proxy.js";
import { create } from "../src/commands/create.js";
import { validate } from "../src/commands/validate.js";
import { addTool } from "../src/commands/add-tool.js";

const VERSION = "2.0.0";
const args = process.argv.slice(2);
const command = args[0];
const argument = args[1];
const flags = args.filter((a) => a.startsWith("--"));

// ─── Terminal UI Primitives ───────────────────────────────────────────────────

const c = {
  // Layout
  line: (w = 58) => "─".repeat(w),
  box: (title) => {
    const pad = "═".repeat(58);
    console.log("");
    console.log(chalk.cyan.bold(`╔${pad}╗`));
    console.log(chalk.cyan.bold(`║  ${title.padEnd(56)}║`));
    console.log(chalk.cyan.bold(`╚${pad}╝`));
  },

  // Status icons
  ok: (msg) => console.log(`  ${chalk.green("✓")} ${msg}`),
  warn: (msg) => console.log(`  ${chalk.yellow("⚠")} ${msg}`),
  err: (msg) => console.log(`  ${chalk.red("✗")} ${chalk.red(msg)}`),
  info: (msg) => console.log(`  ${chalk.cyan("›")} ${msg}`),
  bullet: (msg) => console.log(`  ${chalk.dim("·")} ${msg}`),

  // Labeled rows (key → value)
  row: (label, value, valueColor = chalk.white) =>
    console.log(`  ${chalk.dim(label.padEnd(14))} ${valueColor(value)}`),

  // Section divider
  divider: () => console.log(chalk.dim(`  ${"─".repeat(52)}`)),

  // Empty line
  gap: () => console.log(""),
};

// ─── Brand Header ─────────────────────────────────────────────────────────────

const header = () => {
  console.log("");
  console.log(
    chalk.bold.white(
      " █████╗  ██████╗ ███████╗███╗   ██╗████████╗██╗ ██████╗ ",
    ),
  );
  console.log(
    chalk.bold.white(
      "██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██║██╔════╝ ",
    ),
  );
  console.log(
    chalk.bold.white(
      "███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ██║██║      ",
    ),
  );
  console.log(
    chalk.bold.white(
      "██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ██║██║      ",
    ),
  );
  console.log(
    chalk.bold.white(
      "██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ██║╚██████╗ ",
    ),
  );
  console.log(
    chalk.bold.white(
      "╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝ ╚═════╝ ",
    ),
  );
  console.log(
    chalk.cyan.bold("███╗   ███╗ █████╗ ██████╗ ██╗  ██╗███████╗████████╗    "),
  );
  console.log(
    chalk.cyan.bold("████╗ ████║██╔══██╗██╔══██╗██║ ██╔╝██╔════╝╚══██╔══╝    "),
  );
  console.log(
    chalk.cyan.bold(
      "██╔████╔██║███████║██████╔╝█████╔╝ █████╗     ██║        ",
    ),
  );
  console.log(
    chalk.cyan.bold(
      "██║╚██╔╝██║██╔══██║██╔══██╗██╔═██╗ ██╔══╝     ██║        ",
    ),
  );
  console.log(
    chalk.cyan.bold(
      "██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██╗███████╗   ██║        ",
    ),
  );
  console.log(
    chalk.cyan.bold(
      "╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝        ",
    ),
  );
  console.log("");
  console.log(chalk.dim(`  v${VERSION}  ·  Build and Install MCP servers in One Command`));
  console.log(chalk.dim(`  ${"─".repeat(52)}`));
  console.log("");
};

// ─── Help ─────────────────────────────────────────────────────────────────────

const help = () => {
  header();

  // Commands section
  c.box("Commands");
  c.gap();

  // Pad the raw strings BEFORE applying chalk so ANSI codes don't break alignment
  const cmd = (name, args, desc) => {
    const col1 = chalk.cyan(name.padEnd(10));
    const col2 = chalk.yellow(args.padEnd(22));
    const col3 = chalk.dim(desc);
    console.log(`  ${col1}${col2}${col3}`);
  };

  cmd("create", "<name>", "Scaffold a new MCP server project");
  cmd("create", "<name> --json", "Scaffold with JSON output (CI mode)");
  cmd("add", "tool <name>", "Add a new tool to an existing project");
  cmd("validate", "", "Pre-publish security audit");
  cmd("auth", "<api-key>", "Save your API key");
  cmd("install", "<username>/<server>", "Install an official MCP server");
  cmd("install", "<slug>", "Install a community MCP server");
  cmd("remove", "<server-name>", "Remove an installed MCP server");
  cmd("list", "", "Show all installed MCP servers");
  cmd("balance", "", "Check your credit balance");
  cmd("whoami", "", "Show current account info");
  cmd("logout", "", "Log out of your account");

  c.gap();
  c.divider();
  c.gap();

  // Examples section
  console.log(chalk.bold("  Examples:"));
  c.gap();

  const ex = (line) => console.log(`  ${chalk.dim("$")} ${chalk.white(line)}`);
  console.log(chalk.dim("  # Create a new MCP server"));
  ex("agenticmarket create my-weather-server");
  c.gap();
  ex("agenticmarket auth am_live_xxxxxxxxxxxx");
  c.gap();
  console.log(chalk.dim("  # Official servers (proxy)"));
  ex("agenticmarket install shekhar/smart-server");
  ex("agenticmarket install shekhar/web-scraper");
  c.gap();
  console.log(chalk.dim("  # Community servers (direct)"));
  ex("agenticmarket install fetch-mcp-server");
  ex("agenticmarket install github-mcp-server");
  c.gap();
  ex("agenticmarket remove web-scraper");
  ex("agenticmarket list");
  ex("agenticmarket balance");

  c.gap();
  c.divider();
  c.gap();

  // Tips
  console.log(
    `  ${chalk.dim("Tip:")} Use ${chalk.green.bold("amkt")} as shorthand — ${chalk.dim("amkt install shekhar/web-scraper")}`,
  );
  console.log(
    `  ${chalk.dim("Key:")} Get your API key at ${chalk.cyan.underline("https://agenticmarket.dev/dashboard/api-keys")}`,
  );
  c.gap();
};

// ─── Error helpers ────────────────────────────────────────────────────────────

const argError = (cmd, usage) => {
  c.gap();
  c.err(`Missing argument for ${chalk.white(cmd)}`);
  c.info(`Usage: ${chalk.cyan("agenticmarket " + cmd)} ${chalk.yellow(usage)}`);
  c.gap();
  process.exit(1);
};

const unknownCmd = (cmd) => {
  c.gap();
  c.err(`Unknown command: ${chalk.white(cmd)}`);
  c.info(`Run ${chalk.cyan("agenticmarket --help")} to see available commands`);
  c.gap();
  process.exit(1);
};

// ─── Router ───────────────────────────────────────────────────────────────────

switch (command) {
  case "create":
    await create(argument, { json: flags.includes("--json") });
    break;

  case "add":
    if (argument === "tool") {
      await addTool(args[2]);
    } else {
      argError("add", "tool <name>");
    }
    break;

  case "validate":
    const result = await validate();
    if (result.fail > 0) process.exit(1);
    break;

  case "auth":
    if (!argument) argError("auth", "<api-key>");
    await auth(argument);
    break;

  case "install":
    if (!argument) argError("install", "<username>/<server> or <slug>");
    // Official servers use "username/server" format, community use a plain slug
    if (argument.includes("/")) {
      await install(argument);
    } else {
      await installCommunity(argument);
    }
    break;

  case "i":
    if (!argument) argError("install", "<username>/<server> or <slug>");
    if (argument.includes("/")) {
      await install(argument);
    } else {
      await installCommunity(argument);
    }
    break;

  case "remove":
    if (!argument) argError("remove", "<skill>");
    await remove(argument);
    break;

  case "list":
    await list();
    break;

  case "balance":
    await balance();
    break;

  case "whoami":
    await whoami();
    break;

  case "logout":
    await logout();
    break;

  case "--version":
  case "-v":
    console.log(
      `  ${chalk.bold.white("⚡ AgenticMarket")} ${chalk.dim(`v${VERSION}`)}`,
    );
    console.log("");
    break;
  case "proxy":
    if (!argument) argError("proxy", "<username>/<skill>");
    await proxy(argument);
    break;

  case "--help":
  case "-h":
  case undefined:
    help();
    break;

  default:
    unknownCmd(command);
}
