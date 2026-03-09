/**
 * src/commands/logout.js
 * agenticmarket logout
 */

import { saveConfig } from "../config.js";

export async function logout() {
  await saveConfig({ apiKey: null , username: null, lastAuthAt: null});
  console.log("  You have been logged out.");
}