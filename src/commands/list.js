/**
 * src/commands/list.js
 * agenticmarket list — shows all installed MCP servers across IDEs
 *
 * Two sections:
 *   1. AgenticMarket Servers — official servers detected by proxy markers in IDE configs
 *   2. Community Servers — tracked via ~/.agenticmarket/community.json registry
 */

import chalk from "chalk";
import {
  getInstalledIDEs,
  readMCPConfig,
  PROXY_BASE_URL,
  loadCommunityRegistry,
  IDE_CONFIGS,
} from "../config.js";

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
      chalk.dim(`  Supported: Andromity, Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, Zed, Cline, Codex, Antigravity, Copilot, Goose`),
    );
    console.log("");
    return;
  }

  let totalServers    = 0;
  let idesWithServers = 0;

  // ── AgenticMarket (official) section ──────────────────────
  let officialCount = 0;
  let officialIdeCount = 0;
  const officialOutput = [];

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

    officialIdeCount++;

    // IDE section header
    officialOutput.push(
      `  ${ide.icon}  ${chalk.bold.white(ide.name)}` +
        chalk.dim(
          `  (${ourServers.length} server${ourServers.length !== 1 ? "s" : ""})`,
        ),
    );
    officialOutput.push(chalk.dim(`  ${"─".repeat(48)}`));

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

      officialOutput.push(
        `  ${chalk.cyan("›")} ${chalk.white.bold(name.padEnd(28))}` +
          chalk.dim(displayPath),
      );
      officialCount++;
    }

    officialOutput.push("");
  }

  // ── Community section ──────────────────────────────────────
  const registry = loadCommunityRegistry();
  const communityEntries = Object.entries(registry);
  let communityCount = 0;
  const communityOutput = [];

  if (communityEntries.length > 0) {
    // Group community installs by IDE for consistent display
    const byIde = new Map();

    for (const [slug, entry] of communityEntries) {
      const ides = entry.ides ?? [];
      for (const ideId of ides) {
        const existing = byIde.get(ideId) ?? [];
        existing.push({ slug, ...entry });
        byIde.set(ideId, existing);
      }
      // If no IDEs tracked, show in an "unknown" group
      if (ides.length === 0) {
        const existing = byIde.get("__unknown__") ?? [];
        existing.push({ slug, ...entry });
        byIde.set("__unknown__", existing);
      }
    }

    for (const [ideId, servers] of byIde) {
      // Look up IDE metadata for icon/name
      const ideMeta = IDE_CONFIGS.find((i) => i.id === ideId);
      const ideName = ideMeta ? `${ideMeta.icon}  ${ideMeta.name}` : `📦  ${ideId}`;

      communityOutput.push(
        `  ${chalk.bold.white(ideName)}` +
          chalk.dim(
            `  (${servers.length} server${servers.length !== 1 ? "s" : ""})`,
          ),
      );
      communityOutput.push(chalk.dim(`  ${"─".repeat(48)}`));

      for (const server of servers) {
        communityOutput.push(
          `  ${chalk.magenta("›")} ${chalk.white.bold((server.configKey ?? server.slug).padEnd(28))}` +
            chalk.dim(server.slug),
        );
        communityCount++;
      }

      communityOutput.push("");
    }
  }

  totalServers = officialCount + communityCount;
  idesWithServers = officialIdeCount + (communityCount > 0 ? 1 : 0);

  // ── Render sections ─────────────────────────────────────
  if (officialCount > 0) {
    console.log(`  ${chalk.cyan.bold("── AgenticMarket Servers ──────────────────────────")}`);
    console.log("");
    for (const line of officialOutput) console.log(line);
  }

  if (communityCount > 0) {
    console.log(`  ${chalk.magenta.bold("── Community Servers ──────────────────────────────")}`);
    console.log("");
    for (const line of communityOutput) console.log(line);
  }

  // ── Empty state ──────────────────────────────────────────
  if (totalServers === 0) {
    console.log(`  ${chalk.dim("No MCP servers installed yet.")}`);
    console.log("");
    console.log(
      `  ${chalk.cyan("›")} Run ${chalk.cyan("agenticmarket install <username>/<server>")} for official servers`,
    );
    console.log(
      `  ${chalk.magenta("›")} Run ${chalk.cyan("agenticmarket install <slug>")} for community servers`,
    );
    console.log("");
    return;
  }

  // ── Summary footer ───────────────────────────────────────
  console.log(chalk.dim(`  ${"─".repeat(48)}`));
  console.log("");

  const parts = [];
  if (officialCount > 0)  parts.push(`${chalk.cyan.bold(officialCount)} official`);
  if (communityCount > 0) parts.push(`${chalk.magenta.bold(communityCount)} community`);

  console.log(
    `  ${chalk.green("✓")}  ` +
      chalk.white.bold(`${totalServers}`) +
      chalk.dim(` server${totalServers !== 1 ? "s" : ""} (`) +
      parts.join(chalk.dim(", ")) +
      chalk.dim(")"),
  );
  console.log("");
}
