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

  // ── Codex ───────────────────────────────────────────────────────────────────
  {
    id:   "codex-global",
    name: "Codex (global)",
    icon: "🧠",
    scope: "global",
    runningIDEId: null,
    configPath: path.join(
      process.env.CODEX_HOME ?? path.join(home, ".codex"),
      "config.json",
    ),
    configKey: "mcpServers",
    detect() {
      return fs.existsSync(
        process.env.CODEX_HOME ?? path.join(home, ".codex"),
      );
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
export function readMCPConfig(filePath, configKey = "mcpServers") {
  const isYaml = filePath.endsWith(".yaml") || filePath.endsWith(".yml");

  try {
    if (!fs.existsSync(filePath)) return { mcpServers: {}, _key: configKey, _isYaml: isYaml };

    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = isYaml ? yaml.parse(raw) || {} : JSON.parse(raw) || {};

    if (!parsed[configKey]) parsed[configKey] = isYaml && configKey === "extensions" ? [] : {};

    let internalMap = {};
    if (isYaml && Array.isArray(parsed[configKey])) {
      for (const item of parsed[configKey]) {
        if (item.name) internalMap[item.name] = item;
      }
    } else {
      internalMap = parsed[configKey];
    }

    return {
      ...parsed,
      mcpServers: internalMap, // unified internal alias
      _key: configKey,
      _isYaml: isYaml,
    };
  } catch {
    return { mcpServers: {}, _key: configKey, _isYaml: isYaml };
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

  const key = config._key ?? "mcpServers";
  const isYaml = config._isYaml ?? false;
  const { mcpServers, _key, _isYaml, ...rest } = config;

  let finalPayload;
  if (isYaml && key === "extensions") {
    // Convert object map back to array for Goose
    finalPayload = { ...rest, [key]: Object.values(mcpServers) };
  } else {
    finalPayload = { ...rest, [key]: mcpServers };
  }

  if (isYaml) {
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