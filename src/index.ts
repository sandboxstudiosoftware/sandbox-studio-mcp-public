#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { getAccessToken, getRolesFromToken, type SsRole } from "./auth.js";
import { registerLeaseTools } from "./tools/leases.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerTemplateTools, registerPublicTemplateTools } from "./tools/templates.js";
import { registerEventTools } from "./tools/events.js";
import { registerSettingsTools } from "./tools/settings.js";
import { registerUserTools } from "./tools/users.js";
import { logger } from "./logger.js";

/**
 * Role hierarchy: Admin > Manager > User
 *
 * Tool registration based on Sandbox Studio API specs:
 *
 * USER:
 *   - Leases: list, request, get, terminate, withdraw, team-members, secrets
 *   - Templates: list public, get, get info
 *   - Users: list users, preferences
 *   - OAuth: list own clients, create client, update client
 *   - Tags, Config (runtime), Terms of Service (read), Approvals (list)
 *
 * MANAGER (all User tools plus):
 *   - Leases: update, suspend, resume, review, logs
 *   - Templates: list managed, create, delete, update (info, permissions, launch, budget, duration, managers, sharing, tags)
 *   - Events: create, get, update, teams, terminate, start, provision, assign
 *   - Reporting: lease costs
 *   - Users: list groups, validate
 *   - Utils: S3 check
 *
 * ADMIN (all Manager tools plus):
 *   - Accounts: list, import, eject, unregistered, get, lease history, cleanup, cleanup-logs, failed-resources
 *   - Settings: cleanup, hooks, email, SMTP, global config
 *   - Admin Jobs: drift detection, lease monitoring
 *   - Terms of Service: list versions, get version, publish
 *   - OAuth: list all clients, delete client
 *   - Email: send test email
 */

async function main() {
  // Handle 'init' subcommand
  if (process.argv[2] === "init") {
    const { runInit } = await import("./init-config.js");
    await runInit();
    return;
  }

  const config = loadConfig();

  // Fetch token and determine user role
  const token = await getAccessToken(config);
  const roles = getRolesFromToken(token);
  const highestRole: SsRole = roles.includes("Admin")
    ? "Admin"
    : roles.includes("Manager")
      ? "Manager"
      : "User";

  logger.info("Authenticated", { role: highestRole, roles });

  const server = new McpServer({
    name: "sandbox-studio-mcp",
    version: "1.0.0",
  });

  // Register tools based on role
  // Leases and Users are available to all roles (with different capabilities enforced by the API)
  registerLeaseTools(server, config);
  registerUserTools(server, config);

  // All roles can browse public templates (read-only)
  registerPublicTemplateTools(server, config);

  // Manager and Admin get full template management, events, and reporting
  if (highestRole === "Manager" || highestRole === "Admin") {
    registerTemplateTools(server, config);
    registerEventTools(server, config);
  }

  // Admin gets account management and platform settings
  if (highestRole === "Admin") {
    registerAccountTools(server, config);
    registerSettingsTools(server, config);
  }

  logger.info("Tools registered", {
    role: highestRole,
    leases: true,
    users: true,
    templates: highestRole === "Manager" || highestRole === "Admin",
    events: highestRole === "Manager" || highestRole === "Admin",
    accounts: highestRole === "Admin",
    settings: highestRole === "Admin",
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info("Shutting down", { signal });
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info("Sandbox Studio MCP server started");
}

main().catch((err) => {
  logger.error("Fatal error", { message: err.message });
  process.exit(1);
});
