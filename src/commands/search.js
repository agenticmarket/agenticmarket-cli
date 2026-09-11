/**
 * src/commands/search.js — AgenticMarket search
 *
 * agenticmarket search <query> [--limit N] [--json]
 * agenticmarket discover              — curated featured
 *
 * Queries live MCP server API: GET /api/servers?search= & GET /api/servers/featured
 * No auth required. 1 call, no proxy.
 */

import chalk from "chalk";
import ora from "ora";
import { MARKETPLACE_API_BASE_URL } from "../config.js";

const box = (t) => {
  const pad = "═".repeat(52);
  console.log(chalk.cyan.bold(`╔${pad}╗`));
  console.log(chalk.cyan.bold(`║  ${t.padEnd(50)}║`));
  console.log(chalk.cyan.bold(`╚${pad}╝`));
};
const ok = (m) => console.log(`  ${chalk.green("✓")} ${m}`);
const err = (m) => console.log(`  ${chalk.red("✗")} ${m}`);
const dim = (m) => console.log(`  ${chalk.dim(m)}`);
const gap = () => console.log("");

function fmtPrice(cents) {
  if (!cents || cents === 0) return chalk.green("free");
  return chalk.yellow(`$${(cents / 100).toFixed(2)}`);
}

function normalizeSkills(json) {
  // API returns { skills: [...] } or { data: [...] }
  if (Array.isArray(json.skills)) return json.skills;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json)) return json;
  return [];
}

async function fetchSkills({ search = "", limit = 10, featured = false } = {}) {
  const url = new URL(`${MARKETPLACE_API_BASE_URL}/servers`);
  if (search) url.searchParams.set("q", search);
  if (limit) url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "ranked");
  const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (!contentType.includes("application/json")) {
    throw new Error("Marketplace server catalog is unavailable at /api/servers; deploy the public server API before using search");
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("Marketplace server catalog returned invalid JSON");
  }
  let items = normalizeSkills(json);
  // client-side filter if API ignored search (server returns all 40)
  if (search && items.length) {
    const q = search.toLowerCase();
    const filtered = items.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        (s.creator && s.creator.toLowerCase().includes(q)) ||
        (s.categorgy && s.categorgy.toLowerCase().includes(q))
    );
    items = filtered; // 0 is valid — no fallback to unfiltered
  }
  return items.slice(0, limit);
}

export async function searchCmd(query, opts = {}) {
  let limit = 10;
  if (opts.limit != null) {
    const n = Number(opts.limit);
    if (!Number.isFinite(n) || n < 1) limit = 10;
    else limit = Math.min(Math.max(Math.trunc(n), 1), 20);
  }
  const asJson = opts.json || false;
  const isDiscover = !query || query.trim() === "";

  let spinner = null;
  if (!asJson) spinner = ora(isDiscover ? "Discovering featured servers..." : `Searching for "${query}"...`).start();
  let items = [];
  try {
    items = await fetchSkills({ search: query, limit, featured: isDiscover });
    if (spinner) spinner.stop();
  } catch (e) {
    if (spinner) spinner.fail(`Search failed: ${e.message}`);
    else console.error(`Search failed: ${e.message}`);
    console.log(chalk.dim(`  API: ${MARKETPLACE_API_BASE_URL}/servers`));
    process.exit(1);
  }

  if (asJson) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  if (!items.length) {
    gap();
    err(isDiscover ? "No featured servers found." : `No results for "${query}"`);
    dim(`  Try: agenticmarket search web   or   agenticmarket discover`);
    gap();
    return;
  }

  gap();
  box(isDiscover ? `Featured — ${items.length} servers` : `Search: "${query}" — ${items.length} results`);
  gap();

  items.forEach((s, i) => {
    const name = `${s.creator ? s.creator + "/" : ""}${s.name}`;
    const price = fmtPrice(s.priceCents);
    const installs = s.totalInstall != null ? `${s.totalInstall} installs` : "";
    const calls = s.totalCall != null ? `${s.totalCall} calls` : "";
    const meta = [price, installs, calls].filter(Boolean).join(chalk.dim(" · "));
    const verified = s.isverified ? chalk.green(" ✓ verified") : "";
    const health = s.healthStatus ? chalk.dim(` [${s.healthStatus}]`) : "";

    console.log(`  ${chalk.bold.white(`${i + 1}.`)} ${chalk.cyan(name)}${verified}${health} ${chalk.dim("·")} ${meta}`);
    if (s.description) console.log(`     ${chalk.dim(s.description.slice(0, 120))}`);
    console.log(`     ${chalk.dim("$")} ${chalk.white(`agenticmarket install ${name}`)}`);
    gap();
  });

  dim(`  Tip: agenticmarket install <name>  → 1-command install to ${chalk.white("Andromity top")} + 13 IDEs`);
  if (!isDiscover) dim(`  Also: agenticmarket discover  → curated featured`);
  gap();
}

export async function discoverCmd(opts = {}) {
  return searchCmd("", opts);
}
