/**
 * src/commands/install.js
 *
 * agenticmarket install <skill-name>
 *
 * 1. Checks API key exists
 * 2. Finds all IDEs installed on this machine
 * 3. Asks user which IDEs to add the skill to
 * 4. Edits their MCP config files automatically
 * 5. Done — no manual JSON editing needed
 */

import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";
import {
  getApiKey,
  getInstalledIDEs,
  detectCurrentIDE,
  readMCPConfig,
  writeMCPConfig,
  buildMCPEntry,
  API_BASE_URL,
} from "../config.js";

export async function install(skillName) {
  console.log("");

  // ── Step 1: Check auth ────────────────────────────
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(chalk.red("  ✗ Not authenticated."));
    console.log(chalk.dim("  Run first: agenticmarket auth <api-key>"));
    console.log(chalk.dim("  Get your key at: https://agenticmarket.dev\n"));
    process.exit(1);
  }

  // ── Step 2: Verify skill exists on marketplace ────
  const spinner = ora(`  Looking up skill: ${chalk.cyan(skillName)}`).start();

  try {
    const res = await fetch(`${API_BASE_URL}/skills/${skillName}`, {
      headers: { "x-api-key": apiKey },
    });

    if (res.status === 404) {
      spinner.fail(chalk.red(`  Skill "${skillName}" not found on marketplace.`));
      console.log(chalk.dim("  Browse skills at: https://agenticmarket.dev/skills\n"));
      process.exit(1);
    }

    if (res.status === 401) {
      spinner.fail(chalk.red("  Invalid API key."));
      process.exit(1);
    }

    const data = await res.json();
    spinner.succeed(`  Found: ${chalk.cyan(skillName)} — $${data.price} per call`);
  } catch {
    spinner.fail(chalk.red("  Network error. Are you connected?"));
    process.exit(1);
  }

  // ── Step 3: Find installed IDEs ───────────────────
  const installedIDEs = getInstalledIDEs();

  if (installedIDEs.length === 0) {
    console.log("");
    console.log(chalk.yellow("  ⚠ No supported IDEs detected."));
    console.log("");
    console.log("  Supported IDEs: Claude Desktop, Cursor, VS Code");
    console.log("  Make sure at least one is installed and has been opened once.");
    console.log("");
    console.log(chalk.dim("  Manual setup — add this to your MCP config:"));
    printManualConfig(skillName, apiKey);
    process.exit(0);
  }

  // ── Step 4: Ask which IDEs to install to ─────────
  console.log("");

  let targetIDEs;

  if (installedIDEs.length === 1) {
    // Only one IDE — just confirm
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `  Install to ${installedIDEs[0].icon} ${installedIDEs[0].name}?`,
      initial: true,
    });

    if (!confirm) {
      console.log(chalk.dim("\n  Cancelled.\n"));
      process.exit(0);
    }
    targetIDEs = installedIDEs;

  } else {
    // Multiple IDEs — let user pick
    const currentIDE = detectCurrentIDE();
    const { selected } = await prompts({
      type: "multiselect",
      name: "selected",
      message: "  Install to which IDEs?",
      choices: installedIDEs.map((ide) => {
        // Pre-select only the IDE we're running inside
        const isCurrent =
          (currentIDE === "vscode" && ide.name === "VS Code") ||
          (currentIDE === "cursor" && ide.name.startsWith("Cursor"));
        return {
          title: `${ide.icon}  ${ide.name}`,
          value: ide,
          selected: currentIDE ? isCurrent : true,
        };
      }),
      instructions: false,
      hint: "Space to toggle, Enter to confirm",
    });

    if (!selected || selected.length === 0) {
      console.log(chalk.dim("\n  Cancelled.\n"));
      process.exit(0);
    }
    targetIDEs = selected;
  }

  // ── Step 5: Write to each config file ────────────
  console.log("");
  let successCount = 0;

  for (const ide of targetIDEs) {
    const writeSpinner = ora(`  Adding to ${ide.name}...`).start();

    try {
      const config = readMCPConfig(ide.path);

      // Check if already installed
      if (config.mcpServers?.[skillName]) {
        writeSpinner.warn(chalk.yellow(`  ${skillName} already installed in ${ide.name}`));
        continue;
      }

      // Add the skill entry
      config.mcpServers[skillName] = buildMCPEntry(skillName, apiKey);
      writeMCPConfig(ide.path, config);

      writeSpinner.succeed(chalk.green(`  Added to ${ide.name}`));
      successCount++;
    } catch (err) {
      writeSpinner.fail(chalk.red(`  Failed to update ${ide.name}: ${err.message}`));
    }
  }

  // ── Step 6: Done ──────────────────────────────────
  if (successCount > 0) {
    console.log("");
    console.log(chalk.bold.green("  ✓ Skill installed!"));
    console.log("");
    console.log(`  ${chalk.dim("Skill:")}   ${chalk.cyan(skillName)}`);
    console.log(`  ${chalk.dim("Added to:")} ${successCount} IDE${successCount > 1 ? "s" : ""}`);
    console.log("");
    console.log(chalk.yellow("  ⚡ Restart your IDE to activate the skill."));
    console.log("");
    console.log(chalk.dim("  Then ask your AI assistant to use it:"));
    console.log(chalk.dim(`  "Use the ${skillName} skill to..."`));
    console.log("");
  }
}

function printManualConfig(skillName, apiKey) {
  const entry = buildMCPEntry(skillName, apiKey);
  console.log("");
  console.log(chalk.dim('  Add to your mcpServers config:'));
  console.log("");
  console.log(chalk.dim("  {"));
  console.log(chalk.dim('    "mcpServers": {'));
  console.log(chalk.dim(`      "${skillName}": {`));
  console.log(chalk.dim(`        "url": "${entry.url}",`));
  console.log(chalk.dim('        "headers": {'));
  console.log(chalk.dim(`          "x-api-key": "${apiKey}"`));
  console.log(chalk.dim("        }"));
  console.log(chalk.dim("      }"));
  console.log(chalk.dim("    }"));
  console.log(chalk.dim("  }"));
  console.log("");
}