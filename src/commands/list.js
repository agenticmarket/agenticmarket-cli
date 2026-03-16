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
    console.log(
      `  ${chalk.yellow("⚠")}  No supported IDEs found on this machine.`,
    );
    console.log("");
    console.log(
      chalk.dim(`  Supported: Cursor, VS Code, Windsurf, Claude Desktop`),
    );
    console.log("");
    return;
  }

  let totalSkills = 0;
  let idesWithSkills = 0;

  for (const ide of installedIDEs) {
    const config = readMCPConfig(ide.path, ide.format);
    const servers = config.mcpServers ?? {};
    const ourSkills = Object.entries(servers).filter(([, entry]) => {
      // 1. Format using CLI proxy command
      if (
        entry?.command === "npx" &&
        entry?.args &&
        entry.args.includes("agenticmarket") &&
        entry.args.includes("proxy")
      )
        return true;
      if (
        entry?.command === "agenticmarket" &&
        entry?.args &&
        entry.args.includes("proxy")
      )
        return true;
      // 2. Format with URL point to web domain
      if (
        entry?.skillUrl &&
        entry.skillUrl.startsWith("https://agenticmarket.dev")
      )
        return true;
      // 3. Fallback for older formats where proxy URL was in .url or .skillUrl
      if (entry?.url?.startsWith(PROXY_BASE_URL)) return true;
      if (entry?.skillUrl?.startsWith(PROXY_BASE_URL)) return true;
      return false;
    });

    if (ourSkills.length === 0) continue;

    idesWithSkills++;

    // IDE section header
    console.log(
      `  ${ide.icon}  ${chalk.bold.white(ide.name)}` +
        chalk.dim(
          `  (${ourSkills.length} skill${ourSkills.length !== 1 ? "s" : ""})`,
        ),
    );
    console.log(chalk.dim(`  ${"─".repeat(48)}`));

    for (const [name, entry] of ourSkills) {
      let displayPath = name;

      // Extract username/skill from args (e.g. npx agenticmarket proxy user/skill)
      if (entry?.args && entry.args.includes("proxy")) {
        const proxyIdx = entry.args.indexOf("proxy");
        if (entry.args[proxyIdx + 1]) displayPath = entry.args[proxyIdx + 1];
      }
      // Extract from web skillUrl (https://agenticmarket.dev/username/skill)
      else if (
        entry?.skillUrl &&
        entry.skillUrl.startsWith("https://agenticmarket.dev")
      ) {
        const urlMatch = entry.skillUrl.match(
          /agenticmarket\.dev\/([^/]+)\/([^/]+)/,
        );
        if (urlMatch) displayPath = `${urlMatch[1]}/${urlMatch[2]}`;
      }
      // Extract from old proxy URL format
      else if (entry?.url || entry?.skillUrl) {
        const match = (entry.url || entry.skillUrl).match(
          /\/mcp\/([^/]+)\/([^/]+)/,
        );
        if (match) displayPath = `${match[1]}/${match[2]}`;
      }

      console.log(
        `  ${chalk.cyan("›")} ${chalk.white.bold(name.padEnd(28))}` +
          chalk.dim(displayPath),
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
      `  ${chalk.cyan("›")} Run ${chalk.cyan("agenticmarket install <username>/<skill>")} to get started`,
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
      chalk.dim(` IDE${idesWithSkills !== 1 ? "s" : ""}`),
  );
  console.log("");
}
