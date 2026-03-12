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

// ── UI helpers (inline) ───────────────────────────────────────────────────────
const box = (title) => {
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

function suggestAliases(skill, username) {
  return [
    `${username}-${skill}`,
    `${skill}-2`,
    `${skill}-am`,
    `${username}-${skill}-ai`,
  ];
}

export async function install(rawSkillName) {
  gap();

  // ── Header ────────────────────────────────────────────
  box("Install Skill");
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

  // ── Parse username/skill ──────────────────────────────
  const parts = rawSkillName.split("/");
  const username = normalizeUsername(parts[0]);
  const skill = parts[1];

  if (!username || !skill) {
    err("Invalid skill format");
    gap();
    divider();
    dim(`Use the format: ${chalk.yellow("<username>/<skill>")}`);
    dim(`Example:        ${chalk.cyan("agenticmarket install alice/summarizer")}`);
    gap();
    process.exit(1);
  }

  row("Skill",    `${username}/${skill}`, chalk.cyan);
  gap();

  // ── Step 2: Verify skill on marketplace ───────────────
  const spinner = ora({
    text: chalk.dim("Looking up skill on marketplace..."),
    color: "cyan",
    spinner: "dots",
  }).start();

  let skillData;
  try {
    const res = await fetch(`${API_BASE_URL}/skills/${username}/${skill}`, {
      headers: { "x-api-key": apiKey, command: "install" },
    });

    if (res.status === 404) {
      spinner.stop();
      err(`Skill "${username}/${skill}" not found`);
      gap();
      divider();
      info(`Browse skills at ${chalk.cyan.underline("https://agenticmarket.dev/skills")}`);
      gap();
      process.exit(1);
    }

    if (res.status === 401) {
      spinner.stop();
      err("Invalid API key");
      gap();
      process.exit(1);
    }

    skillData = await res.json();
    spinner.stop();
  } catch {
    spinner.stop();
    err("Network error — are you connected to the internet?");
    gap();
    process.exit(1);
  }

  ok(`Found ${chalk.cyan(`${username}/${skill}`)}`);
  row("Price",       `$${skillData.price} per call`, chalk.green);
  row("Description", skillData.description ?? "—",   chalk.dim);
  gap();
  divider();
  gap();

  // ── Step 3: Find installed IDEs ───────────────────────
  const installedIDEs = getInstalledIDEs();

  if (installedIDEs.length === 0) {
    warn("No supported IDEs detected on this machine");
    gap();
    dim("Supported: Claude Desktop, Cursor, VS Code, Windsurf");
    dim("Make sure one is installed and has been opened at least once.");
    gap();
    divider();
    gap();
    dim("Manual setup — add this to your MCP config:");
    printManualConfig(skill, username, apiKey);
    process.exit(0);
  }

  // ── Step 4: Ask which IDEs to install to ──────────────
  let targetIDEs;

  if (installedIDEs.length === 1) {
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `  Install to ${installedIDEs[0].icon} ${chalk.white(installedIDEs[0].name)}?`,
      initial: true,
    });

    if (!confirm) {
      gap();
      dim("Cancelled — nothing was changed.");
      gap();
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
          (currentIDE === "vscode"  && ide.name === "VS Code") ||
          (currentIDE === "cursor"  && ide.name.startsWith("Cursor"));
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
      gap();
      dim("Cancelled — nothing was changed.");
      gap();
      process.exit(0);
    }
    targetIDEs = selected;
  }

  // ── Step 5: Resolve MCP key / detect conflict ─────────
  const expectedUrl = `${PROXY_BASE_URL}/mcp/${username}/${skill}`;
  let resolvedKey = skill;
  let conflictFound = false;
  let isSameSkill = false;

  for (const ide of targetIDEs) {
    const config = readMCPConfig(ide.path, ide.format);
    const existing = config.mcpServers?.[skill];
    if (!existing) continue;
    conflictFound = true;
    const existingUrl    = existing.url    ?? "";
    const existingAuthor = existing.author ?? "";
    if (existingUrl === expectedUrl || existingAuthor === username) isSameSkill = true;
    break;
  }

  if (conflictFound && isSameSkill) {
    gap();
    warn(`${chalk.bold(skill)} by ${chalk.cyan(username)} is already installed`);
    gap();
    dim("Restart your IDE if the skill isn't active yet.");
    gap();
    process.exit(0);
  }

  if (conflictFound && !isSameSkill) {
    gap();
    warn(`A different skill is already using the name ${chalk.bold(`"${skill}"`)}`);
    dim("You need an alias for this skill in your MCP config.");
    gap();

    const suggestions = suggestAliases(skill, username);
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
      const config = readMCPConfig(ide.path, ide.format);
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

      config.mcpServers[resolvedKey] = buildMCPEntry(
        skill, username,
        skillData.description, skillData.price_cents
      );
      writeMCPConfig(ide.path, config);

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
    ok(chalk.green.bold("Skill installed"));
    gap();
    row("Skill",    `${username}/${skill}`,                                   chalk.cyan);
    if (resolvedKey !== skill)
      row("Alias",  `${resolvedKey}  ${chalk.dim("(name used in config)")}`,  chalk.yellow);
    row("Added to", `${successCount} IDE${successCount !== 1 ? "s" : ""}`,    chalk.white);
    gap();
    divider();
    gap();
    console.log(`  ${chalk.yellow("⚡")}  ${chalk.yellow.bold("Restart your IDE to activate the skill")}`);
    gap();
    dim(`Then ask your AI: ${chalk.italic(`"Use the ${resolvedKey} skill to..."`)}`);
    gap();
  }
}

// ── Manual config fallback ────────────────────────────────────────────────────
function printManualConfig(skill, username) {
  const entry = buildMCPEntry(skill, username);
  gap();
  console.log(chalk.dim(`  ${"─".repeat(48)}`));
  gap();
  dim(`Claude Desktop / Cursor — add to ${chalk.white("mcpServers")}:`);
  gap();
  console.log(
    chalk.dim(`    "${skill}": { "type": "http", "url": "${entry.url}",`),
  );
  console.log(
    chalk.dim(`      "headers": { "x-api-key": "your_key_here" } }`),
  );
  gap();
  dim(`VS Code — add to ${chalk.white(".vscode/mcp.json")} servers:`);
  gap();
  console.log(
    chalk.dim(`    "${skill}": { "type": "http", "url": "${entry.url}",`),
  );
  console.log(
    chalk.dim(`      "headers": { "x-api-key": "your_key_here" } }`),
  );
  gap();
}