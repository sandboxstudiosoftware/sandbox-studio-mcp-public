import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";

const ConfigSchema = z.object({
  instanceUrl: z.string().url("instanceUrl must be a valid URL"),
  clientId: z.string().min(1, "clientId is required"),
  clientSecret: z.string().min(1, "clientSecret is required"),
});

export type Config = z.infer<typeof ConfigSchema>;

const CONFIG_DIR = join(homedir(), ".sandbox-studio-mcp");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadConfig(): Config {
  if (!configExists()) {
    throw new Error(
      `Configuration not found. Run 'sandbox-studio-mcp init-config' or create ${CONFIG_FILE} manually.\n\n` +
        `Expected format:\n` +
        JSON.stringify(
          {
            instanceUrl: "https://your-instance.example.com",
            clientId: "your-client-id",
            clientSecret: "your-client-secret",
          },
          null,
          2
        )
    );
  }

  const raw = readFileSync(CONFIG_FILE, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${CONFIG_FILE}. Please check the file syntax.`);
  }

  const result = ConfigSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration in ${CONFIG_FILE}:\n${issues}`);
  }

  // Normalize: strip trailing slash and remove /api suffix if present (backward compat)
  let instanceUrl = result.data.instanceUrl.replace(/\/+$/, "");
  instanceUrl = instanceUrl.replace(/\/api$/, "");

  return {
    ...result.data,
    instanceUrl,
  };
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}
