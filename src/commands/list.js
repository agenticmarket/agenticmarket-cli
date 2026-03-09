/**
 * src/commands/list.js
 * agenticmarket list — shows all installed skills across IDEs
 */

import chalk from "chalk";
import { getInstalledIDEs, readMCPConfig, PROXY_BASE_URL } from "../config.js";

export async function list() {
  console.log("");

  const installedIDEs = getInstalledIDEs();

  if (installedIDEs.length === 0) {
    console.log(chalk.yellow("  No supported IDEs found.\n"));
    return;
  }

  let totalSkills = 0;

  for (const ide of installedIDEs) {
    const config = readMCPConfig(ide.path, ide.format);
    const servers = config.mcpServers ?? {};

    // Only show skills that go through our proxy
    const ourSkills = Object.entries(servers).filter(([, entry]) =>
      entry?.url?.startsWith(PROXY_BASE_URL),
    );

    if (ourSkills.length === 0) continue;

    console.log(`  ${ide.icon}  ${chalk.bold(ide.name)}`);

    for (const [name] of ourSkills) {
      console.log(`     ${chalk.cyan("•")} ${name}`);
      totalSkills++;
    }

    console.log("");
  }

  if (totalSkills === 0) {
    console.log(chalk.dim("  No AgenticMarket skills installed yet."));
    console.log(chalk.dim("  Run: agenticmarket install <skill-name>\n"));
    return;
  }

  console.log(
    chalk.dim(
      `  ${totalSkills} skill${totalSkills > 1 ? "s" : ""} installed total.\n`,
    ),
  );
}
