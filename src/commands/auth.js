/**
 * src/commands/auth.js
 *
 * agenticmarket auth <api-key>
 *
 * Validates the API key against your worker,
 * then saves it locally to ~/.agenticmarket/config.json
 */

import chalk from "chalk";
import ora from "ora";
import { saveConfig, API_BASE_URL } from "../config.js";

export async function auth(apiKey) {
  console.log("");

  // ── Header box ──────────────────────────────────────────
  const pad = "═".repeat(52);
  console.log(chalk.cyan.bold(`╔${pad}╗`));
  console.log(chalk.cyan.bold(`║  ${"Authenticating".padEnd(50)}║`));
  console.log(chalk.cyan.bold(`╚${pad}╝`));
  console.log("");

  // ── Format check ────────────────────────────────────────
  if (!apiKey.startsWith("am_")) {
    console.log(`  ${chalk.red("✗")}  ${chalk.red("Invalid API key format")}`);
    console.log("");
    console.log(chalk.dim(`  ${"─".repeat(48)}`));
    console.log(
      `  ${chalk.dim("Keys look like:")}  ${chalk.yellow("am_live_xxxxxxxxxxxx")}`,
    );
    console.log(
      `  ${chalk.dim("Get yours at:")}    ${chalk.cyan.underline("https://agenticmarket.dev")}`,
    );
    console.log("");
    process.exit(1);
  }

  // Show masked key while verifying
  const maskedKey = apiKey.slice(0, 10) + "••••••••" + apiKey.slice(-4);
  console.log(`  ${chalk.dim("Key")}  ${chalk.dim(maskedKey)}`);
  console.log("");

  const spinner = ora({
    text: chalk.dim("Verifying with AgenticMarket..."),
    color: "cyan",
    spinner: "dots",
  }).start();

  try {
    const res = await fetch(`${API_BASE_URL}/balance`, {
      headers: { "x-api-key": apiKey },
    });

    // ── Auth failures ──────────────────────────────────────
    if (res.status === 401) {
      spinner.stop();
      console.log(
        `  ${chalk.red("✗")}  ${chalk.red("API key not recognised")}`,
      );
      console.log("");
      console.log(chalk.dim(`  ${"─".repeat(48)}`));
      console.log(
        `  ${chalk.dim("Double-check your key at")}  ${chalk.cyan.underline("https://agenticmarket.dev/dashboard/api-keys")}`,
      );
      console.log("");
      process.exit(1);
    }

    if (!res.ok) {
      spinner.stop();
      console.log(
        `  ${chalk.red("✗")}  ${chalk.red("Could not reach AgenticMarket")}  ${chalk.dim(`(HTTP ${res.status})`)}`,
      );
      console.log("");
      process.exit(1);
    }

    const data = await res.json();
    const currentDate = new Date().toISOString();

    saveConfig({
      apiKey,
      username: data.username,
      url: API_BASE_URL,
      lastAuthAt: currentDate,
    });

    spinner.stop();

    // ── Success ────────────────────────────────────────────
    console.log(
      `  ${chalk.green("✓")}  ${chalk.green.bold("Authenticated successfully")}`,
    );
    console.log("");
    console.log(chalk.dim(`  ${"─".repeat(48)}`));
    console.log("");

    // Account details
    console.log(
      `  ${chalk.dim("Username".padEnd(12))}${chalk.white.bold(data.username)}`,
    );
    console.log(
      `  ${chalk.dim("User ID".padEnd(12))}${chalk.dim(data.user_id)}`,
    );
    console.log(
      `  ${chalk.dim("Balance".padEnd(12))}${chalk.green.bold("$" + data.balance)}`,
    );

    // Low balance nudge
    if (parseFloat(data.balance) < 1.0) {
      console.log("");
      console.log(
        `  ${chalk.yellow("⚠")}  ${chalk.yellow("Low balance")} — top up at ${chalk.cyan.underline("https://agenticmarket.dev/topup")}`,
      );
    }

    console.log("");
    console.log(chalk.dim(`  ${"─".repeat(48)}`));
    console.log("");
    console.log(`  ${chalk.dim("Next step — install a skill:")}`);
    console.log(
      `  ${chalk.cyan("agenticmarket install")} ${chalk.yellow("<username>/<skill>")}`,
    );
    console.log("");
  } catch {
    spinner.stop();
    console.log(`  ${chalk.red("✗")}  ${chalk.red("Network error")}`);
    console.log("");
    console.log(chalk.dim(`  ${"─".repeat(48)}`));
    console.log(
      `  ${chalk.dim("Check your internet connection and try again.")}`,
    );
    console.log("");
    process.exit(1);
  }
}
