#!/usr/bin/env node

/**
 * bin/cli.js — AgenticMarket CLI
 * 
 * Commands:
 *   agenticmarket auth <api-key>       — save your API key
 *   agenticmarket install <skill>      — add skill to your IDE
 *   agenticmarket remove <skill>       — remove skill from your IDE
 *   agenticmarket list                 — show installed skills
 *   agenticmarket balance              — check your credits
 *   agenticmarket search <query>       — find skills on marketplace
 *   agenticmarket logout               — log out of your account (clear API key)
 */

import chalk from "chalk";
import { auth } from "../src/commands/auth.js";
import { install } from "../src/commands/install.js";
import { remove } from "../src/commands/remove.js";
import { list } from "../src/commands/list.js";
import { balance } from "../src/commands/balance.js";
import { logout } from "../src/commands/logout.js";

const VERSION = "0.1.0";
const args = process.argv.slice(2);
const command = args[0];
const argument = args[1];

// ── Header ────────────────────────────────────────────
const header = () => {
  console.log("");
  console.log(chalk.bold.white("  ⚡ AgenticMarket") + chalk.dim(` v${VERSION}`));
  console.log(chalk.dim("  The MCP skill marketplace"));
  console.log("");
};

// ── Help ─────────────────────────────────────────────
const help = () => {
  header();
  console.log(chalk.bold("  Usage:"));
  console.log("");
  console.log(`  ${chalk.cyan("agenticmarket auth")} ${chalk.yellow("<api-key>")}     Save your API key`);
  console.log(`  ${chalk.cyan("agenticmarket install")} ${chalk.yellow("<skill>")}   Install a skill to your IDE`);
  console.log(`  ${chalk.cyan("agenticmarket remove")} ${chalk.yellow("<skill>")}    Remove a skill`);
  console.log(`  ${chalk.cyan("agenticmarket list")}               Show installed skills`);
  console.log(`  ${chalk.cyan("agenticmarket balance")}            Check your credits`);
  console.log("");
  console.log(chalk.bold("  Examples:"));
  console.log("");
  console.log(`  ${chalk.dim("$")} agenticmarket auth am_live_xxxxxxxxxxxx`);
  console.log(`  ${chalk.dim("$")} agenticmarket install security-scanner`);
  console.log(`  ${chalk.dim("$")} agenticmarket install web-scraper`);
  console.log(`  ${chalk.dim("$")} agenticmarket remove security-scanner`);
  console.log("");
  console.log(`  ${chalk.dim("Get your API key at:")} ${chalk.underline("https://agenticmarket.dev")}`);
  console.log("");
};

// ── Router ────────────────────────────────────────────
switch (command) {
  case "auth":
    if (!argument) {
      console.error(chalk.red("\n  Error: API key required"));
      console.log(chalk.dim("  Usage: agenticmarket auth <api-key>\n"));
      process.exit(1);
    }
    await auth(argument);
    break;

  case "install":
    if (!argument) {
      console.error(chalk.red("\n  Error: skill name required"));
      console.log(chalk.dim("  Usage: agenticmarket install <skill-name>\n"));
      process.exit(1);
    }
    await install(argument);
    break;

  case "remove":
    if (!argument) {
      console.error(chalk.red("\n  Error: skill name required"));
      console.log(chalk.dim("  Usage: agenticmarket remove <skill-name>\n"));
      process.exit(1);
    }
    await remove(argument);
    break;

  case "list":
    await list();
    break;

  case "balance":
    await balance();
    break;

  case "--version":
  case "-v":
    console.log(VERSION);
    break;
  case "logout":
    await logout();
    break;  

  case "--help":
  case "-h":
  case undefined:
    help();
    break;

  default:
    console.error(chalk.red(`\n  Unknown command: ${command}`));
    help();
    process.exit(1);
}
