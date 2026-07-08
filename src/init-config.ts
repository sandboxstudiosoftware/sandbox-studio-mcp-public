#!/usr/bin/env node
/**
 * Interactive config initializer for sandbox-studio-mcp.
 * Usage: npx sandbox-studio-mcp init
 */

import { createInterface } from "node:readline";
import { saveConfig, getConfigPath, configExists } from "./config.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

export async function runInit() {
  console.log("Sandbox Studio MCP - Configuration Setup\n");

  if (configExists()) {
    const overwrite = await ask(
      `Config already exists at ${getConfigPath()}. Overwrite? (y/N): `
    );
    if (overwrite.toLowerCase() !== "y") {
      console.log("Aborted.");
      rl.close();
      process.exit(0);
    }
  }

  const instanceUrl = await ask("Instance URL (e.g. https://sandbox.example.com): ");
  const clientId = await ask("Client ID: ");
  const clientSecret = await ask("Client Secret: ");

  if (!instanceUrl || !clientId || !clientSecret) {
    console.error("Error: All fields are required.");
    rl.close();
    process.exit(1);
  }

  saveConfig({
    instanceUrl: instanceUrl.replace(/\/+$/, "").replace(/\/api$/, ""),
    clientId,
    clientSecret,
  });

  console.log(`\nConfiguration saved to ${getConfigPath()}`);
  rl.close();
}

// Allow direct execution
if (process.argv[1]?.endsWith("init-config.js")) {
  runInit().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
