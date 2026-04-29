/**
 * src/commands/install.js
 *
 * agenticmarket install <username>/<server-name>
 *
 * 1. Checks API key exists
 * 2. Verifies MCP server exists on marketplace
 * 3. Finds all IDEs installed on this machine
 * 4. Resolves what key to use in mcpServers (MCP clients can't handle "user/server")
 *    → If no conflict: uses plain server name e.g. "summarizer"
 *    → If conflict with SAME author: tells user it's already installed, skips
 *    → If conflict with DIFFERENT server: asks user to pick an alias
 * 5. Edits their MCP config files automatically (correct format per IDE)
 * 6. Done — no manual JSON editing needed
 */

import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";
import {
  getApiKey,
  getInstalledIDEs,
  detectRunningIDE,
  readMCPConfig,
  writeMCPConfig,
  buildMCPEntry,
  PROXY_BASE_URL,
  API_BASE_URL,
  IDE_CONFIGS,
} from "../config.js";

// ── UI helpers (inline) ───────────────────────────────────────────────────────
const box      = (title) => {
  const pad = "═".repeat(52);
  console.log(chalk.cyan.bold(`╔${pad}╗`));
  console.log(chalk.cyan.bold(`║  ${title.padEnd(50)}║`));
  console.log(chalk.cyan.bold(`╚${pad}╝`));
};
const divider = () => console.log(chalk.dim(`  ${"─".repeat(48)}`));
const gap     = () => console.log("");
const ok      = (msg) => console.log(`  ${chalk.green("✓")}  ${msg}`);
const warn    = (msg) => console.log(`  ${chalk.yellow("⚠")}  ${msg}`);
const err     = (msg) => console.log(`  ${chalk.red("✗")}  ${chalk.red(msg)}`);
const info    = (msg) => console.log(`  ${chalk.cyan("›")}  ${msg}`);
const dim     = (msg) => console.log(`  ${chalk.dim(msg)}`);
const row     = (label, value, color = chalk.white) =>
  console.log(`  ${chalk.dim(label.padEnd(14))}${color(value)}`);

// ─────────────────────────────────────────────────────────────────────────────

function normalizeUsername(username) {
  return username.startsWith("@") ? username.slice(1) : username;
}

function suggestAliases(server, username) {
  return [
    `${username}-${server}`,
    `${server}-2`,
    `${server}-am`,
    `${username}-${server}-ai`,
  ];
}

export async function install(rawServerName) {
  gap();

  // ── Header ────────────────────────────────────────────
  box("Install MCP Server");
  gap();

  // ── Step 1: Check auth ────────────────────────────────
  const apiKey = getApiKey();
  if (!apiKey) {
    err("Not authenticated");
    gap();
    divider();
    info(`Run ${chalk.cyan("agenticmarket auth <api-key>")} first`);
    info(`Get your key at ${chalk.cyan.underline("https://agenticmarket.dev")}`);
    gap();
    process.exit(1);
  }

  // ── Parse username/server ─────────────────────────────
  const parts    = rawServerName.split("/");
  const username = normalizeUsername(parts[0]);
  const server   = parts[1];

  if (!username || !server) {
    err("Invalid format");
    gap();
    divider();
    dim(`Use the format: ${chalk.yellow("<username>/<server-name>")}`);
    dim(`Example:        ${chalk.cyan("agenticmarket install alice/summarizer")}`);
    gap();
    process.exit(1);
  }

  row("Server", `${username}/${server}`, chalk.cyan);
  gap();

  // ── Step 2: Verify MCP server on marketplace ──────────
  const spinner = ora({
    text: chalk.dim("Looking up server on marketplace..."),
    color: "cyan",
    spinner: "dots",
  }).start();

  let serverData;
  try {
    const res = await fetch(`${API_BASE_URL}/skills/${username}/${server}`, {
      headers: { "x-api-key": apiKey, command: "install" },
    });

    if (res.status === 404) {
      spinner.stop();
      err(`Server "${username}/${server}" not found`);
      gap();
      divider();
      info(`Browse servers at ${chalk.cyan.underline("https://agenticmarket.dev/servers")}`);
      gap();
      process.exit(1);
    }

    if (res.status === 401) {
      spinner.stop();
      err("Invalid API key");
      gap();
      process.exit(1);
    }

    serverData = await res.json();
    spinner.stop();
  } catch {
    spinner.stop();
    err("Network error — are you connected to the internet?");
    gap();
    process.exit(1);
  }

  ok(`Found ${chalk.cyan(`${username}/${server}`)}`);
  row("Price",       `$${serverData.price} per call`, chalk.green);
  row("Description", serverData.description ?? "—",   chalk.dim);
  gap();
  divider();
  gap();

  // ── Step 3: Build IDE list ──────────────────────────────────────────────────
  //
  // Strategy:
  //   1. Detect which IDE the terminal is running inside (env var hint)
  //   2. Always include BOTH scopes (project + global) for that IDE, ordered
  //      project first — even if the project folder doesn't exist yet
  //      (writeMCPConfig creates the dir automatically on install)
  //   3. Append all OTHER filesystem-detected IDEs after, deduped
  // ────────────────────────────────────────────────────────────────────────────
  const runningIDE = detectRunningIDE(); // "vscode" | "cursor" | "windsurf" | "gemini" | null

  // Entries for the IDE the user is currently running inside (project → global order)
  const runningIDEEntries = runningIDE
    ? IDE_CONFIGS
        .filter((ide) => ide.runningIDEId === runningIDE)
        .sort((a) => (a.scope === "project" ? -1 : 1))
    : [];

  // All other IDEs detected via filesystem (skip running IDE to avoid duplicates)
  const runningIds    = new Set(runningIDEEntries.map((e) => e.id));
  const otherDetected = getInstalledIDEs().filter((ide) => !runningIds.has(ide.id));

  const installedIDEs = [...runningIDEEntries, ...otherDetected];

  if (installedIDEs.length === 0) {
    warn("No supported IDEs detected on this machine");
    gap();
    dim("Supported: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, Zed, Cline, Codex");
    dim("Make sure one is installed and has been opened at least once.");
    gap();
    divider();
    gap();
    dim("Manual setup — add this to your MCP config:");
    printManualConfig(server, username);
    process.exit(0);
  }

  // ── Step 4: Ask which IDEs to install to ──────────────
  let targetIDEs;

  if (installedIDEs.length === 1) {
    // Only one option — simple yes/no
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `  Install to ${installedIDEs[0].icon} ${chalk.white(installedIDEs[0].name)}?`,
      initial: true,
    });
    if (!confirm) { gap(); dim("Cancelled — nothing was changed."); gap(); process.exit(0); }
    targetIDEs = installedIDEs;
  } else {
    // Multi-select — running IDE entries pre-ticked at top
    const { selected } = await prompts({
      type: "multiselect",
      name: "selected",
      message: runningIDE
        ? `  ${runningIDEEntries[0]?.icon ?? ""} ${runningIDEEntries[0]?.name.split(" ")[0] ?? ""} detected — install to:`
        : "  Install to which IDEs?",
      choices: installedIDEs.map((ide) => ({
        title: `${ide.icon}  ${ide.name}  ${chalk.dim(ide.scope)}`,
        value: ide,
        // Pre-tick: running IDE entries only. If no running IDE, tick project-scope.
        selected: runningIDE
          ? ide.runningIDEId === runningIDE
          : ide.scope === "project",
      })),
      instructions: false,
      hint: "Space to toggle, Enter to confirm",
    });

    if (!selected || selected.length === 0) {
      gap();
      dim("Cancelled — nothing was changed.");
      gap();
      process.exit(0);
    }
    targetIDEs = selected;
  }

  // ── Step 5: Resolve MCP key / detect conflict ─────────
  const expectedUrl = `${PROXY_BASE_URL}/mcp/${username}/${server}`;
  let resolvedKey   = server;
  let conflictFound = false;
  let isSameServer  = false;

  for (const ide of targetIDEs) {
    const config   = readMCPConfig(ide.configPath, ide.configKey);
    const existing = config.mcpServers?.[server];
    if (!existing) continue;
    conflictFound = true;
    const existingUrl    = existing.url    ?? "";
    const existingAuthor = existing.author ?? "";
    if (existingUrl === expectedUrl || existingAuthor === username) isSameServer = true;
    break;
  }

  if (conflictFound && isSameServer) {
    gap();
    warn(`${chalk.bold(server)} by ${chalk.cyan(username)} is already installed`);
    gap();
    dim("Restart your IDE if the server isn't active yet.");
    gap();
    process.exit(0);
  }

  if (conflictFound && !isSameServer) {
    gap();
    warn(`A different server is already using the name ${chalk.bold(`"${server}"`)}`);
    dim("You need an alias for this server in your MCP config.");
    gap();

    const suggestions = suggestAliases(server, username);
    const { aliasChoice } = await prompts({
      type: "select",
      name: "aliasChoice",
      message: "  Choose an alias:",
      choices: [
        ...suggestions.map((s) => ({ title: chalk.cyan(s), value: s })),
        { title: chalk.dim("Enter a custom name..."), value: "__custom__" },
      ],
    });

    if (!aliasChoice) {
      gap();
      dim("Cancelled — nothing was changed.");
      gap();
      process.exit(0);
    }

    if (aliasChoice === "__custom__") {
      const { customAlias } = await prompts({
        type: "text",
        name: "customAlias",
        message: "  Custom alias (letters, numbers, hyphens only):",
        validate: (v) =>
          /^[a-zA-Z0-9_-]{1,64}$/.test(v)
            ? true
            : "Only letters, numbers, hyphens and underscores (max 64 chars)",
      });

      if (!customAlias) {
        gap();
        dim("Cancelled — nothing was changed.");
        gap();
        process.exit(0);
      }
      resolvedKey = customAlias;
    } else {
      resolvedKey = aliasChoice;
    }

    gap();
    dim(`Installing as: ${chalk.bold.white(resolvedKey)}`);
    gap();
  }

  // ── Step 6: Write to each IDE config ──────────────────
  gap();
  let successCount = 0;

  for (const ide of targetIDEs) {
    const writeSpinner = ora({
      text: chalk.dim(`Adding to ${ide.name}...`),
      color: "cyan",
      spinner: "dots",
    }).start();

    try {
      const config       = readMCPConfig(ide.configPath, ide.configKey);
      const existingEntry = config.mcpServers?.[resolvedKey];

      if (existingEntry) {
        const existingUrl    = existingEntry.url    ?? "";
        const existingAuthor = existingEntry.author ?? "";
        if (existingUrl === expectedUrl || existingAuthor === username) {
          writeSpinner.stop();
          warn(`${ide.icon}  ${ide.name}  ${chalk.dim("already installed — skipping")}`);
          continue;
        }
      }

      const baseEntry = buildMCPEntry(
        server, username,
        serverData.description, serverData.price_cents
      );
      // Some IDEs (e.g. Zed) use a different schema — transformEntry normalises it
      config.mcpServers[resolvedKey] = ide.transformEntry
        ? ide.transformEntry(baseEntry)
        : baseEntry;
      writeMCPConfig(ide.configPath, config);

      writeSpinner.stop();
      ok(`${ide.icon}  ${chalk.white(ide.name)}`);
      successCount++;
    } catch (e) {
      writeSpinner.stop();
      err(`${ide.icon}  ${ide.name}  ${chalk.dim(e.message)}`);
    }
  }

  // ── Step 7: Done ──────────────────────────────────────
  if (successCount > 0) {
    gap();
    divider();
    gap();
    ok(chalk.green.bold("MCP server installed"));
    gap();
    row("Server",   `${username}/${server}`,                                   chalk.cyan);
    if (resolvedKey !== server)
      row("Alias",  `${resolvedKey}  ${chalk.dim("(name used in config)")}`,   chalk.yellow);
    row("Added to", `${successCount} IDE${successCount !== 1 ? "s" : ""}`,     chalk.white);
    gap();
    divider();
    gap();
    console.log(`  ${chalk.yellow("⚡")}  ${chalk.yellow.bold("Restart your IDE to activate the server")}`);
    gap();
    dim(`Then ask your AI: ${chalk.italic(`"Use the ${resolvedKey} server to..."`)}`);
    gap();
    console.log(`  ${chalk.yellow("⭐")}  ${chalk.dim("Enjoying AgenticMarket?")} ${chalk.cyan.underline("https://github.com/agenticmarket/agenticmarket-cli")} ${chalk.dim("— give us a star!")}`);
    gap();
  }
}

// ── Manual config fallback ────────────────────────────────────────────────────
function printManualConfig(server, username) {
  gap();
  console.log(chalk.dim(`  ${"─".repeat(48)}`));
  gap();
  dim(`Add to your IDE's MCP config under ${chalk.white("mcpServers")}:`);
  gap();
  console.log(
    chalk.dim(`    "${server}": {`),
  );
  console.log(
    chalk.dim(`      "type": "stdio",`),
  );
  console.log(
    chalk.dim(`      "command": "npx",`),
  );
  console.log(
    chalk.dim(`      "args": ["agenticmarket", "proxy", "${username}/${server}"]`),
  );
  console.log(
    chalk.dim(`    }`),
  );
  gap();
}