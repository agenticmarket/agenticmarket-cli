import type { MiddlewareHandler } from "hono";
import process from "node:process";

/**
 * Security middleware — ships with every AgenticMarket-scaffolded server.
 *
 * Layers:
 *   1. HTTPS enforcement (production only)
 *   2. Secret header validation (timing-safe)
 *   3. Server header stripping + request ID
 *   4. CORS — strict by default
 */
export function securityMiddleware(): MiddlewareHandler {
  const isDev = process.env.NODE_ENV !== "production";
  const secret = process.env.MCP_SECRET ?? "";
  const headerName = process.env.MCP_SECRET_HEADER ?? "x-mcp-secret";

  // Parse allowed origins from env (comma-separated)
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Track warnings to avoid spamming logs
  let warnedNoHttps = false;
  let warnedNoSecret = false;

  return async (c, next) => {
    // ── Layer 1: HTTPS Enforcement ───────────────────────────────────────────
    const proto = c.req.header("x-forwarded-proto") ?? "http";
    if (!isDev && proto !== "https") {
      return c.json(
        { error: "HTTPS required in production" },
        { status: 400 },
      );
    }
    if (isDev && proto !== "https" && !warnedNoHttps) {
      console.warn("  ⚠ Request over HTTP — use HTTPS in production");
      warnedNoHttps = true;
    }

    // ── Layer 2: Secret Header Validation ────────────────────────────────────
    // Skip for health endpoint and CORS preflight (OPTIONS)
    if (c.req.path !== "/health" && c.req.method !== "OPTIONS") {
      if (!secret && !isDev) {
        // PRODUCTION without a secret = hard block
        return c.json(
          { error: "Server misconfigured: MCP_SECRET is required in production" },
          { status: 500 },
        );
      }
      if (!secret && isDev && !warnedNoSecret) {
        console.warn(
          "  ⚠ MCP_SECRET not set — server is unprotected. Set it in .env",
        );
        warnedNoSecret = true;
      }
      if (secret) {
        const provided = c.req.header(headerName) ?? "";
        if (!timingSafeEqual(secret, provided)) {
          return c.json({ error: "Unauthorized" }, { status: 401 });
        }
      }
    }

    // ── Layer 3: Header Stripping + Request ID ───────────────────────────────
    const requestId = crypto.randomUUID();
    c.header("X-Request-ID", requestId);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    // Strip revealing headers (set by downstream or framework)
    c.res.headers.delete("X-Powered-By");
    c.res.headers.delete("Server");

    // ── Layer 4: CORS ────────────────────────────────────────────────────────
    const origin = c.req.header("Origin") ?? "";

    if (isDev && origin.startsWith("http://localhost")) {
      c.header("Access-Control-Allow-Origin", origin);
    } else if (allowedOrigins.includes(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
    }

    c.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    c.header(
      "Access-Control-Allow-Headers",
      `Content-Type, ${headerName}, mcp-session-id`,
    );

    // Preflight
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    await next();
  };
}

// ── Timing-safe string comparison ────────────────────────────────────────────
// Constant-time: always compares full length regardless of mismatch position.
// Pads shorter string to avoid length-based timing oracle.

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  // Pad to equal length so iteration time is constant
  const maxLen = Math.max(bufA.length, bufB.length);
  let result = bufA.length ^ bufB.length; // non-zero if lengths differ

  for (let i = 0; i < maxLen; i++) {
    result |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }

  return result === 0;
}
