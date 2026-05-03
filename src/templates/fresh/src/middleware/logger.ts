import process from "node:process";
import type { MiddlewareHandler } from "hono";

/**
 * Dev request logger — prints every request like Next.js dev mode.
 *
 * Only active when NODE_ENV !== "production".
 *
 * Output:
 *   [14:32:01] ← POST /mcp 200 12ms
 *   [14:32:02] ← GET  /health 200 1ms
 *   [14:32:05] ← POST /mcp 401 0ms
 */
export function devLogger(): MiddlewareHandler {
  const isDev = process.env.NODE_ENV !== "production";

  return async (c, next) => {
    if (!isDev) return next();

    const start = performance.now();
    await next();
    const duration = Math.round(performance.now() - start);

    const method = c.req.method.padEnd(6);
    const path = c.req.path;
    const status = c.res.status;

    // Color by status: green=2xx, yellow=4xx, red=5xx
    const statusColor =
      status < 300 ? "\x1b[32m" :
      status < 500 ? "\x1b[33m" :
      "\x1b[31m";
    const reset = "\x1b[0m";
    const dim = "\x1b[2m";

    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;

    console.log(
      `  ${dim}[${time}] ←${reset} ${method} ${path} ${statusColor}${status}${reset} ${dim}${duration}ms${reset}`,
    );
  };
}
