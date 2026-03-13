#!/usr/bin/env node

/**
 * bin/cli.js — AgenticMarket CLI
 *
 * Commands:
 *   agenticmarket auth <api-key>            — save your API key
 *   agenticmarket install <user>/<skill>    — add skill to your IDE
 *   agenticmarket remove <skill>            — remove skill from your IDE
 *   agenticmarket list                      — show installed skills
 *   agenticmarket balance                   — check your credits
 *   agenticmarket whoami                    — display current user info
 *   agenticmarket logout                    — clear API key
 */

import chalk from "chalk";
import { auth } from "../src/commands/auth.js";
import { install } from "../src/commands/install.js";
import { remove } from "../src/commands/remove.js";
import { list } from "../src/commands/list.js";
import { balance } from "../src/commands/balance.js";
import { logout } from "../src/commands/logout.js";
import { whoami } from "../src/commands/whoami.js";
import { proxy } from "../src/commands/proxy.js";

const VERSION = "1.2.1";
const args = process.argv.slice(2);
const command = args[0];
const argument = args[1];

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
  console.log(chalk.dim(`  v${VERSION}  ·  The MCP skill marketplace`));
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

  cmd("auth", "<api-key>", "Save your API key");
  cmd("install", "<username>/<skill>", "Install a skill to your IDE");
  cmd("remove", "<skill>", "Remove an installed skill");
  cmd("list", "", "Show all installed skills");
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
  ex("agenticmarket auth am_live_xxxxxxxxxxxx");
  ex("agenticmarket install shekhar/smart-skill");
  ex("agenticmarket install shekhar/web-scraper");
  ex("agenticmarket remove security-scanner");
  ex("agenticmarket balance");

  c.gap();
  c.divider();
  c.gap();

  // Tips
  console.log(
    `  ${chalk.dim("Tip:")} Use ${chalk.green.bold("amkt")} as shorthand — ${chalk.dim("amkt install shekhar/web-scraper")}`,
  );
  console.log(
    `  ${chalk.dim("Key:")} Get your API key at ${chalk.cyan.underline("https://agenticmarket.dev")}`,
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
  case "auth":
    if (!argument) argError("auth", "<api-key>");
    await auth(argument);
    break;

  case "install":
    if (!argument) argError("install", "<username>/<skill>");
    await install(argument);
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
