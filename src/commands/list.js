/**
 * src/commands/list.js
 * agenticmarket list — shows all installed MCP servers across IDEs
 */

import chalk from "chalk";
import { getInstalledIDEs, readMCPConfig, PROXY_BASE_URL } from "../config.js";

export async function list() {
  console.log("");

  // ── Header box ──────────────────────────────────────────
  const pad = "═".repeat(52);
  console.log(chalk.cyan.bold(`╔${pad}╗`));
  console.log(chalk.cyan.bold(`║  ${"Installed MCP Servers".padEnd(50)}║`));
  console.log(chalk.cyan.bold(`╚${pad}╝`));
  console.log("");

  const installedIDEs = getInstalledIDEs();

  if (installedIDEs.length === 0) {
    console.log(
      `  ${chalk.yellow("⚠")}  No supported IDEs found on this machine.`,
    );
    console.log("");
    console.log(
      chalk.dim(`  Supported: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, Zed, Cline, Codex`),
    );
    console.log("");
    return;
  }

  let totalServers    = 0;
  let idesWithServers = 0;

  for (const ide of installedIDEs) {
    const config     = readMCPConfig(ide.configPath, ide.configKey);
    const mcpServers = config.mcpServers ?? {};

    const ourServers = Object.entries(mcpServers).filter(([, entry]) => {
      // 1. stdio proxy via npx
      if (
        entry?.command === "npx" &&
        entry?.args &&
        entry.args.includes("agenticmarket") &&
        entry.args.includes("proxy")
      )
        return true;
      // 2. stdio proxy via direct command
      if (
        entry?.command === "agenticmarket" &&
        entry?.args &&
        entry.args.includes("proxy")
      )
        return true;
      // 3. serverUrl field (new)
      if (entry?.serverUrl?.startsWith("https://agenticmarket.dev")) return true;
      // 4. skillUrl field (legacy — kept for backward compat with existing configs)
      if (entry?.skillUrl?.startsWith("https://agenticmarket.dev")) return true;
      // 5. Fallback URL checks
      if (entry?.url?.startsWith(PROXY_BASE_URL)) return true;
      if (entry?.serverUrl?.startsWith(PROXY_BASE_URL)) return true;
      if (entry?.skillUrl?.startsWith(PROXY_BASE_URL)) return true;
      return false;
    });

    if (ourServers.length === 0) continue;

    idesWithServers++;

    // IDE section header
    console.log(
      `  ${ide.icon}  ${chalk.bold.white(ide.name)}` +
        chalk.dim(
          `  (${ourServers.length} server${ourServers.length !== 1 ? "s" : ""})`,
        ),
    );
    console.log(chalk.dim(`  ${"─".repeat(48)}`));

    for (const [name, entry] of ourServers) {
      let displayPath = name;

      // Extract username/server from args (e.g. npx agenticmarket proxy user/server)
      if (entry?.args && entry.args.includes("proxy")) {
        const proxyIdx = entry.args.indexOf("proxy");
        if (entry.args[proxyIdx + 1]) displayPath = entry.args[proxyIdx + 1];
      }
      // Extract from serverUrl / skillUrl (https://agenticmarket.dev/username/server)
      else if (entry?.serverUrl || entry?.skillUrl) {
        const url      = entry.serverUrl || entry.skillUrl;
        const urlMatch = url.startsWith("https://agenticmarket.dev")
          ? url.match(/agenticmarket\.dev\/([^/]+)\/([^/]+)/)
          : null;
        if (urlMatch) displayPath = `${urlMatch[1]}/${urlMatch[2]}`;
      }
      // Extract from old proxy URL format
      else if (entry?.url) {
        const match = entry.url.match(/\/mcp\/([^/]+)\/([^/]+)/);
        if (match) displayPath = `${match[1]}/${match[2]}`;
      }

      console.log(
        `  ${chalk.cyan("›")} ${chalk.white.bold(name.padEnd(28))}` +
          chalk.dim(displayPath),
      );
      totalServers++;
    }

    console.log("");
  }

  // ── Empty state ──────────────────────────────────────────
  if (totalServers === 0) {
    console.log(`  ${chalk.dim("No AgenticMarket MCP servers installed yet.")}`);
    console.log("");
    console.log(
      `  ${chalk.cyan("›")} Run ${chalk.cyan("agenticmarket install <username>/<server-name>")} to get started`,
    );
    console.log("");
    return;
  }

  // ── Summary footer ───────────────────────────────────────
  console.log(chalk.dim(`  ${"─".repeat(48)}`));
  console.log("");
  console.log(
    `  ${chalk.green("✓")}  ` +
      chalk.white.bold(`${totalServers}`) +
      chalk.dim(` server${totalServers !== 1 ? "s" : ""}`) +
      chalk.dim(" across ") +
      chalk.white.bold(`${idesWithServers}`) +
      chalk.dim(` IDE${idesWithServers !== 1 ? "s" : ""}`),
  );
  console.log("");
}
