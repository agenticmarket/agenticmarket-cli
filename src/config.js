/**
 * src/config.js — AgenticMarket config + IDE MCP registry
 *
 * Saves own config to:  ~/.agenticmarket/config.json
 *
 * Supports writing MCP server entries to:
 *   Claude Desktop, Claude Code, Cursor, VS Code, Windsurf,
 *   Gemini CLI, Zed, Cline (VSCode ext), Codex, Antigravity (Google), 
 *
 * Each IDE entry is fully self-describing:
 *   detect()          → boolean  (is this IDE installed / is this a project dir?)
 *   configKey         → the top-level JSON key used by that IDE
 *   transformEntry()  → optional per-IDE schema normalisation
 *
 * Detection strategy (two-tier, no env vars required):
 *   Global  — check known home-dir paths with existsSync
 *   Project — check CWD for marker folders/files with existsSync
 */

import fs   from "fs";
import path from "path";
import os   from "os";
import yaml from "yaml";
import * as toml from "smol-toml";

// ── AgenticMarket own config ───────────────────────────────────────────────────

const AM_CONFIG_DIR  = path.join(os.homedir(), ".agenticmarket");
const AM_CONFIG_FILE = path.join(AM_CONFIG_DIR, "config.json");

export const PROXY_BASE_URL = "https://api.agenticmarket.dev";
export const API_BASE_URL   = PROXY_BASE_URL;

export function saveConfig(data) {
  if (!fs.existsSync(AM_CONFIG_DIR)) fs.mkdirSync(AM_CONFIG_DIR, { recursive: true });
  const existing = loadConfig();
  fs.writeFileSync(AM_CONFIG_FILE, JSON.stringify({ ...existing, ...data }, null, 2));
}

export function loadConfig() {
  if (!fs.existsSync(AM_CONFIG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(AM_CONFIG_FILE, "utf-8")); }
  catch { return {}; }
}

export function getApiKey() {
  return loadConfig().apiKey ?? null;
}

// ── Platform paths ─────────────────────────────────────────────────────────────

const home      = os.homedir();
const isWin     = process.platform === "win32";
const isMac     = process.platform === "darwin";
const appData   = process.env.APPDATA   ?? path.join(home, "AppData", "Roaming");
const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");

/** VS Code user-data dir, platform-aware */
const vscodePath = isWin
  ? path.join(appData,  "Code", "User")
  : isMac
    ? path.join(home, "Library", "Application Support", "Code", "User")
    : path.join(xdgConfig, "Code", "User");

/** Returns the app-support root for macOS / Win / Linux */
const appSupport = isWin
  ? appData
  : isMac
    ? path.join(home, "Library", "Application Support")
    : xdgConfig;

/** Windsurf MCP config root — lives under .codeium/windsurf, NOT %APPDATA%\Windsurf */
const windsurfConfigDir = path.join(home, ".codeium", "windsurf");

// ── IDE registry ───────────────────────────────────────────────────────────────
//
// Each entry shape:
// {
//   id          : string          — stable identifier, never changes
//   name        : string          — display label shown in prompts
//   icon        : string          — emoji prefix
//   scope       : "global"|"project"
//   configPath  : string          — absolute path to the config file
//   configKey   : string          — top-level key inside the config file
//   detect()    : () => boolean   — returns true if IDE is present
//   transformEntry(entry)         — (optional) normalise to IDE-specific schema
// }
//
// "global" entries represent the IDE's user-wide config (always available).
// "project" entries represent per-repo config (only shown when marker exists).

export const IDE_CONFIGS = [

  // ── Claude Desktop ──────────────────────────────────────────────────────────
  {
    id:   "claude-desktop",
    name: "Claude Desktop",
    icon: "🤖",
    scope: "global",
    runningIDEId: null,          // no terminal env vars for Claude Desktop
    configPath: isWin
      ? path.join(appData,  "Claude", "claude_desktop_config.json")
      : isMac
        ? path.join(appSupport, "Claude", "claude_desktop_config.json")
        : path.join(xdgConfig,  "claude", "claude_desktop_config.json"),
    configKey: "mcpServers",
    detect() { return fs.existsSync(path.dirname(this.configPath)); },
  },

  // ── Claude Code (global) ────────────────────────────────────────────────────
  {
    id:   "claude-code-global",
    name: "Claude Code (global)",
    icon: "🔷",
    scope: "global",
    runningIDEId: "claude-code",
    configPath: path.join(home, ".claude.json"),
    configKey:  "mcpServers",
    detect() { return fs.existsSync(path.join(home, ".claude")); },
  },

  // ── Claude Code (project) ───────────────────────────────────────────────────
  {
    id:   "claude-code-project",
    name: "Claude Code (project)",
    icon: "🔷",
    scope: "project",
    runningIDEId: "claude-code",
    configPath: path.join(process.cwd(), ".mcp.json"),
    configKey:  "mcpServers",
    detect() {
      return (
        fs.existsSync(path.join(process.cwd(), ".mcp.json")) ||
        fs.existsSync(path.join(process.cwd(), ".claude"))
      );
    },
  },

  // ── Cursor (global) ─────────────────────────────────────────────────────────
  {
    id:   "cursor-global",
    name: "Cursor (global)",
    icon: "⚡",
    scope: "global",
    runningIDEId: "cursor",
    configPath: path.join(home, ".cursor", "mcp.json"),
    configKey:  "mcpServers",
    detect() { return fs.existsSync(path.join(home, ".cursor")); },
  },

  // ── Cursor (project) ────────────────────────────────────────────────────────
  {
    id:   "cursor-project",
    name: "Cursor (project)",
    icon: "⚡",
    scope: "project",
    runningIDEId: "cursor",
    configPath: path.join(process.cwd(), ".cursor", "mcp.json"),
    configKey:  "mcpServers",
    detect() { return fs.existsSync(path.join(process.cwd(), ".cursor")); },
  },

  // ── VS Code (project) ───────────────────────────────────────────────────────
  //
  // VS Code's global mcp.json uses "servers" key and needs { type } on entries.
  // Its project-level .vscode/mcp.json uses the same "servers" schema.
  // We default to project-level (the most common use-case).
  // ───────────────────────────────────────────────────────────────────────────
  {
    id:   "vscode-project",
    name: "VS Code (project)",
    icon: "💙",
    scope: "project",
    runningIDEId: "vscode",
    configPath: path.join(process.cwd(), ".vscode", "mcp.json"),
    configKey:  "servers",
    detect() { return fs.existsSync(path.join(process.cwd(), ".vscode")); },
  },

  // ── VS Code (global) ────────────────────────────────────────────────────────
  {
    id:   "vscode-global",
    name: "VS Code (global)",
    icon: "💙",
    scope: "global",
    runningIDEId: "vscode",
    configPath: path.join(vscodePath, "mcp.json"),
    configKey:  "servers",
    detect() { return fs.existsSync(vscodePath); },
  },

  // ── Windsurf ─────────────────────────────────────────────────────────────────
  // Official path per windsurf.com docs: ~/.codeium/windsurf/mcp_config.json
  // (NOT %APPDATA%\Windsurf\User — that is Windsurf's settings dir, not MCP)
  {
    id:   "windsurf-global",
    name: "Windsurf (global)",
    icon: "🌊",
    scope: "global",
    runningIDEId: "windsurf",
    configPath: path.join(windsurfConfigDir, "mcp_config.json"),
    configKey:  "mcpServers",
    detect() { return fs.existsSync(windsurfConfigDir); },
  },

  // ── Gemini CLI (global) ─────────────────────────────────────────────────────
  {
    id:   "gemini-cli-global",
    name: "Gemini CLI (global)",
    icon: "♊",
    scope: "global",
    runningIDEId: "gemini",
    configPath: path.join(home, ".gemini", "settings.json"),
    configKey:  "mcpServers",
    detect() { return fs.existsSync(path.join(home, ".gemini")); },
  },

  // ── Gemini CLI (project) ────────────────────────────────────────────────────
  {
    id:   "gemini-cli-project",
    name: "Gemini CLI (project)",
    icon: "♊",
    scope: "project",
    runningIDEId: "gemini",
    configPath: path.join(process.cwd(), ".gemini", "settings.json"),
    configKey:  "mcpServers",
    detect() { return fs.existsSync(path.join(process.cwd(), ".gemini")); },
  },

  // ── Zed ─────────────────────────────────────────────────────────────────────
  // Zed uses "context_servers" and a different per-server schema.
  // transformEntry converts our standard entry to Zed's shape.
  {
    id:   "zed-global",
    name: "Zed",
    icon: "⚫",
    scope: "global",
    runningIDEId: null,
    configPath: isWin || isMac
      ? path.join(appSupport, "Zed", "settings.json")
      : path.join(xdgConfig,  "zed",  "settings.json"),
    configKey: "context_servers",
    detect() {
      const zedDir = isWin || isMac
        ? path.join(appSupport, "Zed")
        : path.join(xdgConfig,  "zed");
      return fs.existsSync(zedDir);
    },
    // Zed schema: { source: "custom", command, args, env }
    transformEntry(entry) {
      return {
        source:  "custom",
        command: entry.command,
        args:    entry.args ?? [],
        env:     entry.env  ?? {},
      };
    },
  },

  // ── Cline VSCode Extension ──────────────────────────────────────────────────
  {
    id:   "cline-vscode",
    name: "Cline (VSCode ext)",
    icon: "🟣",
    scope: "global",
    runningIDEId: null,
    configPath: path.join(
      vscodePath,
      "globalStorage", "saoudrizwan.claude-dev",
      "settings", "cline_mcp_settings.json",
    ),
    configKey: "mcpServers",
    detect() {
      return fs.existsSync(
        path.join(vscodePath, "globalStorage", "saoudrizwan.claude-dev", "settings"),
      );
    },
  },

  // ── Codex (global) ──────────────────────────────────────────────────────────
  // Codex stores MCP config in ~/.codex/config.toml under [mcp_servers.<name>]
  // Ref: https://antigravity.google/docs/mcp (Codex section)
  {
    id:   "codex-global",
    name: "Codex (global)",
    icon: "🧠",
    scope: "global",
    runningIDEId: null,
    configPath: path.join(
      process.env.CODEX_HOME ?? path.join(home, ".codex"),
      "config.toml",
    ),
    configKey: "mcp_servers",
    detect() {
      return fs.existsSync(
        process.env.CODEX_HOME ?? path.join(home, ".codex"),
      );
    },
    // Codex only allows: command, args, env, env_vars, cwd + optional flags
    transformEntry(entry) {
      return {
        command: entry.command,
        args:    entry.args ?? [],
        ...(entry.env ? { env: entry.env } : {}),
      };
    },
  },

  // ── Codex (project) ─────────────────────────────────────────────────────────
  {
    id:   "codex-project",
    name: "Codex (project)",
    icon: "🧠",
    scope: "project",
    runningIDEId: null,
    configPath: path.join(process.cwd(), ".codex", "config.toml"),
    configKey: "mcp_servers",
    detect() {
      return fs.existsSync(path.join(process.cwd(), ".codex"));
    },
    transformEntry(entry) {
      return {
        command: entry.command,
        args:    entry.args ?? [],
        ...(entry.env ? { env: entry.env } : {}),
      };
    },
  },

  // ── Antigravity (Google) — global ───────────────────────────────────────────
  // Antigravity stores its MCP config at ~/.gemini/antigravity/mcp_config.json
  // IMPORTANT: Antigravity's validator rejects any entry that has BOTH a
  // serverUrl/url field AND command/args/env fields. We strip all non-standard
  // metadata fields and keep only the valid stdio schema: type, command, args, env.
  {
    id:   "antigravity-global",
    name: "Antigravity (global)",
    icon: "🪐",
    scope: "global",
    runningIDEId: "antigravity",
    configPath: path.join(home, ".gemini", "antigravity", "mcp_config.json"),
    configKey:  "mcpServers",
    detect() { return fs.existsSync(path.join(home, ".gemini", "antigravity")); },
    transformEntry(entry) {
      // Only keep fields Antigravity's MCP schema accepts for stdio servers.
      // serverUrl, creatorUrl, author, price_cents, server, installedAt, description
      // all cause validation errors when combined with command/args.
      return {
        type:    entry.type ?? "stdio",
        command: entry.command,
        args:    entry.args ?? [],
        ...(entry.env ? { env: entry.env } : {}),
      };
    },
  },

  // ── Antigravity (Google) — project ──────────────────────────────────────────
  {
    id:   "antigravity-project",
    name: "Antigravity (project)",
    icon: "🪐",
    scope: "project",
    runningIDEId: "antigravity",
    configPath: path.join(process.cwd(), ".gemini", "antigravity", "mcp_config.json"),
    configKey:  "mcpServers",
    detect() { return fs.existsSync(path.join(process.cwd(), ".gemini", "antigravity")); },
    transformEntry(entry) {
      return {
        type:    entry.type ?? "stdio",
        command: entry.command,
        args:    entry.args ?? [],
        ...(entry.env ? { env: entry.env } : {}),
      };
    },
  },

  // ── GitHub Copilot CLI ──────────────────────────────────────────────────────
  {
    id:   "copilot-global",
    name: "Copilot CLI",
    icon: "🐙",
    scope: "global",
    runningIDEId: null,
    configPath: path.join(
      process.env.XDG_CONFIG_HOME ?? path.join(home, ".copilot"),
      "mcp-config.json",
    ),
    configKey: "mcpServers",
    detect() {
      return fs.existsSync(
        process.env.XDG_CONFIG_HOME ?? path.join(home, ".copilot"),
      );
    },
  },

  // ── Goose CLI ───────────────────────────────────────────────────────────────
  {
    id:   "goose-global",
    name: "Goose",
    icon: "🪿",
    scope: "global",
    runningIDEId: null,
    configPath: isWin
      ? path.join(appData, "Block", "goose", "config", "config.yaml")
      : isMac
        ? path.join(home, ".config", "goose", "config.yaml")
        : path.join(xdgConfig, "goose", "config.yaml"),
    configKey: "extensions",
    detect() {
      const gooseDir = isWin
        ? path.join(appData, "Block", "goose")
        : isMac
          ? path.join(home, ".config", "goose")
          : path.join(xdgConfig, "goose");
      return fs.existsSync(gooseDir);
    },
    transformEntry(entry) {
      if (entry.url) {
        return {
          name: entry.server,
          description: entry.description ?? "",
          type: entry.type === "sse" ? "sse" : "streamable_http",
          uri: entry.url,
          headers: entry.headers ?? {},
          enabled: true,
          timeout: 300,
        };
      }
      return {
        name: entry.server,
        description: entry.description ?? "",
        cmd: entry.command,
        args: entry.args ?? [],
        enabled: true,
        envs: entry.env ?? {},
        type: "stdio",
        timeout: 300,
      };
    },
  },

];

// ── Detection helpers ──────────────────────────────────────────────────────────

/**
 * detectRunningIDE()
 *
 * Returns "antigravity" | "vscode" | "cursor" | "windsurf" | "gemini" | null.
 * Uses env vars injected by the IDE's built-in terminal as a HINT only —
 * never as a gate. Used purely for pre-selecting the active IDE in prompts.
 */
export function detectRunningIDE() {
  const askpass    = (process.env.VSCODE_GIT_ASKPASS_NODE ?? "").toLowerCase();
  const ipcHook    = (process.env.VSCODE_IPC_HOOK_CLI     ?? "").toLowerCase();
  const term       = (process.env.TERM_PROGRAM             ?? "").toLowerCase();
  const agentId    = (process.env.ANTIGRAVITY_AGENT_ID     ?? "").toLowerCase();
  const convId     = (process.env.ANTIGRAVITY_CONVERSATION_ID ?? "").toLowerCase();

  // Antigravity injects its own env vars into subprocesses it spawns
  if (agentId || convId) return "antigravity";

  if (askpass.includes("cursor")   || ipcHook.includes("cursor"))   return "cursor";
  if (askpass.includes("windsurf") || ipcHook.includes("windsurf")) return "windsurf";
  if (term === "vscode"            || askpass.includes("code"))      return "vscode";
  if (term === "vscode"            && ipcHook.includes("gemini"))   return "gemini";
  return null;
}

/** @deprecated use detectRunningIDE() */
export const detectCurrentIDE = detectRunningIDE;

/**
 * getInstalledIDEs()
 *
 * Returns every IDE entry whose detect() returns true.
 * ALL IDEs are filesystem-checked — no env var gating.
 */
export function getInstalledIDEs() {
  return IDE_CONFIGS.filter((ide) => ide.detect());
}

// ── Format-aware config I/O ────────────────────────────────────────────────────

/**
 * readMCPConfig(filePath, configKey)
 *
 * Reads any IDE config file and returns a normalised object:
 *   { mcpServers: {}, _key: <configKey>, ...rest }
 *
 * Callers always read/write via `mcpServers` (internal alias).
 * writeMCPConfig restores the real key on disk.
 */
/**
 * stripJsonc(text)
 *
 * Strips JSONC artifacts so strict JSON.parse can handle files written by
 * VS Code and other editors that allow:
 *   - single-line comments  //
 *   - block comments         /* ... *​/
 *   - trailing commas        { "a": 1, }
 *
 * Lightweight — no npm dependency required.
 */
function stripJsonc(text) {
  // 1. Remove single-line comments (// …) — but not inside strings
  //    Naive but sufficient: VS Code config files don't embed "//" in values
  let result = text.replace(/^\s*\/\/.*$/gm, "");
  // 2. Remove block comments /* … */
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  // 3. Remove trailing commas before } or ]
  result = result.replace(/,\s*([}\]])/g, "$1");
  return result;
}

export function readMCPConfig(filePath, configKey = "mcpServers") {
  const isYaml = filePath.endsWith(".yaml") || filePath.endsWith(".yml");
  const isToml = filePath.endsWith(".toml");

  try {
    if (!fs.existsSync(filePath)) return { mcpServers: {}, _key: configKey, _isYaml: isYaml, _isToml: isToml };

    const raw = fs.readFileSync(filePath, "utf-8");
    let parsed;
    if (isToml)      parsed = toml.parse(raw) || {};
    else if (isYaml) parsed = yaml.parse(raw) || {};
    else             parsed = JSON.parse(stripJsonc(raw)) || {};

    if (!parsed[configKey]) parsed[configKey] = isYaml && configKey === "extensions" ? [] : {};

    let internalMap = {};
    if (isYaml && Array.isArray(parsed[configKey])) {
      for (const item of parsed[configKey]) {
        if (item.name) internalMap[item.name] = item;
      }
    } else {
      internalMap = { ...(parsed[configKey] ?? {}) };
    }

    return {
      ...parsed,
      mcpServers: internalMap, // unified internal alias
      _key: configKey,
      _isYaml: isYaml,
      _isToml: isToml,
    };
  } catch {
    return { mcpServers: {}, _key: configKey, _isYaml: isYaml, _isToml: isToml };
  }
}

/**
 * writeMCPConfig(filePath, config)
 *
 * Writes config back to disk using the correct key for the IDE.
 * Strips internal aliases before writing.
 */
export function writeMCPConfig(filePath, config) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const key    = config._key    ?? "mcpServers";
  const isYaml = config._isYaml ?? false;
  const isToml = config._isToml ?? false;
  const { mcpServers, _key, _isYaml, _isToml, ...rest } = config;

  let finalPayload;
  if (isYaml && key === "extensions") {
    // Convert object map back to array for Goose
    finalPayload = { ...rest, [key]: Object.values(mcpServers) };
  } else {
    finalPayload = { ...rest, [key]: mcpServers };
  }

  if (isToml) {
    // smol-toml stringify — preserves all non-MCP settings already in the file
    fs.writeFileSync(filePath, toml.stringify(finalPayload));
  } else if (isYaml) {
    fs.writeFileSync(filePath, yaml.stringify(finalPayload));
  } else {
    fs.writeFileSync(
      filePath,
      JSON.stringify(finalPayload, null, 2),
    );
  }
}

// ── MCP entry builder ──────────────────────────────────────────────────────────

/**
 * buildMCPEntry(server, username, description, price_cents)
 *
 * Returns the canonical stdio entry for an AgenticMarket MCP server.
 * IDEs that need a different schema use `ide.transformEntry(entry)`.
 */
export function buildMCPEntry(server, username, description, price_cents) {
  return {
    type:        "stdio",
    command:     "npx",
    args:        ["agenticmarket", "proxy", `${username}/${server}`],
    description: description ?? "",
    price_cents: price_cents ?? 0,
    author:      username,
    server,
    creatorUrl:  `https://agenticmarket.dev/${username}`,
    serverUrl:   `https://agenticmarket.dev/${username}/${server}`,
    installedAt: new Date().toLocaleString(),
  };
}

// ── Community server helpers ───────────────────────────────────────────────────

const COMMUNITY_FILE = path.join(AM_CONFIG_DIR, "community.json");

/**
 * loadCommunityRegistry()
 *
 * Reads ~/.agenticmarket/community.json — the local source of truth for
 * which community servers are installed, their config keys, and target IDEs.
 */
export function loadCommunityRegistry() {
  if (!fs.existsSync(COMMUNITY_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(COMMUNITY_FILE, "utf-8")); }
  catch { return {}; }
}

/**
 * saveCommunityRegistry(data)
 *
 * Persists the full community registry object to disk.
 */
export function saveCommunityRegistry(data) {
  if (!fs.existsSync(AM_CONFIG_DIR)) fs.mkdirSync(AM_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(data, null, 2));
}

/**
 * addCommunityInstall(slug, entry)
 *
 * Adds or updates a single community server record in the registry.
 * entry shape: { name, slug, configKey, author, description, installedAt, ides }
 */
export function addCommunityInstall(slug, entry) {
  const registry = loadCommunityRegistry();
  registry[slug] = entry;
  saveCommunityRegistry(registry);
}

/**
 * removeCommunityInstall(slug)
 *
 * Removes a community server record from the local registry.
 * Returns the removed entry, or null if it wasn't present.
 */
export function removeCommunityInstall(slug) {
  const registry = loadCommunityRegistry();
  const entry = registry[slug] ?? null;
  if (entry) {
    delete registry[slug];
    saveCommunityRegistry(registry);
  }
  return entry;
}

/**
 * getCommunityByConfigKey(configKey)
 *
 * Looks up a community server by the MCP config key (e.g. "fetch").
 * Returns { slug, ...entry } or null.
 */
export function getCommunityByConfigKey(configKey) {
  const registry = loadCommunityRegistry();
  for (const [slug, entry] of Object.entries(registry)) {
    if (entry.configKey === configKey) return { slug, ...entry };
  }
  return null;
}

/**
 * COMMUNITY_IDE_MAP
 *
 * Maps community_server_ide_config.ide values (from the DB) to CLI IDE_CONFIGS ids.
 * Used to match API-provided IDE configs to locally detected IDEs.
 */
export const COMMUNITY_IDE_MAP = {
  "cursor":         ["cursor-global", "cursor-project"],
  "vscode":         ["vscode-project", "vscode-global"],
  "claude-desktop": ["claude-desktop"],
  "claude-code":    ["claude-code-global", "claude-code-project"],
  "windsurf":       ["windsurf-global"],
  "gemini-cli":     ["gemini-cli-global", "gemini-cli-project"],
  "zed":            ["zed-global"],
  "cline":          ["cline-vscode"],
  "codex":          ["codex-global", "codex-project"],
  "antigravity":    ["antigravity-global", "antigravity-project"],
  "copilot":        ["copilot-global"],
  "goose":          ["goose-global"],
};

/**
 * matchIdeToConfig(cliIdeId, apiConfigs)
 *
 * Given a CLI IDE id (e.g. "cursor-global") and an array of API configs
 * (each with an `ide` field like "cursor"), returns the matching config or null.
 */
export function matchIdeToConfig(cliIdeId, apiConfigs) {
  for (const config of apiConfigs) {
    const mappedIds = COMMUNITY_IDE_MAP[config.ide] || [];
    if (mappedIds.includes(cliIdeId)) return config;
  }
  return null;
}

/**
 * parseCommunityIdeConfig(configStr)
 *
 * Parses the config JSON string stored in community_server_ide_config.config.
 * Extracts the server entry name and the MCP entry object.
 *
 * Handles all known formats:
 *   - { "mcpServers": { "name": { ... } } }      → cursor, claude, etc.
 *   - { "servers":    { "name": { ... } } }       → vscode
 *   - { "context_servers": { "name": { ... } } }  → zed
 *   - { "mcp_servers": { "name": { ... } } }      → codex
 *   - { "extensions":  [ { ... } ] }               → goose (array)
 *   - { "command": "...", "args": [...] }           → bare entry
 *
 * Returns { name: string|null, entry: object } or null on parse failure.
 */
export function parseCommunityIdeConfig(configStr) {
  try {
    const parsed = JSON.parse(configStr);

    // Try known wrapper keys (object maps)
    const wrapperKeys = ["mcpServers", "servers", "context_servers", "mcp_servers", "extensions"];
    for (const key of wrapperKeys) {
      if (parsed[key] && typeof parsed[key] === "object" && !Array.isArray(parsed[key])) {
        const entries = Object.entries(parsed[key]);
        if (entries.length > 0) {
          return { name: entries[0][0], entry: entries[0][1] };
        }
      }
      // Goose uses an array under "extensions"
      if (parsed[key] && Array.isArray(parsed[key]) && parsed[key].length > 0) {
        const first = parsed[key][0];
        return { name: first.name ?? null, entry: first };
      }
    }

    // Bare entry — has command or cmd directly
    if (parsed.command || parsed.cmd) {
      return { name: null, entry: parsed };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * buildCommunityFallbackEntry(installCommand)
 *
 * Builds a generic stdio MCP entry from an install command string
 * like "npx -y @modelcontextprotocol/server-fetch".
 *
 * Used as a fallback when no IDE-specific config is available.
 */
export function buildCommunityFallbackEntry(installCommand) {
  const parts = installCommand.trim().split(/\s+/);
  return {
    type:    "stdio",
    command: parts[0],
    args:    parts.slice(1),
  };
}