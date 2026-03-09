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

  // Basic format check
  if (!apiKey.startsWith("am_")) {
    console.error(chalk.red("  ✗ Invalid API key format."));
    console.log(chalk.dim("  Keys should start with am_"));
    console.log(chalk.dim(`  Get yours at: https://agenticmarket.dev\n`));
    process.exit(1);
  }

  const spinner = ora("  Verifying API key...").start();

  try {
    // Hit your worker's balance endpoint to verify the key is real
    const res = await fetch(`${API_BASE_URL}/balance`, {
      headers: { "x-api-key": apiKey },
    });

    if (res.status === 401) {
      spinner.fail(chalk.red("  Invalid API key. Check and try again."));
      console.log(chalk.dim(`  Get your key at: https://agenticmarket.dev\n`));
      process.exit(1);
    }

    if (!res.ok) {
      spinner.fail(chalk.red("  Could not connect to AgenticMarket."));
      process.exit(1);
    }

    const data = await res.json();

    // Save the key locally
    saveConfig({ apiKey });

    spinner.succeed(chalk.green("  Authenticated!"));
    console.log("");
    console.log(`  ${chalk.dim("User:")}    ${data.user_id}`);
    console.log(`  ${chalk.dim("Username:")} ${data.username}`);
    console.log(
      `  ${chalk.dim("Balance:")} ${chalk.bold.green("$" + data.balance)}`,
    );
    console.log("");
    console.log(chalk.dim("  You can now install skills:"));
    console.log(
      `  ${chalk.cyan("agenticmarket install")} ${chalk.yellow("<skill-name>")}`,
    );
    console.log("");
  } catch {
    spinner.fail(
      chalk.red("  Network error. Are you connected to the internet?"),
    );
    process.exit(1);
  }
}
