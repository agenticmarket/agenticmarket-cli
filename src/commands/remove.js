/**
 * src/commands/remove.js
 * agenticmarket remove <skill-name>
 */

import chalk from "chalk";
import prompts from "prompts";
import {
  getApiKey,
  getInstalledIDEs,
  readMCPConfig,
  writeMCPConfig,
} from "../config.js";

export async function remove(skillName) {
  console.log("");

  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(
      chalk.red("  ✗ Not authenticated. Run: agenticmarket auth <api-key>\n"),
    );
    process.exit(1);
  }

  // Find IDEs that have this skill installed
  const installedIDEs = getInstalledIDEs();
  const IDEsWithSkill = installedIDEs.filter((ide) => {
    const config = readMCPConfig(ide.path, ide.format);
    return !!config.mcpServers?.[skillName];
  });

  if (IDEsWithSkill.length === 0) {
    console.log(
      chalk.yellow(`  ⚠ Skill "${skillName}" is not installed in any IDE.\n`),
    );
    process.exit(0);
  }

  const { confirm } = await prompts({
    type: "confirm",
    name: "confirm",
    message: `  Remove ${chalk.cyan(skillName)} from ${IDEsWithSkill.length} IDE${IDEsWithSkill.length > 1 ? "s" : ""}?`,
    initial: false,
  });

  if (!confirm) {
    console.log(chalk.dim("\n  Cancelled.\n"));
    process.exit(0);
  }

  console.log("");
  for (const ide of IDEsWithSkill) {
    try {
      const config = readMCPConfig(ide.path, ide.format);
      delete config.mcpServers[skillName];
      writeMCPConfig(ide.path, config);
      console.log(chalk.green(`  ✓ Removed from ${ide.name}`));
    } catch (err) {
      console.log(
        chalk.red(`  ✗ Failed to update ${ide.name}: ${err.message}`),
      );
    }
  }

  console.log("");
  console.log(chalk.dim("  Restart your IDE to apply changes.\n"));
}
