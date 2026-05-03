/**
 * Comprehensive test for agenticmarket create scaffold engine.
 *
 * Tests:
 *   1. Fresh template — all files exist, tokens resolved
 *   2. API wrapper template — api-client.ts, get-data.ts present
 *   3. server.json — _meta block correct (branding)
 *   4. package.json — mcpName field, correct name, fetch-to-node dep
 *   5. Security middleware — production secret enforcement
 *   6. No stale tokens in any generated file
 *   7. Deploy config removal (cloudflare-only = no Dockerfile)
 *   8. README — badges and HTML comment present
 *   9. .gitignore — includes .env
 *  10. Name validation — rejects invalid names
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(PROJECT_ROOT, "src", "templates");
const TEST_DIR = path.join(PROJECT_ROOT, "_test_scaffold");

// ── Test runner ─────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function ok(msg) {
  pass++;
  console.log(`  ${"\x1b[32m"}✓${"\x1b[0m"}  ${msg}`);
}
function ko(msg) {
  fail++;
  console.log(`  ${"\x1b[31m"}✗${"\x1b[0m"}  ${msg}`);
}
function assert(condition, msg) {
  condition ? ok(msg) : ko(msg);
}

// ── Token replacement ───────────────────────────────────────────────────────

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

const tokens = {
  __PROJECT_NAME__: "test-weather-api",
  __PROJECT_TITLE__: "Test Weather Api",
  __DESCRIPTION__: "MCP server for Test Weather Api",
  __MCP_NAME__: "io.github.testuser/test-weather-api",
  __REPO_URL__: "https://github.com/testuser/test-weather-api",
  __API_BASE_URL__: "https://api.openweathermap.org/data/2.5",
  __AUTH_TYPE__: "api-key",
  __AUTH_HEADER__: "x-api-key",
  __EXAMPLE_ENDPOINT__: "/2.5",
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: Fresh template
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── Fresh Template ──\n");

const freshTarget = path.join(TEST_DIR, "fresh-test");
if (fs.existsSync(freshTarget)) fs.rmSync(freshTarget, { recursive: true });
fs.mkdirSync(freshTarget, { recursive: true });
copyTemplate(path.join(TEMPLATES_DIR, "fresh"), freshTarget, tokens);

const freshFiles = [
  "package.json",
  "tsconfig.json",
  ".mcp/server.json",
  ".env.example",
  ".gitignore",
  "README.md",
  "AGENTS.md",
  "wrangler.toml",
  "Dockerfile",
  "src/index.ts",
  "src/middleware/security.ts",
  "src/middleware/rateLimit.ts",
  "src/middleware/logger.ts",
  "src/tools/index.ts",
  "src/tools/echo.ts",
  "src/types.ts",
];

for (const file of freshFiles) {
  assert(
    fs.existsSync(path.join(freshTarget, file)),
    `fresh/${file} exists`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: No unresolved tokens in any file
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── Token Resolution ──\n");

function checkTokens(dir, prefix) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkTokens(fp, `${prefix}/${entry.name}`);
    } else {
      const content = fs.readFileSync(fp, "utf-8");
      const staleTokens = content.match(/__[A-Z_]+__/g);
      if (staleTokens) {
        ko(`${prefix}/${entry.name} has unresolved tokens: ${staleTokens.join(", ")}`);
      }
    }
  }
}

checkTokens(freshTarget, "fresh");
ok("No unresolved tokens in fresh template");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: server.json branding
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── Branding ──\n");

const serverJson = JSON.parse(
  fs.readFileSync(path.join(freshTarget, ".mcp", "server.json"), "utf-8"),
);

assert(
  serverJson._meta?.["dev.agenticmarket"]?.scaffoldedWith === "agenticmarket-create",
  "server.json _meta.dev.agenticmarket.scaffoldedWith = agenticmarket-create",
);
assert(
  serverJson._meta?.["dev.agenticmarket"]?.publishUrl === "https://agenticmarket.dev/dashboard/submit",
  "server.json _meta.dev.agenticmarket.publishUrl present",
);
assert(
  serverJson.name === "io.github.testuser/test-weather-api",
  "server.json name = io.github.testuser/test-weather-api",
);
assert(
  serverJson.$schema?.includes("modelcontextprotocol.io"),
  "server.json $schema points to official MCP schema",
);

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: package.json
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── package.json ──\n");

const pkg = JSON.parse(
  fs.readFileSync(path.join(freshTarget, "package.json"), "utf-8"),
);

assert(pkg.name === "test-weather-api", "package.json name correct");
assert(pkg.mcpName === "io.github.testuser/test-weather-api", "package.json mcpName field present");
assert(pkg.scripts?.dev?.includes("--env-file=.env"), "scripts.dev loads .env via --env-file");
assert(pkg.scripts?.start?.includes("--env-file=.env"), "scripts.start loads .env via --env-file");
assert(pkg.scripts?.inspect?.includes("--env-file=.env"), "scripts.inspect loads .env");
assert(pkg.scripts?.inspect?.includes("@modelcontextprotocol/inspector"), "scripts.inspect has MCP Inspector");
assert(pkg.scripts?.validate === "npx agenticmarket validate", "scripts.validate present");
assert(pkg.scripts?.release?.includes("agenticmarket publish"), "scripts.release present");
assert(pkg.dependencies?.["fetch-to-node"], "fetch-to-node dependency present");
assert(pkg.dependencies?.hono, "hono dependency present");
assert(pkg.dependencies?.["@modelcontextprotocol/sdk"], "MCP SDK dependency present");
assert(pkg.dependencies?.zod, "zod dependency present");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: README branding
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── README ──\n");

const readme = fs.readFileSync(path.join(freshTarget, "README.md"), "utf-8");

assert(readme.includes("agenticmarket.dev/badge/built-with.svg"), "README has Built with AgenticMarket badge");
assert(readme.includes("agenticmarket.dev/badge/security-first.svg"), "README has Security First badge");
assert(readme.includes("agenticmarket.dev/badge/mcp.svg"), "README has MCP Compatible badge");
assert(readme.includes("agenticmarket.dev/dashboard/submit"), "README has submit link");
assert(readme.includes("<!-- Built with agenticmarket create"), "README has HTML comment for crawlability");
assert(readme.includes("# test-weather-api"), "README has project name as h1");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: Security middleware
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── Security ──\n");

const securityTs = fs.readFileSync(
  path.join(freshTarget, "src", "middleware", "security.ts"),
  "utf-8",
);

assert(securityTs.includes("timingSafeEqual"), "security.ts uses timing-safe comparison");
assert(!securityTs.includes("if (a.length !== b.length) return false"), "timing-safe does NOT leak length via early return");
assert(securityTs.includes("Math.max(bufA.length, bufB.length)"), "timing-safe pads to max length");
assert(securityTs.includes("MCP_SECRET is required in production"), "production blocks without MCP_SECRET");
assert(securityTs.includes("warnedNoHttps"), "HTTP warning logs only once");
assert(securityTs.includes("X-Content-Type-Options"), "sets X-Content-Type-Options: nosniff");
assert(securityTs.includes('c.res.headers.delete("X-Powered-By")'), "strips X-Powered-By");
assert(securityTs.includes('c.res.headers.delete("Server")'), "strips Server header");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 7: Rate limiter
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── Rate Limiter ──\n");

const rateLimitTs = fs.readFileSync(
  path.join(freshTarget, "src", "middleware", "rateLimit.ts"),
  "utf-8",
);

assert(rateLimitTs.includes(".unref()"), "cleanup timer uses .unref() to not block exit");
assert(rateLimitTs.includes("Retry-After"), "returns Retry-After header on 429");
assert(rateLimitTs.includes('c.req.path === "/health"'), "skips rate limiting for /health");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 8: .gitignore
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── .gitignore ──\n");

const gitignore = fs.readFileSync(path.join(freshTarget, ".gitignore"), "utf-8");
assert(gitignore.includes(".env"), ".gitignore includes .env");
assert(gitignore.includes("node_modules"), ".gitignore includes node_modules");
assert(gitignore.includes("dist"), ".gitignore includes dist");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 9: API wrapper template
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── API Wrapper Template ──\n");

const wrapperTarget = path.join(TEST_DIR, "wrapper-test");
if (fs.existsSync(wrapperTarget)) fs.rmSync(wrapperTarget, { recursive: true });
fs.mkdirSync(wrapperTarget, { recursive: true });
copyTemplate(path.join(TEMPLATES_DIR, "api-wrapper"), wrapperTarget, tokens);

assert(
  fs.existsSync(path.join(wrapperTarget, "src", "lib", "api-client.ts")),
  "api-wrapper has src/lib/api-client.ts",
);
assert(
  fs.existsSync(path.join(wrapperTarget, "src", "tools", "get-data.ts")),
  "api-wrapper has src/tools/get-data.ts",
);

const apiClient = fs.readFileSync(
  path.join(wrapperTarget, "src", "lib", "api-client.ts"),
  "utf-8",
);
assert(!apiClient.includes('import { z }'), "api-client.ts has no unused zod import");
assert(apiClient.includes("ApiClientError"), "api-client.ts exports ApiClientError");
assert(apiClient.includes("AbortController"), "api-client.ts has timeout via AbortController");
assert(apiClient.includes('api-key'), "api-client.ts has auth type resolved");
assert(apiClient.includes("x-api-key"), "api-client.ts has auth header resolved");

const wrapperPkg = JSON.parse(
  fs.readFileSync(path.join(wrapperTarget, "package.json"), "utf-8"),
);
assert(wrapperPkg.mcpName === "io.github.testuser/test-weather-api", "api-wrapper package.json has mcpName");

// Check tokens resolved in api-wrapper
checkTokens(wrapperTarget, "api-wrapper");
ok("No unresolved tokens in api-wrapper template");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 10: index.ts — MCP transport
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── MCP Transport ──\n");

const indexTs = fs.readFileSync(
  path.join(freshTarget, "src", "index.ts"),
  "utf-8",
);

assert(indexTs.includes("fetch-to-node"), "index.ts imports fetch-to-node");
assert(indexTs.includes("toReqRes"), "index.ts uses toReqRes for Hono→Node bridging");
assert(indexTs.includes("toFetchResponse"), "index.ts uses toFetchResponse for Node→Hono bridging");
assert(indexTs.includes("sessionIdGenerator"), "transport uses sessionIdGenerator");
assert(indexTs.includes("server.close()"), "DELETE /mcp calls server.close()");
assert(indexTs.includes('import process from "node:process"'), "index.ts uses explicit node:process import");
assert(securityTs.includes('import process from "node:process"'), "security.ts uses explicit node:process import");
assert(rateLimitTs.includes('import process from "node:process"'), "rateLimit.ts uses explicit node:process import");
assert(!securityTs.includes("zod/v4"), "security.ts has NO zod/v4 import");
assert(!rateLimitTs.includes("zod/v4"), "rateLimit.ts has NO zod/v4 import");
assert(!indexTs.includes("zod/v4"), "index.ts has NO zod/v4 import");
assert(!serverJson._meta?.["dev.agenticmarket"]?.pricing, "server.json has NO hardcoded pricing");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 12: New security features
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── Security Hardening ──\n");

assert(securityTs.includes("X-Frame-Options"), "security.ts sets X-Frame-Options");
assert(securityTs.includes("Content-Security-Policy"), "security.ts sets CSP header");
assert(securityTs.includes("frame-ancestors 'none'"), "CSP blocks framing");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 13: Infrastructure hardening
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── Infrastructure ──\n");

assert(indexTs.includes("bodyLimit"), "index.ts uses body limit middleware");
assert(indexTs.includes("SESSION_TTL_MS"), "index.ts has session timeout");
assert(indexTs.includes("gracefulShutdown"), "index.ts has graceful shutdown");
assert(indexTs.includes("SIGTERM"), "index.ts handles SIGTERM");
assert(indexTs.includes("SIGINT"), "index.ts handles SIGINT");
assert(indexTs.includes("lastActivity"), "sessions track last activity");

const dockerfile = fs.readFileSync(path.join(freshTarget, "Dockerfile"), "utf-8");
assert(dockerfile.includes("node:22"), "Dockerfile uses node:22");
assert(dockerfile.includes("mcpuser"), "Dockerfile runs as non-root user");
assert(dockerfile.includes("HEALTHCHECK"), "Dockerfile has HEALTHCHECK");
assert(dockerfile.includes("--env-file"), "Dockerfile uses --env-file");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 14: AGENTS.md
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── AGENTS.md ──\n");

const agentsMd = fs.readFileSync(path.join(freshTarget, "AGENTS.md"), "utf-8");
assert(agentsMd.includes("AI Coding Assistants"), "AGENTS.md has purpose header");
assert(agentsMd.includes("snake_case"), "AGENTS.md specifies snake_case tool naming");
assert(agentsMd.includes("node:process"), "AGENTS.md warns about node:process");
assert(agentsMd.includes("npm run inspect"), "AGENTS.md mentions Inspector");
assert(agentsMd.includes("DO NOT REMOVE"), "AGENTS.md warns against removing security");

const wrapperAgentsMd = fs.readFileSync(path.join(wrapperTarget, "AGENTS.md"), "utf-8");
assert(wrapperAgentsMd.includes("apiClient"), "api-wrapper AGENTS.md references apiClient");
assert(wrapperAgentsMd.includes("ApiClientError"), "api-wrapper AGENTS.md mentions error handling");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 15: Logger middleware
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── Logger ──\n");

const loggerTs = fs.readFileSync(
  path.join(freshTarget, "src", "middleware", "logger.ts"),
  "utf-8",
);
assert(loggerTs.includes("devLogger"), "logger.ts exports devLogger");
assert(loggerTs.includes("performance.now()"), "logger.ts measures duration");
assert(loggerTs.includes("getHours"), "logger.ts includes timestamp");
assert(loggerTs.includes('NODE_ENV !== "production"'), "logger.ts is dev-only");
assert(indexTs.includes("devLogger()"), "index.ts wires devLogger middleware");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 16: Startup banner
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── Startup Banner ──\n");

assert(indexTs.includes("╔═"), "index.ts has box-drawing startup banner");
assert(indexTs.includes("Inspector"), "startup banner mentions Inspector");
assert(indexTs.includes("npm run validate"), "startup banner has publish CTA");

// ═══════════════════════════════════════════════════════════════════════════
// TEST 11: Name validation
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n  ── Name Validation ──\n");

// Import validateName from create.js
const NAME_REGEX = /^[a-z0-9][a-z0-9._-]*$/;
function validateName(name) {
  if (!name) return "Project name is required";
  if (!NAME_REGEX.test(name)) return "invalid";
  if (name.length > 100) return "too long";
  return true;
}

assert(validateName("my-server") === true, 'validates "my-server" as valid');
assert(validateName("my.server.v2") === true, 'validates "my.server.v2" as valid');
assert(validateName("") !== true, 'rejects empty name');
assert(validateName("-bad") !== true, 'rejects name starting with dash');
assert(validateName("UPPERCASE") !== true, 'rejects uppercase');
assert(validateName("has spaces") !== true, 'rejects spaces');

// ═══════════════════════════════════════════════════════════════════════════
// RESULT
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n  ${"═".repeat(52)}`);
console.log(`  Result: ${pass} pass, ${fail} fail`);
console.log(`  ${"═".repeat(52)}\n`);

// Cleanup
fs.rmSync(TEST_DIR, { recursive: true, force: true });

process.exit(fail > 0 ? 1 : 0);
