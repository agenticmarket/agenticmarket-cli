/**
 * src/config.js — manages local config + finds IDE MCP config files
 *
 * Saves to: ~/.agenticmarket/config.json
 * Reads MCP configs from: Claude Desktop, Cursor, VS Code
 *
 * ⚠️  MCP config format differs per IDE:
 *
 *  Claude Desktop / Cursor  →  { "mcpServers": { "skill": { url, headers } } }
 *  VS Code                  →  { "servers":    { "skill": { type, url, headers } } }
 *
 *  VS Code additionally requires  "type": "http"  (or "sse") on every entry.
 *  Without it the agent silently ignores the server.
 */

import fs from "fs";
import path from "path";
import os from "os";

// ── AgenticMarket config (stores API key) ─────────────

const AM_CONFIG_DIR = path.join(os.homedir(), ".agenticmarket");
const AM_CONFIG_FILE = path.join(AM_CONFIG_DIR, "config.json");

export const PROXY_BASE_URL = "https://agentic-market-proxy.shekharpachlore99.workers.dev";
// export const PROXY_BASE_URL = "http://127.0.0.1:8787";
export const API_BASE_URL = PROXY_BASE_URL;

export function saveConfig(data) {
  if (!fs.existsSync(AM_CONFIG_DIR)) {
    fs.mkdirSync(AM_CONFIG_DIR, { recursive: true });
  }
  const existing = loadConfig();
  fs.writeFileSync(
    AM_CONFIG_FILE,
    JSON.stringify({ ...existing, ...data }, null, 2),
  );
}

export function loadConfig() {
  if (!fs.existsSync(AM_CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(AM_CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function getApiKey() {
  return loadConfig().apiKey ?? null;
}

// ── IDE MCP config detection ──────────────────────────

const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";
const home = os.homedir();
const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");

/**
 * IDE config descriptors.
 *
 * `format` controls how we read/write the config file:
 *   "claude"  →  top-level key is "mcpServers"
 *   "vscode"  →  top-level key is "servers", entries need { type: "http" }
 */
export const IDE_CONFIGS = [
  {
    name: "Claude Desktop",
    icon: "🤖",
    format: "claude",
    path: isWindows
      ? path.join(appData, "Claude", "claude_desktop_config.json")
      : isMac
        ? path.join(
            home,
            "Library",
            "Application Support",
            "Claude",
            "claude_desktop_config.json",
          )
        : path.join(home, ".config", "claude", "claude_desktop_config.json"),
  },
  {
    name: "Cursor (global)",
    icon: "⚡",
    format: "claude", // Cursor uses the same schema as Claude Desktop
    path: path.join(home, ".cursor", "mcp.json"),
  },
  {
    name: "Cursor (project)",
    icon: "⚡",
    format: "claude",
    path: path.join(process.cwd(), ".cursor", "mcp.json"),
  },
  {
    name: "VS Code",
    icon: "💙",
    format: "vscode", // ← different schema!
    path: path.join(process.cwd(), ".vscode", "mcp.json"),
  },
];

// ── IDE detection ─────────────────────────────────────

export function detectCurrentIDE() {
  const askpass = (process.env.VSCODE_GIT_ASKPASS_NODE || "").toLowerCase();
  const ipcHook = (process.env.VSCODE_IPC_HOOK_CLI || "").toLowerCase();

  if (askpass.includes("cursor") || ipcHook.includes("cursor")) return "cursor";
  if (process.env.TERM_PROGRAM === "vscode" || askpass.includes("code"))
    return "vscode";
  return null;
}

export function getInstalledIDEs() {
  const currentIDE = detectCurrentIDE();

  return IDE_CONFIGS.filter((ide) => {
    if (ide.name === "VS Code") return currentIDE === "vscode";
    if (ide.name === "Cursor (project)") return currentIDE === "cursor";
    if (ide.name === "Cursor (global)") return currentIDE === "cursor";

    if (fs.existsSync(ide.path)) return true;
    const configDir = path.dirname(ide.path);
    if (fs.existsSync(configDir)) return true;

    return false;
  });
}

// ── Format-aware config I/O ───────────────────────────

/**
 * Returns the top-level servers key name for a given IDE format.
 *
 *   "claude"  →  "mcpServers"
 *   "vscode"  →  "servers"
 */
function serversKey(format) {
  return format === "vscode" ? "servers" : "mcpServers";
}

/**
 * Read an MCP config file, normalising it so callers always see:
 *   { mcpServers: {}, _raw: <original parsed JSON>, _format: "claude"|"vscode" }
 *
 * We expose a unified `mcpServers` view internally so install.js doesn't
 * need to know which key the file uses. When we write back we restore the
 * correct key via writeMCPConfig.
 */
export function readMCPConfig(filePath, format = "claude") {
  try {
    if (!fs.existsSync(filePath)) return { mcpServers: {}, _format: format };

    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    const key = serversKey(format);

    if (!parsed[key]) parsed[key] = {};

    // Return a unified view — callers always read/write via `mcpServers`
    return {
      ...parsed,
      mcpServers: parsed[key], // alias
      _format: format,
      _key: key,
    };
  } catch {
    return { mcpServers: {}, _format: format, _key: serversKey(format) };
  }
}

/**
 * Write an MCP config back to disk using the correct key for the IDE format.
 * Strips our internal `_format` / `_key` / `mcpServers` alias before writing.
 */
export function writeMCPConfig(filePath, config) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const format = config._format ?? "claude";
  const key = config._key ?? serversKey(format);

  // Build clean output — use the real key, drop our internal aliases
  const { mcpServers, _format, _key, ...rest } = config;
  const output = {
    ...rest,
    [key]: mcpServers, // write back under the correct key
  };

  fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
}

// ── MCP entry builder ─────────────────────────────────

/**
 * Build the mcpServers entry object for a skill.
 *
 * VS Code requires `"type": "http"` — without it the Copilot agent won't
 * discover the server even if the URL is correct.
 *
 * Claude Desktop / Cursor don't use `type` but tolerate its presence,
 * so we include it universally for simplicity.
 */
export function buildMCPEntry(skill, username, apiKey , description , price_cents) {
  return {
    type: "http",          // Required by VS Code; harmless for others
    url: `${PROXY_BASE_URL}/mcp/${username}/${skill}`,
    headers: {
      "x-api-key": apiKey,
    },
    description: description,
    price_cents: price_cents,
    // Metadata — not part of the MCP spec, used by agenticmarket to detect
    // "already installed by same author" without re-fetching the marketplace
    author: username,
    skill: skill,
    installedAt: new Date().toLocaleString(),
  };
}