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

  // ── Header box ──────────────────────────────────────────
  const pad = "═".repeat(52);
  console.log(chalk.cyan.bold(`╔${pad}╗`));
  console.log(chalk.cyan.bold(`║  ${"Remove Skill".padEnd(50)}║`));
  console.log(chalk.cyan.bold(`╚${pad}╝`));
  console.log("");

  // ── Auth check ──────────────────────────────────────────
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log(`  ${chalk.red("✗")}  ${chalk.red("Not authenticated")}`);
    console.log("");
    console.log(chalk.dim(`  ${"─".repeat(48)}`));
    console.log(
      `  Run ${chalk.cyan("agenticmarket auth <api-key>")} to log in first`
    );
    console.log("");
    process.exit(1);
  }

  // ── Find IDEs that have this skill ──────────────────────
  const installedIDEs = getInstalledIDEs();
  const IDEsWithSkill = installedIDEs.filter((ide) => {
    const config = readMCPConfig(ide.path, ide.format);
    return !!config.mcpServers?.[skillName];
  });

  if (IDEsWithSkill.length === 0) {
    console.log(
      `  ${chalk.yellow("⚠")}  ${chalk.yellow(`"${skillName}" is not installed in any IDE`)}`
    );
    console.log("");
    console.log(
      `  ${chalk.dim("Run")} ${chalk.cyan("agenticmarket list")} ${chalk.dim("to see installed skills")}`
    );
    console.log("");
    process.exit(0);
  }

  // ── Show what will be removed ───────────────────────────
  console.log(
    `  ${chalk.dim("Skill")}   ${chalk.white.bold(skillName)}`
  );
  console.log(
    `  ${chalk.dim("Found in")} ${chalk.white(IDEsWithSkill.length + " IDE" + (IDEsWithSkill.length !== 1 ? "s" : ""))}`
  );
  console.log("");

  for (const ide of IDEsWithSkill) {
    console.log(`  ${chalk.dim("·")}  ${ide.icon}  ${chalk.dim(ide.name)}`);
  }

  console.log("");
  console.log(chalk.dim(`  ${"─".repeat(48)}`));
  console.log("");

  // ── Confirmation prompt ─────────────────────────────────
  const { confirm } = await prompts({
    type: "confirm",
    name: "confirm",
    message: `  Remove ${chalk.cyan(skillName)}?`,
    initial: false,
  });

  // Handle Ctrl+C
  if (confirm === undefined) {
    console.log("");
    console.log(`  ${chalk.dim("Cancelled.")}`);
    console.log("");
    process.exit(0);
  }

  if (!confirm) {
    console.log("");
    console.log(`  ${chalk.dim("Cancelled — nothing was changed.")}`);
    console.log("");
    process.exit(0);
  }

  // ── Remove from each IDE ────────────────────────────────
  console.log("");
  let removed = 0;
  let failed = 0;

  for (const ide of IDEsWithSkill) {
    try {
      const config = readMCPConfig(ide.path, ide.format);
      delete config.mcpServers[skillName];
      writeMCPConfig(ide.path, config);
      console.log(
        `  ${chalk.green("✓")}  ${ide.icon}  ${chalk.white(ide.name)}`
      );
      removed++;
    } catch (err) {
      console.log(
        `  ${chalk.red("✗")}  ${ide.icon}  ${chalk.white(ide.name)}  ${chalk.dim(err.message)}`
      );
      failed++;
    }
  }

  // ── Summary ─────────────────────────────────────────────
  console.log("");
  console.log(chalk.dim(`  ${"─".repeat(48)}`));
  console.log("");

  if (failed === 0) {
    console.log(
      `  ${chalk.green("✓")}  ${chalk.green.bold(`${skillName} removed`)}` +
      chalk.dim(`  from ${removed} IDE${removed !== 1 ? "s" : ""}`)
    );
    console.log("");
    console.log(`  ${chalk.dim("Restart your IDE to apply changes.")}`);
  } else {
    console.log(
      `  ${chalk.yellow("⚠")}  Removed from ${chalk.white(removed)}, ` +
      `failed on ${chalk.red(failed)}`
    );
    console.log("");
    console.log(
      `  ${chalk.dim("Try running with admin/sudo if the config files are write-protected.")}`
    );
  }

  console.log("");
}