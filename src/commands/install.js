/**
 * src/commands/install.js
 *
 * agenticmarket install <skill-name>
 *
 * 1. Checks API key exists
 * 2. Verifies skill exists on marketplace
 * 3. Finds all IDEs installed on this machine
 * 4. Resolves what key to use in mcpServers (MCP clients can't handle "user/skill")
 *    → If no conflict: uses plain skill name e.g. "summarizer"
 *    → If conflict with SAME author/url: tells user it's already installed, skips
 *    → If conflict with DIFFERENT skill: asks user to pick an alias, suggests options
 * 5. Edits their MCP config files automatically (using the correct format per IDE)
 * 6. Done — no manual JSON editing needed
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
  PROXY_BASE_URL,
  API_BASE_URL,
} from "../config.js";

function normalizeUsername(username) {
  return username.startsWith("@") ? username.slice(1) : username;
}

function suggestAliases(skill, username) {
  return [
    `${username}-${skill}`,
    `${skill}-2`,
    `${skill}-am`,
    `${username}-${skill}-ai`,
  ];
}

export async function install(rawSkillName) {
  console.log("");

  // ── Step 1: Check auth ────────────────────────────
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(chalk.red("  ✗ Not authenticated."));
    console.log(chalk.dim("  Run first: agenticmarket auth <api-key>"));
    console.log(chalk.dim("  Get your key at: https://agenticmarket.dev\n"));
    process.exit(1);
  }

  // ── Parse username/skill from input ───────────────
  const parts = rawSkillName.split("/");
  const username = normalizeUsername(parts[0]);
  const skill = parts[1];

  if (!username || !skill) {
    console.error(chalk.red("  ✗ Invalid skill name format."));
    console.log(chalk.dim("  Use the format: username/skill"));
    console.log(chalk.dim("  Example: @alice/summarizer\n"));
    process.exit(1);
  }

  // ── Step 2: Verify skill exists on marketplace ────
  const spinner = ora(
    `  Looking up skill: ${chalk.cyan(username)}/${chalk.cyan(skill)}`,
  ).start();

  let skillData;
  try {
    const res = await fetch(`${API_BASE_URL}/skills/${username}/${skill}`, {
      headers: { "x-api-key": apiKey },
    });

    if (res.status === 404) {
      spinner.fail(
        chalk.red(`  Skill "${username}/${skill}" not found on marketplace.`),
      );
      console.log(
        chalk.dim("  Browse skills at: https://agenticmarket.dev/skills\n"),
      );
      process.exit(1);
    }

    if (res.status === 401) {
      spinner.fail(chalk.red("  Invalid API key."));
      process.exit(1);
    }

    skillData = await res.json();
    spinner.succeed(
      `  Found: ${chalk.cyan(username)}/${chalk.cyan(skill)} — ${chalk.green("$" + skillData.price)} per call`,
    );
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
    console.log(
      "  Make sure at least one is installed and has been opened once.",
    );
    console.log("");
    console.log(chalk.dim("  Manual setup — add this to your MCP config:"));
    printManualConfig(skill, username, apiKey);
    process.exit(0);
  }

  // ── Step 4: Ask which IDEs to install to ─────────
  console.log("");

  let targetIDEs;

  if (installedIDEs.length === 1) {
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
    const currentIDE = detectCurrentIDE();
    const { selected } = await prompts({
      type: "multiselect",
      name: "selected",
      message: "  Install to which IDEs?",
      choices: installedIDEs.map((ide) => {
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

  // ── Step 5: Resolve the MCP key to use ───────────
  const expectedUrl = `${PROXY_BASE_URL}/mcp/${username}/${skill}`;

  let resolvedKey = skill;
  let conflictFound = false;
  let isSameSkill = false;

  for (const ide of targetIDEs) {
    // ✅ Pass ide.format so we read the correct top-level key
    const config = readMCPConfig(ide.path, ide.format);
    const existing = config.mcpServers?.[skill];

    if (!existing) continue;

    conflictFound = true;

    const existingUrl = existing.url ?? "";
    const existingAuthor = existing.author ?? "";

    if (existingUrl === expectedUrl || existingAuthor === username) {
      isSameSkill = true;
    }

    break;
  }

  if (conflictFound && isSameSkill) {
    console.log("");
    console.log(
      chalk.yellow(
        `  ⚠ ${chalk.bold(skill)} by ${chalk.cyan(username)} is already installed.`,
      ),
    );
    console.log(chalk.dim("  Restart your IDE if the skill isn't active yet."));
    console.log("");
    process.exit(0);
  }

  if (conflictFound && !isSameSkill) {
    console.log("");
    console.log(
      chalk.yellow(
        `  ⚠ A different skill is already installed under the name ${chalk.bold(`"${skill}"`)}.`,
      ),
    );
    console.log(
      chalk.dim(
        "  You need a different name (alias) for this skill in your MCP config.",
      ),
    );
    console.log("");

    const suggestions = suggestAliases(skill, username);

    const { aliasChoice } = await prompts({
      type: "select",
      name: "aliasChoice",
      message: "  Choose an alias for this skill:",
      choices: [
        ...suggestions.map((s) => ({ title: chalk.cyan(s), value: s })),
        { title: chalk.dim("Enter a custom name..."), value: "__custom__" },
      ],
    });

    if (!aliasChoice) {
      console.log(chalk.dim("\n  Cancelled.\n"));
      process.exit(0);
    }

    if (aliasChoice === "__custom__") {
      const { customAlias } = await prompts({
        type: "text",
        name: "customAlias",
        message: "  Enter a custom alias (letters, numbers, hyphens only):",
        validate: (v) =>
          /^[a-zA-Z0-9_-]{1,64}$/.test(v)
            ? true
            : "Only letters, numbers, hyphens and underscores allowed (max 64 chars)",
      });

      if (!customAlias) {
        console.log(chalk.dim("\n  Cancelled.\n"));
        process.exit(0);
      }

      resolvedKey = customAlias;
    } else {
      resolvedKey = aliasChoice;
    }

    console.log(chalk.dim(`\n  Will install as: ${chalk.bold(resolvedKey)}\n`));
  }

  // ── Step 6: Write to each config file ────────────
  console.log("");
  let successCount = 0;

  for (const ide of targetIDEs) {
    const writeSpinner = ora(`  Adding to ${ide.name}...`).start();

    try {
      // ✅ Pass ide.format so we read AND write the correct schema
      const config = readMCPConfig(ide.path, ide.format);

      const existingEntry = config.mcpServers?.[resolvedKey];
      if (existingEntry) {
        const existingUrl = existingEntry.url ?? "";
        const existingAuthor = existingEntry.author ?? "";
        if (existingUrl === expectedUrl || existingAuthor === username) {
          writeSpinner.warn(
            chalk.yellow(`  Already installed in ${ide.name} — skipping`),
          );
          continue;
        }
      }

      config.mcpServers[resolvedKey] = buildMCPEntry(skill, username, apiKey);
      writeMCPConfig(ide.path, config); // writeMCPConfig reads _format from config

      writeSpinner.succeed(chalk.green(`  Added to ${ide.name}`));
      successCount++;
    } catch (err) {
      writeSpinner.fail(
        chalk.red(`  Failed to update ${ide.name}: ${err.message}`),
      );
    }
  }

  // ── Step 7: Done ──────────────────────────────────
  if (successCount > 0) {
    console.log("");
    console.log(chalk.bold.green("  ✓ Skill installed!"));
    console.log("");
    console.log(
      `  ${chalk.dim("Skill:")}      ${chalk.cyan(username)}/${chalk.cyan(skill)}`,
    );
    if (resolvedKey !== skill) {
      console.log(
        `  ${chalk.dim("Installed as:")} ${chalk.cyan(resolvedKey)} ${chalk.dim("(alias)")}`,
      );
    }
    console.log(
      `  ${chalk.dim("Added to:")}   ${successCount} IDE${successCount > 1 ? "s" : ""}`,
    );
    console.log("");
    console.log(chalk.yellow("  ⚡ Restart your IDE to activate the skill."));
    console.log("");
    console.log(chalk.dim("  Then ask your AI assistant to use it:"));
    console.log(chalk.dim(`  "Use the ${resolvedKey} skill to..."`));
    console.log("");
  }
}

function printManualConfig(skill, username, apiKey) {
  const entry = buildMCPEntry(skill, username, apiKey);
  console.log("");
  console.log(chalk.dim("  Claude Desktop / Cursor — add to mcpServers:"));
  console.log("");
  console.log(
    chalk.dim(
      `    "${skill}": { "type": "http", "url": "${entry.url}", "headers": { "x-api-key": "..." } }`,
    ),
  );
  console.log("");
  console.log(chalk.dim("  VS Code (.vscode/mcp.json) — add to servers:"));
  console.log("");
  console.log(
    chalk.dim(
      `    "${skill}": { "type": "http", "url": "${entry.url}", "headers": { "x-api-key": "..." } }`,
    ),
  );
  console.log("");
}
