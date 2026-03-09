/**
 * src/commands/whoami.js
 * agenticmarket whoami — display current user information
 */

import chalk from "chalk";
import ora from "ora";
import { getApiKey, API_BASE_URL } from "../config.js";

export async function whoami() {
  console.log("");

  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(
      chalk.red("  ✗ Not authenticated. Run: agenticmarket auth <api-key>\n"),
    );
    process.exit(1);
  }

  const spinner = ora("  Fetching user information...").start();

  try {
    const res = await fetch(`${API_BASE_URL}/whoami`, {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) {
      spinner.fail(
        chalk.red("  Could not fetch user information. Check your API key."),
      );
      process.exit(1);
    }

    const data = await res.json();
    spinner.stop();

    console.log(`  ${chalk.bold("Your AgenticMarket Information")}`);
    console.log("");

    const cents = data.balance_cents;
    const color =
      cents === 0 ? chalk.red : cents < 20 ? chalk.yellow : chalk.green;

    console.log(`  ${chalk.dim("User ID:")}  ${data.user_id}`);
    console.log(`  ${chalk.dim("Username:")}  ${data.username}`);
    console.log(
      `  ${chalk.dim("Balance:")}  ${color.bold("$" + data.balance)}`,
    );
    console.log("");

    if (cents === 0) {
      console.log(
        chalk.red("  ⚠ You have no credits. Tool calls will be blocked."),
      );
      console.log(chalk.dim("  Top up at: https://agenticmarket.dev/topup\n"));
    } else if (cents < 20) {
      console.log(chalk.yellow("  ⚠ Low balance. Consider topping up."));
      console.log(chalk.dim("  Top up at: https://agenticmarket.dev/topup\n"));
    } else {
      console.log(chalk.dim("  Top up at: https://agenticmarket.dev/topup\n"));
    }
  } catch {
    spinner.fail(chalk.red("  Network error. Are you connected?\n"));
    process.exit(1);
  }
}
