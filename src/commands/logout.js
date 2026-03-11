/**
 * src/commands/logout.js
 * agenticmarket logout
 */

import chalk from "chalk";
import prompts from "prompts";
import { saveConfig } from "../config.js";

export async function logout() {
  console.log("");

  // ── Header ────────────────────────────────────────────
  const pad = "═".repeat(52);
  console.log(chalk.cyan.bold(`╔${pad}╗`));
  console.log(chalk.cyan.bold(`║  ${"Logout".padEnd(50)}║`));
  console.log(chalk.cyan.bold(`╚${pad}╝`));
  console.log("");

  // ── Confirm ───────────────────────────────────────────
  const { confirm } = await prompts({
    type: "confirm",
    name: "confirm",
    message: "  Remove your saved API key from this machine?",
    initial: false,
  });

  if (!confirm) {
    console.log("");
    console.log(`  ${chalk.dim("Cancelled — you are still logged in.")}`);
    console.log("");
    return;
  }

  await saveConfig({ apiKey: null, username: null, lastAuthAt: null });

  console.log("");
  console.log(`  ${chalk.green("✓")}  ${chalk.green.bold("Logged out successfully")}`);
  console.log("");
  console.log(chalk.dim(`  ${"─".repeat(48)}`));
  console.log("");
  console.log(`  ${chalk.dim("Log back in anytime:")}`);
  console.log(`  ${chalk.cyan("agenticmarket auth")} ${chalk.yellow("<api-key>")}`);
  console.log("");
}