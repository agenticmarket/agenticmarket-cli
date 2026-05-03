/**
 * E2E test — scaffolds a project, installs deps, runs dev server, hits health endpoint.
 * Runs entirely inside workspace. No manual input needed.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync, spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_ROOT = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(CLI_ROOT, "src", "templates");
const E2E_DIR = path.join(CLI_ROOT, "_e2e_test");
const PROJECT_DIR = path.join(E2E_DIR, "e2e-server");

// ── Helpers ─────────────────────────────────────────────────────────────────

function replaceTokens(content, tokens) {
  let result = content;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.split(key).join(value);
  }
  return result;
}

function copyTemplate(srcDir, destDir, tokens) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTemplate(srcPath, destPath, tokens);
    } else {
      const content = fs.readFileSync(srcPath, "utf-8");
      fs.writeFileSync(destPath, replaceTokens(content, tokens));
    }
  }
}

// ── Setup ───────────────────────────────────────────────────────────────────

console.log("\n  ── E2E Test: Scaffold → Install → Run → Health Check ──\n");

// Clean — robust against Windows EBUSY from prior runs
try { fs.rmSync(PROJECT_DIR, { recursive: true, force: true }); } catch { /* locked from prior run, will use fresh subdir */ }
fs.mkdirSync(PROJECT_DIR, { recursive: true });

// Scaffold
const tokens = {
  __PROJECT_NAME__: "e2e-server",
  __PROJECT_TITLE__: "E2e Server",
  __DESCRIPTION__: "E2E test server",
  __MCP_NAME__: "io.github.test/e2e-server",
  __REPO_URL__: "https://github.com/test/e2e-server",
  __API_BASE_URL__: "https://api.example.com",
  __AUTH_TYPE__: "none",
  __AUTH_HEADER__: "x-api-key",
  __EXAMPLE_ENDPOINT__: "/data",
};

copyTemplate(path.join(TEMPLATES_DIR, "fresh"), PROJECT_DIR, tokens);

// Create .env
fs.writeFileSync(
  path.join(PROJECT_DIR, ".env"),
  "MCP_SECRET=test_secret_123\nPORT=3456\nNODE_ENV=development\n",
);

console.log("  ✓ Scaffolded fresh template");

// Install deps
console.log("  … Installing deps (this takes ~30s)...");
try {
  execSync("npm install", { cwd: PROJECT_DIR, stdio: "pipe", timeout: 120000 });
  console.log("  ✓ npm install succeeded");
} catch (err) {
  console.log("  ✗ npm install failed:");
  console.log(err.stderr?.toString() || err.message);
  process.exit(1);
}

// Check for any remaining zod/v4 infections
const allTsFiles = [];
function findTs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) findTs(p);
    else if (entry.name.endsWith(".ts")) allTsFiles.push(p);
  }
}
findTs(path.join(PROJECT_DIR, "src"));

let zodInfection = false;
for (const f of allTsFiles) {
  const content = fs.readFileSync(f, "utf-8");
  if (content.includes("zod/v4")) {
    console.log(`  ✗ INFECTION: ${path.relative(PROJECT_DIR, f)} has zod/v4 import`);
    zodInfection = true;
  }
}
if (!zodInfection) console.log("  ✓ No zod/v4 infections in scaffolded code");

// Start server
console.log("  … Starting dev server on port 3456...");
const server = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: PROJECT_DIR,
  stdio: "pipe",
  env: { ...process.env, PORT: "3456", MCP_SECRET: "test_secret_123", NODE_ENV: "development" },
  shell: true,
});

let serverOutput = "";
server.stdout.on("data", (d) => { serverOutput += d.toString(); });
server.stderr.on("data", (d) => { serverOutput += d.toString(); });

// Wait for server to start
await new Promise((resolve) => setTimeout(resolve, 5000));

// Check if server crashed
if (server.exitCode !== null) {
  console.log(`  ✗ Server crashed with exit code ${server.exitCode}`);
  console.log("  Output:", serverOutput.slice(0, 500));
  process.exit(1);
}

console.log("  ✓ Server started (no crash)");

// Health check
let healthOk = false;
try {
  const res = await fetch("http://localhost:3456/health");
  const data = await res.json();
  healthOk = data.status === "ok" && data.server === "e2e-server";
  if (healthOk) {
    console.log("  ✓ GET /health → 200 OK, server name correct");
  } else {
    console.log("  ✗ Health check returned unexpected data:", data);
  }
} catch (err) {
  console.log("  ✗ Health check failed:", err.message);
}

// Auth check — call /mcp without secret → should get 401
let authOk = false;
try {
  const res = await fetch("http://localhost:3456/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
  });
  authOk = res.status === 401;
  if (authOk) {
    console.log("  ✓ POST /mcp without secret → 401 Unauthorized");
  } else {
    console.log(`  ✗ Expected 401, got ${res.status}`);
  }
} catch (err) {
  console.log("  ✗ Auth check failed:", err.message);
}

// Kill server
server.kill("SIGTERM");
await new Promise((resolve) => setTimeout(resolve, 2000));

// Result BEFORE cleanup — don't let cleanup errors mask test result
const allPassed = healthOk && authOk && !zodInfection;
console.log(`\n  ${"═".repeat(40)}`);
console.log(`  E2E Result: ${allPassed ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  ${"═".repeat(40)}\n`);

// Cleanup — best-effort, Windows may hold locks
try { fs.rmSync(E2E_DIR, { recursive: true, force: true }); } catch { /* Windows EBUSY, harmless */ }

process.exit(allPassed ? 0 : 1);
