/**
 * AgenticMarket agent-skill commands.
 *
 * Public skill content is free and does not require an API key. Installation
 * writes the exact SKILL.md returned by the marketplace into the selected
 * agent's native skill/rule location, then records a best-effort telemetry
 * event. Telemetry failure never turns a successful local install into a
 * failed install.
 */

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";
import { MARKETPLACE_API_BASE_URL } from "../config.js";

const VALID_SCOPES = new Set(["project", "user"]);
const ALL_AGENTS = [
  "andromity",
  "cursor",
  "claude-code",
  "windsurf",
  "antigravity",
  "cline",
  "copilot",
  "codex",
];

const AGENT_CHOICES = [
  { value: "andromity", title: "Andromity", description: "Native .andromity/skills support" },
  { value: "cursor", title: "Cursor", description: "Native .cursor/rules/*.mdc support" },
  { value: "claude-code", title: "Claude Code", description: "Native .claude/skills support" },
  { value: "windsurf", title: "Windsurf", description: "Managed .windsurfrules support" },
  { value: "antigravity", title: "Antigravity / Gemini CLI", description: "Native .agent/skills support" },
  { value: "cline", title: "Cline", description: "Native .clinerules support" },
  { value: "copilot", title: "GitHub Copilot", description: "Managed .github/copilot-instructions.md support" },
  { value: "codex", title: "Codex", description: "Native .codex/skills support" },
];

class AgentSelectionCancelled extends Error {
  constructor() {
    super("Agent selection cancelled");
    this.code = "AGENT_SELECTION_CANCELLED";
  }
}

const box = (title) => {
  const pad = "═".repeat(52);
  console.log(chalk.cyan.bold(`╔${pad}╗`));
  console.log(chalk.cyan.bold(`║  ${title.padEnd(50)}║`));
  console.log(chalk.cyan.bold(`╚${pad}╝`));
};
const gap = () => console.log("");
const ok = (message) => console.log(`  ${chalk.green("✓")}  ${message}`);
const warn = (message) => console.log(`  ${chalk.yellow("⚠")}  ${message}`);
const err = (message) => console.log(`  ${chalk.red("✗")}  ${chalk.red(message)}`);
const dim = (message) => console.log(`  ${chalk.dim(message)}`);

function skillRoot(agent, scope, cwd = process.cwd()) {
  if (!VALID_SCOPES.has(scope)) throw new Error(`Invalid scope: ${scope}`);
  if (scope === "project") {
    switch (agent) {
      case "andromity": return path.join(cwd, ".andromity", "skills");
      case "cursor": return path.join(cwd, ".cursor", "rules");
      case "claude-code": return path.join(cwd, ".claude", "skills");
      case "windsurf": return cwd;
      case "antigravity": return path.join(cwd, ".agent", "skills");
      case "cline": return path.join(cwd, ".clinerules");
      case "copilot": return cwd;
      case "codex": return path.join(cwd, ".codex", "skills");
      default: throw new Error(`Unsupported agent: ${agent}`);
    }
  }

  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  switch (agent) {
    case "andromity": return process.platform === "win32"
      ? path.join(appData, "andromity", "skills")
      : path.join(home, ".andromity", "skills");
    case "cursor": return path.join(home, ".cursor", "rules");
    case "claude-code": return path.join(home, ".claude", "skills");
    case "windsurf": return home;
    case "antigravity": return path.join(home, ".agent", "skills");
    case "cline": return path.join(home, ".clinerules");
    case "copilot": return home;
    case "codex": return path.join(process.env.CODEX_HOME || path.join(home, ".codex"), "skills");
    default: throw new Error(`Unsupported agent: ${agent}`);
  }
}

function destination(agent, slug, scope, cwd) {
  const root = skillRoot(agent, scope, cwd);
  if (agent === "cursor") return path.join(root, `${slug}.mdc`);
  if (agent === "cline") return path.join(root, `${slug}.md`);
  if (agent === "windsurf") return path.join(root, ".windsurfrules");
  if (agent === "copilot") return path.join(root, ".github", "copilot-instructions.md");
  return path.join(root, slug, "SKILL.md");
}

const AGGREGATE_AGENTS = new Set(["windsurf", "copilot"]);

function withoutFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

function renderSkillContent(agent, skill, content) {
  if (agent === "cursor") {
    return [
      "---",
      `description: ${JSON.stringify(skill.description || skill.name)}`,
      "globs: *",
      "alwaysApply: false",
      "---",
      "",
      `# ${skill.name}`,
      "",
      withoutFrontmatter(content),
      "",
    ].join("\n");
  }

  if (AGGREGATE_AGENTS.has(agent)) {
    return [
      `<!-- agenticmarket:skill:${skill.slug}:start -->`,
      `# AgenticMarket skill: ${skill.name}`,
      "",
      withoutFrontmatter(content),
      `<!-- agenticmarket:skill:${skill.slug}:end -->`,
      "",
    ].join("\n");
  }

  return content;
}

function parseAgents(value) {
  if (!value || value === "all") return [...ALL_AGENTS];
  const agents = value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const invalid = agents.filter((agent) => !ALL_AGENTS.includes(agent));
  if (invalid.length) throw new Error(`Unknown agent(s): ${invalid.join(", ")}`);
  return [...new Set(agents)];
}

async function selectAgents() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Choose an agent with --agent <id> or --all when running non-interactively");
  }

  const response = await prompts({
    type: "multiselect",
    name: "agents",
    message: "Install this skill for which agent(s)?",
    choices: AGENT_CHOICES.map((agent) => ({
      title: agent.title,
      description: agent.description,
      value: agent.value,
      selected: agent.value === "andromity",
    })),
    instructions: false,
    hint: "Space to toggle · Enter to install",
    min: 1,
  });

  if (!response.agents?.length) throw new AgentSelectionCancelled();
  return response.agents;
}

async function resolveAgents(options = {}) {
  if (options.agent) return parseAgents(options.agent);
  if (options.all) return [...ALL_AGENTS];
  return selectAgents();
}

function assertSlug(slug) {
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(slug)) {
    throw new Error("Skill slug must contain lowercase letters, numbers, and hyphens only");
  }
}

async function fetchSkill(slug) {
  const response = await fetch(`${MARKETPLACE_API_BASE_URL}/skills/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) throw new Error(`Skill "${slug}" was not found or is not published`);
  if (!response.ok) throw new Error(`Marketplace API returned ${response.status}`);
  const payload = await response.json();
  const skill = payload.skill || payload;
  if (!skill || typeof skill.slug !== "string") {
    throw new Error("Marketplace skill API is not deployed at this URL yet; /api/skills/:slug returned a non-skill response");
  }
  return skill;
}

async function fetchRawSkill(slug) {
  const response = await fetch(`${MARKETPLACE_API_BASE_URL}/skills/${encodeURIComponent(slug)}/raw`, {
    headers: { Accept: "text/markdown" },
  });
  if (response.status === 404) throw new Error(`Skill "${slug}" was not found or is not published`);
  if (!response.ok) throw new Error(`Skill content request returned ${response.status}`);
  return {
    content: await response.text(),
    checksum: response.headers.get("x-agenticmarket-checksum"),
    version: response.headers.get("x-agenticmarket-version"),
  };
}

async function recordInstall(slug, agent, scope) {
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(`${slug}|cli|${agent}|${scope}|${os.homedir()}`)
    .digest("hex");
  try {
    await fetch(`${MARKETPLACE_API_BASE_URL}/skills/install-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ slug, source: "cli", target: agent, scope, idempotencyKey }),
    });
  } catch {
    // Installation must remain usable offline or when telemetry is unavailable.
  }
}

function writeSkillFile(filePath, content, overwrite, aggregate = false) {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true });
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (aggregate) {
    const marker = content.match(/<!-- agenticmarket:skill:([^:]+):start -->/)?.[1];
    const markerPattern = marker
      ? new RegExp(`<!-- agenticmarket:skill:${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:start -->[\\s\\S]*?<!-- agenticmarket:skill:${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:end -->\\r?\\n?`, "g")
      : null;
    if (markerPattern?.test(existing)) {
      if (!overwrite) return { written: false, reason: "exists" };
      markerPattern.lastIndex = 0;
      content = existing.replace(markerPattern, content);
    } else {
      content = existing ? `${existing.replace(/\s*$/, "")}\n\n${content}` : content;
    }
  } else if (fs.existsSync(filePath) && !overwrite) {
    return { written: false, reason: "exists" };
  }
  if (fs.existsSync(filePath)) {
    const backup = `${filePath}.bak`;
    fs.copyFileSync(filePath, backup);
  }
  const temp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, content, "utf8");
  fs.renameSync(temp, filePath);
  return { written: true };
}

export async function installSkill(slug, options = {}) {
  assertSlug(slug);
  const scope = options.scope || "project";
  const agents = await resolveAgents(options);
  if (!VALID_SCOPES.has(scope)) throw new Error("Scope must be project or user");

  const skill = await fetchSkill(slug);
  const raw = await fetchRawSkill(slug);
  const content = raw.content.endsWith("\n") ? raw.content : `${raw.content}\n`;
  const results = [];

  for (const agent of agents) {
    if (agent === "codex" && scope === "user" && !process.env.CODEX_HOME && process.platform === "win32") {
      // CODEX_HOME is respected when present; the default remains ~/.codex for compatibility.
    }
    const filePath = destination(agent, slug, scope, process.cwd());
    const rendered = renderSkillContent(agent, skill, content);
    const result = writeSkillFile(
      filePath,
      rendered,
      Boolean(options.overwrite),
      AGGREGATE_AGENTS.has(agent),
    );
    results.push({ agent, scope, path: filePath, ...result });
    if (result.written) await recordInstall(slug, agent, scope);
  }

  return { skill, checksum: raw.checksum, version: raw.version, results };
}

export async function listSkills(options = {}) {
  const url = new URL(`${MARKETPLACE_API_BASE_URL}/skills`);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", String(Math.min(Number(options.limit) || 50, 100)));
  if (options.query) url.searchParams.set("q", options.query);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Marketplace API returned ${response.status}`);
  const payload = await response.json();
  const skills = payload.skills || [];
  if (skills.some((skill) => !skill || typeof skill.slug !== "string")) {
    throw new Error("Marketplace skill API is not deployed at this URL yet; /api/skills returned a non-skill catalog");
  }
  return skills;
}

function printInstallResult(result) {
  const installed = result.results.filter((item) => item.written);
  const skipped = result.results.filter((item) => !item.written);
  ok(`${result.skill.name} ${result.version ? `v${result.version}` : ""}`.trim());
  if (result.checksum) dim(`Checksum: ${result.checksum}`);
  for (const item of installed) ok(`${item.agent} (${item.scope}) → ${item.path}`);
  for (const item of skipped) warn(`${item.agent} skipped; file already exists: ${item.path}`);
  if (installed.length === 0) dim("No files changed. Use --overwrite to replace existing skill files.");
}

export async function skillInstallCommand(slug, options = {}) {
  gap();
  box("Install Agent Skill");
  gap();
  const spinner = options.json ? null : ora("Fetching verified skill content...").start();
  try {
    const result = await installSkill(slug, options);
    spinner?.stop();
    if (options.json) {
      console.log(JSON.stringify({
        slug,
        version: result.version,
        checksum: result.checksum,
        results: result.results,
      }, null, 2));
      return;
    }
    printInstallResult(result);
    gap();
    dim("The agent will load the skill on its next session or reload.");
    gap();
  } catch (error) {
    spinner?.fail(error.message);
    if (error?.code === "AGENT_SELECTION_CANCELLED") {
      dim("Cancelled — nothing was changed.");
      return;
    }
    if (options.json) console.log(JSON.stringify({ error: error.message }, null, 2));
    else err(error.message);
    process.exitCode = 1;
  }
}

export async function skillListCommand(options = {}) {
  try {
    const skills = await listSkills(options);
    if (options.json) {
      console.log(JSON.stringify(skills, null, 2));
      return;
    }
    gap();
    box(`Available Skills — ${skills.length}`);
    gap();
    for (const skill of skills) {
      console.log(`  ${chalk.cyan(skill.slug)}  ${chalk.dim(skill.name || "")}`);
      if (skill.description) dim(`  ${skill.description.slice(0, 100)}`);
    }
    gap();
  } catch (error) {
    if (options.json) console.log(JSON.stringify({ error: error.message }, null, 2));
    else err(error.message);
    process.exitCode = 1;
  }
}

export async function skillRemoveCommand(slug, options = {}) {
  assertSlug(slug);
  let agents;
  try {
    agents = await resolveAgents(options);
  } catch (error) {
    if (error?.code === "AGENT_SELECTION_CANCELLED") {
      dim("Cancelled — nothing was changed.");
      return;
    }
    throw error;
  }
  const scope = options.scope || "project";
  const removed = [];
  for (const agent of agents) {
    const filePath = destination(agent, slug, scope, process.cwd());
    if (fs.existsSync(filePath)) {
      if (AGGREGATE_AGENTS.has(agent)) {
        const existing = fs.readFileSync(filePath, "utf8");
        const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const markerPattern = new RegExp(`<!-- agenticmarket:skill:${escaped}:start -->[\\s\\S]*?<!-- agenticmarket:skill:${escaped}:end -->\\r?\\n?`, "g");
        const updated = existing.replace(markerPattern, "").replace(/\n{3,}/g, "\n\n");
        if (updated !== existing) {
          fs.copyFileSync(filePath, `${filePath}.bak`);
          fs.writeFileSync(filePath, updated, "utf8");
          removed.push({ agent, scope, path: filePath });
        }
      } else {
        fs.rmSync(filePath);
        removed.push({ agent, scope, path: filePath });
      }
    }
  }
  if (options.json) console.log(JSON.stringify({ slug, removed }, null, 2));
  else {
    gap();
    if (removed.length) removed.forEach((item) => ok(`${item.agent} (${item.scope}) ← ${item.path}`));
    else dim("No matching installed skill files found.");
    gap();
  }
}

export async function skillUpdateCommand(slug, options = {}) {
  return skillInstallCommand(slug, { ...options, overwrite: true });
}

export { ALL_AGENTS, destination, parseAgents, skillRoot };
