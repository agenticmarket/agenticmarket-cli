/**
 * src/commands/list.js
 * agenticmarket list — shows all installed skills across IDEs
 */

import chalk from "chalk";
import { getInstalledIDEs, readMCPConfig, PROXY_BASE_URL } from "../config.js";

export async function list() {
  console.log("");

  // ── Header box ──────────────────────────────────────────
  const pad = "═".repeat(52);
  console.log(chalk.cyan.bold(`╔${pad}╗`));
  console.log(chalk.cyan.bold(`║  ${"Installed Skills".padEnd(50)}║`));
  console.log(chalk.cyan.bold(`╚${pad}╝`));
  console.log("");

  const installedIDEs = getInstalledIDEs();

  if (installedIDEs.length === 0) {
    console.log(`  ${chalk.yellow("⚠")}  No supported IDEs found on this machine.`);
    console.log("");
    console.log(chalk.dim(`  Supported: Cursor, VS Code, Windsurf, Claude Desktop`));
    console.log("");
    return;
  }

  let totalSkills = 0;
  let idesWithSkills = 0;

  for (const ide of installedIDEs) {
    const config = readMCPConfig(ide.path, ide.format);
    const servers = config.mcpServers ?? {};

    const ourSkills = Object.entries(servers).filter(([, entry]) =>
      entry?.url?.startsWith(PROXY_BASE_URL)
    );

    if (ourSkills.length === 0) continue;

    idesWithSkills++;

    // IDE section header
    console.log(
      `  ${ide.icon}  ${chalk.bold.white(ide.name)}` +
      chalk.dim(`  (${ourSkills.length} skill${ourSkills.length !== 1 ? "s" : ""})`)
    );
    console.log(chalk.dim(`  ${"─".repeat(48)}`));

    for (const [name, entry] of ourSkills) {
      const url = entry?.url ?? "";
      // Extract username/skill from proxy URL for display
      const match = url.match(/\/mcp\/([^/]+)\/([^/]+)/);
      const displayPath = match ? `${match[1]}/${match[2]}` : name;

      console.log(
        `  ${chalk.cyan("›")} ${chalk.white.bold(name.padEnd(28))}` +
        chalk.dim(displayPath)
      );
      totalSkills++;
    }

    console.log("");
  }

  // ── Empty state ──────────────────────────────────────────
  if (totalSkills === 0) {
    console.log(`  ${chalk.dim("No AgenticMarket skills installed yet.")}`);
    console.log("");
    console.log(
      `  ${chalk.cyan("›")} Run ${chalk.cyan("agenticmarket install <username>/<skill>")} to get started`
    );
    console.log("");
    return;
  }

  // ── Summary footer ───────────────────────────────────────
  console.log(chalk.dim(`  ${"─".repeat(48)}`));
  console.log("");
  console.log(
    `  ${chalk.green("✓")}  ` +
    chalk.white.bold(`${totalSkills}`) +
    chalk.dim(` skill${totalSkills !== 1 ? "s" : ""}`) +
    chalk.dim(" across ") +
    chalk.white.bold(`${idesWithSkills}`) +
    chalk.dim(` IDE${idesWithSkills !== 1 ? "s" : ""}`)
  );
  console.log("");
}