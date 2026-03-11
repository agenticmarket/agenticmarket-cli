/**
 * src/commands/whoami.js
 * agenticmarket whoami — display current user information
 */

import chalk from "chalk";
import ora from "ora";
import { getApiKey, API_BASE_URL } from "../config.js";

export async function whoami() {
  console.log("");

  // ── Header ────────────────────────────────────────────
  const pad = "═".repeat(52);
  console.log(chalk.cyan.bold(`╔${pad}╗`));
  console.log(chalk.cyan.bold(`║  ${"Account".padEnd(50)}║`));
  console.log(chalk.cyan.bold(`╚${pad}╝`));
  console.log("");

  // ── Auth check ────────────────────────────────────────
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log(`  ${chalk.red("✗")}  ${chalk.red("Not authenticated")}`);
    console.log("");
    console.log(chalk.dim(`  ${"─".repeat(48)}`));
    console.log(`  Run ${chalk.cyan("agenticmarket auth <api-key>")} to log in`);
    console.log("");
    process.exit(1);
  }

  const spinner = ora({
    text: chalk.dim("Fetching account info..."),
    color: "cyan",
    spinner: "dots",
  }).start();

  try {
    const res = await fetch(`${API_BASE_URL}/whoami`, {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) {
      spinner.stop();
      console.log(`  ${chalk.red("✗")}  ${chalk.red("Could not fetch account info")}`);
      console.log("");
      console.log(chalk.dim(`  ${"─".repeat(48)}`));
      console.log(`  ${chalk.dim("Your API key may be invalid — try")} ${chalk.cyan("agenticmarket auth <api-key>")}`);
      console.log("");
      process.exit(1);
    }

    const data = await res.json();
    spinner.stop();

    const cents = data.balance_cents;
    const balanceColor =
      cents === 0 ? chalk.red.bold :
      cents < 20  ? chalk.yellow.bold :
                    chalk.green.bold;

    // ── Account details ───────────────────────────────
    console.log(`  ${chalk.green("✓")}  ${chalk.green("Connected")}`);
    console.log("");
    console.log(chalk.dim(`  ${"─".repeat(48)}`));
    console.log("");

    console.log(`  ${chalk.dim("Username".padEnd(14))}${chalk.white.bold(data.username)}`);
    console.log(`  ${chalk.dim("User ID".padEnd(14))}${chalk.dim(data.user_id)}`);
    console.log(`  ${chalk.dim("Balance".padEnd(14))}${balanceColor("$" + data.balance)}`);

    // ── Balance status ────────────────────────────────
    console.log("");
    console.log(chalk.dim(`  ${"─".repeat(48)}`));
    console.log("");

    if (cents === 0) {
      console.log(`  ${chalk.red("✗")}  ${chalk.red.bold("No credits — tool calls will be blocked")}`);
      console.log(`  ${chalk.dim("Top up at")}  ${chalk.cyan.underline("agenticmarket.dev/topup")}`);
    } else if (cents < 20) {
      console.log(`  ${chalk.yellow("⚠")}  ${chalk.yellow("Low balance — consider topping up soon")}`);
      console.log(`  ${chalk.dim("Top up at")}  ${chalk.cyan.underline("agenticmarket.dev/topup")}`);
    } else {
      console.log(`  ${chalk.dim("Top up at")}  ${chalk.cyan.underline("agenticmarket.dev/topup")}`);
    }

    console.log("");

  } catch {
    spinner.stop();
    console.log(`  ${chalk.red("✗")}  ${chalk.red("Network error")}`);
    console.log("");
    console.log(chalk.dim(`  ${"─".repeat(48)}`));
    console.log(`  ${chalk.dim("Check your internet connection and try again.")}`);
    console.log("");
    process.exit(1);
  }
}