/**
 * src/commands/install-community.js
 *
 * agenticmarket install <slug>
 *
 * Installs a community MCP server from the AgenticMarket explore directory.
 * Community servers are independent — they run directly on the user's machine,
 * NOT through the AgenticMarket proxy. This command only manages config files.
 *
 * Flow:
 *   1. Checks API key exists (auth required for tracking)
 *   2. Fetches community server info from proxy server GET /community/:slug
 *   3. Matches API IDE configs to locally detected IDEs
 *   4. Falls back to installCommand if no IDE-specific config found
 *   5. Asks which IDEs to install to
 *   6. Parses config JSON, extracts MCP entry
 *   7. Handles config key conflicts (same as official install)
 *   8. Writes to IDE config files
 *   9. Tracks install via POST /community/:slug/install
 *  10. Saves to local ~/.agenticmarket/community.json registry
 */

import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";
import {
  getApiKey,
  getInstalledIDEs,
  detectRunningIDE,
  readMCPConfig,
  writeMCPConfig,
  API_BASE_URL,
  IDE_CONFIGS,
  matchIdeToConfig,
  parseCommunityIdeConfig,
  buildCommunityFallbackEntry,
  addCommunityInstall,
  loadCommunityRegistry,
} from "../config.js";

// ── UI helpers (identical style to install.js) ────────────────────────────────
const box      = (title) => {
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

function suggestAliases(configKey, slug) {
  return [
    `${slug}`,
    `${configKey}-community`,
    `${configKey}-2`,
    `${slug}-mcp`,
  ];
}

export async function installCommunity(slug) {
  gap();

  // ── Header ────────────────────────────────────────────
  box("Install Community Server");
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

  // ── Validate slug ─────────────────────────────────────
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(slug)) {
    err("Invalid server slug");
    gap();
    divider();
    dim(`Use the format: ${chalk.yellow("<slug>")}`);
    dim(`Example:        ${chalk.cyan("agenticmarket install fetch-mcp-server")}`);
    gap();
    process.exit(1);
  }

  // ── Check if already installed (per-IDE aware) ────────
  const registry = loadCommunityRegistry();
  const existingEntry = registry[slug];
  const alreadyInstalledIdes = existingEntry?.ides ?? [];

  row("Server", slug, chalk.magenta);
  row("Type",   "Community", chalk.dim);
  gap();

  // ── Step 2: Fetch community server from API ───────────
  const spinner = ora({
    text: chalk.dim("Looking up community server..."),
    color: "cyan",
    spinner: "dots",
  }).start();

  let serverData;
  try {
    const res = await fetch(`${API_BASE_URL}/community/${slug}`, {
      headers: { "x-api-key": apiKey, command: "install" },
    });

    if (res.status === 404) {
      spinner.stop();
      err(`Community server "${slug}" not found`);
      gap();
      divider();
      info(`Browse servers at ${chalk.cyan.underline("https://agenticmarket.dev/explore")}`);
      gap();
      process.exit(1);
    }

    if (res.status === 401) {
      spinner.stop();
      err("Invalid API key");
      gap();
      process.exit(1);
    }

    if (!res.ok) {
      spinner.stop();
      err(`API error (${res.status})`);
      gap();
      process.exit(1);
    }

    serverData = await res.json();
    spinner.stop();
  } catch {
    spinner.stop();
    err("Network error — are you connected to the internet?");
    gap();
    process.exit(1);
  }

  ok(`Found ${chalk.magenta(serverData.name)}`);
  row("Author",      serverData.author ?? "community",     chalk.dim);
  row("Category",    serverData.category ?? "other",        chalk.dim);
  row("Description", serverData.description ?? "—",         chalk.dim);
  if (serverData.requiresAuth) {
    gap();
    warn("This server requires external authentication");
    if (serverData.authType && serverData.authType !== "none") {
      dim(`Auth type: ${chalk.yellow(serverData.authType)}`);
    }
    dim("You may need to set environment variables after install.");
  }
  gap();
  divider();
  gap();

  // ── Step 3: Build IDE list ──────────────────────────────────────────────────
  const runningIDE = detectRunningIDE();

  // Entries for the IDE the user is currently running inside (project → global order)
  const runningIDEEntries = runningIDE
    ? IDE_CONFIGS
        .filter((ide) => ide.runningIDEId === runningIDE)
        .sort((a) => (a.scope === "project" ? -1 : 1))
    : [];

  // All other IDEs detected via filesystem (skip running IDE to avoid duplicates)
  const runningIds    = new Set(runningIDEEntries.map((e) => e.id));
  const otherDetected = getInstalledIDEs().filter((ide) => !runningIds.has(ide.id));

  const allDetectedIDEs = [...runningIDEEntries, ...otherDetected];

  // ── Step 3b: Match detected IDEs to available configs ───────────────────────
  // Priority: configJson (single config for ALL IDEs) > ideConfigs > installCommand
  const hasConfigJson = !!serverData.configJson;
  const ideConfigs = serverData.ideConfigs ?? [];
  const hasInstallCommand = !!serverData.installCommand;
  const choices = [];

  for (const ide of allDetectedIDEs) {
    if (hasConfigJson) {
      // configJson works for all IDEs — CLI handles per-IDE transforms
      choices.push({ ide, apiConfig: null, source: "configJson" });
    } else {
      const matched = matchIdeToConfig(ide.id, ideConfigs);
      if (matched) {
        choices.push({ ide, apiConfig: matched, source: "specific" });
      } else if (hasInstallCommand) {
        choices.push({ ide, apiConfig: null, source: "fallback" });
      }
    }
  }

  if (choices.length === 0) {
    warn("No supported IDEs detected with matching configs");
    gap();
    if (ideConfigs.length > 0) {
      dim("This server has configs for:");
      for (const cfg of ideConfigs) {
        dim(`  · ${cfg.label ?? cfg.ide}`);
      }
      gap();
    }
    dim("Make sure a supported IDE is installed and has been opened at least once.");
    if (serverData.installCommand) {
      gap();
      divider();
      gap();
      dim("Manual install command:");
      gap();
      console.log(`  ${chalk.cyan(serverData.installCommand)}`);
    }
    gap();
    process.exit(0);
  }

  // ── Step 4: Ask which IDEs to install to ──────────────

  // Tag each choice with whether the server is already installed in that IDE
  for (const choice of choices) {
    choice.alreadyInstalled = alreadyInstalledIdes.includes(choice.ide.id);
  }

  const newChoices       = choices.filter((c) => !c.alreadyInstalled);
  const installedChoices = choices.filter((c) => c.alreadyInstalled);

  let targetChoices;

  // If ALL detected IDEs already have this server, offer reinstall
  if (newChoices.length === 0 && installedChoices.length > 0) {
    gap();
    warn(`${chalk.bold(slug)} is already installed in all detected IDEs`);
    gap();
    for (const c of installedChoices) {
      dim(`  ${c.ide.icon}  ${c.ide.name}  ${chalk.dim(c.ide.scope)}  ${chalk.green("✓ installed")}`);
    }
    gap();
    if (existingEntry) {
      row("Config key", existingEntry.configKey, chalk.cyan);
      row("Installed",  existingEntry.installedAt ?? "—", chalk.dim);
    }
    gap();

    const { reinstall } = await prompts({
      type: "confirm",
      name: "reinstall",
      message: `  Reinstall / update in these IDEs?`,
      initial: false,
    });

    if (!reinstall) {
      gap();
      dim("No changes made. Restart your IDE if the server isn't active yet.");
      gap();
      process.exit(0);
    }
    // User wants reinstall — continue with all installed choices
    targetChoices = choices;
  }

  // Only prompt for IDE selection if reinstall didn't already set targetChoices
  if (!targetChoices) {
    if (choices.length === 1) {
    const already = choices[0].alreadyInstalled;
      const { confirm } = await prompts({
        type: "confirm",
        name: "confirm",
        message: already
          ? `  ${choices[0].ide.icon} ${chalk.white(choices[0].ide.name)} ${chalk.yellow("(already installed)")} — reinstall?`
          : `  Install to ${choices[0].ide.icon} ${chalk.white(choices[0].ide.name)}?`,
        initial: !already,
      });
      if (!confirm) { gap(); dim("Cancelled — nothing was changed."); gap(); process.exit(0); }
      targetChoices = choices;
    } else {
      // Show installed status in the multi-select list
      if (installedChoices.length > 0 && newChoices.length > 0) {
        gap();
        info(`Already installed in:`);
        for (const c of installedChoices) {
          dim(`  ${c.ide.icon}  ${c.ide.name}  ${chalk.dim(c.ide.scope)}  ${chalk.green("✓")}`);
        }
        gap();
      }

      const { selected } = await prompts({
        type: "multiselect",
        name: "selected",
        message: runningIDE
          ? `  ${runningIDEEntries[0]?.icon ?? ""} ${runningIDEEntries[0]?.name.split(" ")[0] ?? ""} detected — install to:`
          : "  Install to which IDEs?",
        choices: choices.map((choice) => ({
          title: `${choice.ide.icon}  ${choice.ide.name}  ${chalk.dim(choice.ide.scope)}${choice.source === "fallback" ? chalk.dim(" (generic)") : ""}${choice.alreadyInstalled ? chalk.yellow(" (installed)") : ""}`,
          value: choice,
          // Pre-tick: new IDEs that match running IDE or project scope. Already-installed IDEs are unchecked.
          selected: choice.alreadyInstalled
            ? false
            : runningIDE
              ? choice.ide.runningIDEId === runningIDE
              : choice.ide.scope === "project",
        })),
        instructions: false,
        hint: "Space to toggle, Enter to confirm",
      });

      if (!selected || selected.length === 0) {
        gap();
        dim("Cancelled — nothing was changed.");
        gap();
        process.exit(0);
      }
      targetChoices = selected;
    }
  }

  // ── Step 5: Resolve config key + detect conflicts ─────
  //
  // The "config key" is the key name used inside mcpServers (e.g. "fetch").
  // We extract it from the first available IDE config, or use the slug.
  // ──────────────────────────────────────────────────────────────────────────

  // Determine the config key from the first available specific config
  // If previously installed, reuse the same config key to avoid re-triggering alias prompts
  let resolvedKey = existingEntry?.configKey ?? slug;
  if (!existingEntry) {
    const firstSpecific = targetChoices.find((c) => c.source === "specific");
    if (firstSpecific) {
      const parsed = parseCommunityIdeConfig(firstSpecific.apiConfig.config);
      if (parsed?.name) resolvedKey = parsed.name;
    }
  }

  // Check for key conflicts across targeted IDEs
  let conflictFound = false;

  for (const choice of targetChoices) {
    // Skip conflict check for IDEs that already have this server — finding the key is expected
    if (choice.alreadyInstalled) continue;
    const config   = readMCPConfig(choice.ide.configPath, choice.ide.configKey);
    const existing = config.mcpServers?.[resolvedKey];
    if (existing) {
      conflictFound = true;
      break;
    }
  }

  if (conflictFound) {
    gap();
    warn(`A server is already using the name ${chalk.bold(`"${resolvedKey}"`)}`);
    dim("You need an alias for this community server.");
    gap();

    const suggestions = suggestAliases(resolvedKey, slug);
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
  const installedIdeIds = [];

  for (const choice of targetChoices) {
    const writeSpinner = ora({
      text: chalk.dim(`Adding to ${choice.ide.name}...`),
      color: "cyan",
      spinner: "dots",
    }).start();

    try {
      const config = readMCPConfig(choice.ide.configPath, choice.ide.configKey);
      let entry;

      if (choice.source === "configJson") {
        // Use the single configJson from the API — parse and use directly
        try {
          entry = JSON.parse(serverData.configJson);
        } catch {
          writeSpinner.stop();
          err(`${choice.ide.icon}  ${choice.ide.name}  ${chalk.dim("could not parse configJson")}`);
          continue;
        }
        // Apply IDE-specific transform if this IDE has one (e.g. Zed, Codex, Goose)
        if (choice.ide.transformEntry) {
          entry = choice.ide.transformEntry({
            ...entry,
            server:      resolvedKey,
            description: serverData.description ?? "",
          });
        }
      } else if (choice.source === "specific") {
        // Parse the IDE-specific config from API (backward compat)
        const parsed = parseCommunityIdeConfig(choice.apiConfig.config);
        if (!parsed) {
          writeSpinner.stop();
          err(`${choice.ide.icon}  ${choice.ide.name}  ${chalk.dim("could not parse config")}`);
          continue;
        }
        entry = parsed.entry;
      } else {
        // Fallback: build generic entry from installCommand
        entry = buildCommunityFallbackEntry(serverData.installCommand);
        // Apply IDE-specific transform (e.g. Zed, Codex, Antigravity, Goose)
        if (choice.ide.transformEntry) {
          entry = choice.ide.transformEntry({
            ...entry,
            server:      resolvedKey,
            description: serverData.description ?? "",
          });
        }
      }

      config.mcpServers[resolvedKey] = entry;
      writeMCPConfig(choice.ide.configPath, config);

      writeSpinner.stop();
      ok(`${choice.ide.icon}  ${chalk.white(choice.ide.name)}`);
      successCount++;
      installedIdeIds.push(choice.ide.id);
    } catch (e) {
      writeSpinner.stop();
      err(`${choice.ide.icon}  ${choice.ide.name}  ${chalk.dim(e.message)}`);
    }
  }

  // ── Step 7: Track install + save to local registry ────
  if (successCount > 0) {
    // Merge new IDE IDs with previously tracked ones
    const mergedIdes = [...new Set([...alreadyInstalledIdes, ...installedIdeIds])];
    addCommunityInstall(slug, {
      name:        serverData.name,
      slug:        slug,
      configKey:   resolvedKey,
      author:      serverData.author ?? "community",
      description: serverData.description ?? "",
      installedAt: new Date().toISOString(),
      ides:        mergedIdes,
    });

    // Track installs on the server (fire-and-forget per IDE, don't block the user)
    for (const ideId of installedIdeIds) {
      fetch(`${API_BASE_URL}/community/${slug}/install`, {
        method: "POST",
        headers: {
          "x-api-key":    apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ide: ideId }),
      }).catch(() => {
        // Silent failure — tracking is best-effort, install already succeeded
      });
    }

    // ── Step 8: Done ──────────────────────────────────────
    gap();
    divider();
    gap();
    ok(chalk.green.bold("Community server installed"));
    gap();
    row("Server",    serverData.name,                                          chalk.magenta);
    row("Slug",      slug,                                                     chalk.dim);
    if (resolvedKey !== slug && resolvedKey !== serverData.name?.toLowerCase())
      row("Alias",   `${resolvedKey}  ${chalk.dim("(name used in config)")}`,  chalk.yellow);
    row("Added to",  `${successCount} IDE${successCount !== 1 ? "s" : ""}`,    chalk.white);
    row("Type",      "Community (direct — no proxy)",                          chalk.dim);
    gap();
    divider();
    gap();
    console.log(`  ${chalk.yellow("⚡")}  ${chalk.yellow.bold("Restart your IDE to activate the server")}`);
    gap();
    if (serverData.requiresAuth) {
      warn("Remember to configure any required API keys / env vars.");
      gap();
    }
    dim(`Then ask your AI: ${chalk.italic(`"Use the ${resolvedKey} server to..."`)}`);
    gap();
    console.log(`  ${chalk.yellow("⭐")}  ${chalk.dim("Enjoying AgenticMarket?")} ${chalk.cyan.underline("https://github.com/agenticmarket/agenticmarket-cli")} ${chalk.dim("— give us a star!")}`);
    gap();
  }
}
