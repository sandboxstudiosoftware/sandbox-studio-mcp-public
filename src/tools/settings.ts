import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { apiRequest } from "../client.js";

export function registerSettingsTools(server: McpServer, config: Config) {
  // --- CLEANUP SETTINGS ---

  server.registerTool(
    "get_cleanup_settings",
    {
      description: "Get the account cleanup (nuke) configuration",
    },
    async () => {
      const result = await apiRequest(config, { method: "GET", path: "/admin/cleanup-settings" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_cleanup_settings",
    {
      description: "Update the account cleanup (nuke) configuration",
      inputSchema: {
        nukeConfig: z.string().describe("Nuke configuration as YAML string"),
      },
    },
    async ({ nukeConfig }) => {
      const result = await apiRequest(config, {
        method: "PUT",
        path: "/admin/cleanup-settings",
        body: { nukeConfig },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_cleanup_hook",
    {
      description: "Get a cleanup hook script by type",
      inputSchema: {
        type: z.string().describe("Hook type (e.g. pre-cleanup, post-cleanup)"),
      },
    },
    async ({ type }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: `/admin/cleanup-settings/hooks/${type}`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_cleanup_hook",
    {
      description: "Update a cleanup hook script",
      inputSchema: {
        type: z.string().describe("Hook type"),
        script: z.string().describe("Hook script content"),
        runHook: z.boolean().optional().describe("Whether the hook is enabled"),
      },
    },
    async ({ type, script, runHook }) => {
      const body: Record<string, unknown> = { script };
      if (runHook !== undefined) body.runHook = runHook;
      const result = await apiRequest(config, {
        method: "PUT",
        path: `/admin/cleanup-settings/hooks/${type}`,
        body,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- EMAIL SETTINGS ---

  server.registerTool(
    "get_email_settings",
    {
      description: "Get email notification template settings",
    },
    async () => {
      const result = await apiRequest(config, { method: "GET", path: "/admin/email-settings" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_email_settings",
    {
      description: "Update email notification template settings",
      inputSchema: {
        emailSettings: z.record(z.unknown()).describe("Email template settings object"),
      },
    },
    async ({ emailSettings }) => {
      const result = await apiRequest(config, {
        method: "PUT",
        path: "/admin/email-settings",
        body: { emailSettings },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "send_test_email",
    {
      description: "Send a test email to verify email/SMTP configuration",
    },
    async () => {
      const result = await apiRequest(config, { method: "POST", path: "/admin/test-email" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- SMTP SETTINGS ---

  server.registerTool(
    "get_smtp_settings",
    {
      description: "Get SMTP configuration for outbound email",
    },
    async () => {
      const result = await apiRequest(config, { method: "GET", path: "/admin/smtp-settings" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_smtp_settings",
    {
      description: "Update SMTP configuration for outbound email",
      inputSchema: {
        host: z.string().describe("SMTP server hostname"),
        port: z.union([z.number(), z.string()]).describe("SMTP port"),
        username: z.string().describe("SMTP username"),
        use_tls: z.boolean().describe("Whether to use TLS"),
        password: z.string().optional().describe("SMTP password (omit to keep existing)"),
      },
    },
    async ({ host, port, username, use_tls, password }) => {
      const body: Record<string, unknown> = { host, port, username, use_tls };
      if (password !== undefined) body.password = password;
      const result = await apiRequest(config, {
        method: "PUT",
        path: "/admin/smtp-settings",
        body,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- GLOBAL CONFIG ---

  server.registerTool(
    "get_global_config",
    {
      description: "Get platform-wide global configuration",
    },
    async () => {
      const result = await apiRequest(config, { method: "GET", path: "/admin/config" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_global_config",
    {
      description: `Update platform-wide global configuration.

IMPORTANT: When updating lease settings:
- If changing 'maxBudget', ask the user if they also want to enable 'requireMaxBudget' (which forces all templates to have a budget set). Otherwise the max budget only acts as an upper cap for templates that already have a budget configured.
- If changing 'maxDurationHours', ask the user if they also want to enable 'requireMaxDuration' (which forces all templates to have a duration set). Otherwise the max duration only acts as an upper cap for templates that already have a duration configured.`,
      inputSchema: {
        maintenanceMode: z.boolean().describe("Enable/disable maintenance mode"),
        leases: z.record(z.unknown()).describe("Lease configuration settings"),
        cleanup: z.record(z.unknown()).describe("Cleanup configuration settings"),
        auth: z.record(z.unknown()).describe("Authentication configuration"),
        notification: z.record(z.unknown()).describe("Notification configuration"),
        deploymentMode: z.enum(["prod", "dev"]).optional().describe("Deployment mode"),
        betaFeaturesEnabled: z.boolean().optional().describe("Enable beta features"),
        defaultLanguage: z.enum(["en", "fr"]).optional().describe("Default language"),
        showTotalPersonalSpend: z.boolean().optional().describe("Show total personal spend to users"),
        theme: z.record(z.unknown()).nullable().optional().describe("UI theme configuration"),
        licence: z.object({ customer_api_key: z.string() }).nullable().optional().describe("Licence key"),
        hooks: z.record(z.unknown()).optional().describe("Hooks configuration"),
        baseTemplateCodebuildProjectName: z.string().nullable().optional().describe("CodeBuild project for base template resources"),
      },
    },
    async ({ maintenanceMode, leases, cleanup, auth, notification, ...rest }) => {
      const body: Record<string, unknown> = { maintenanceMode, leases, cleanup, auth, notification };
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) body[key] = value;
      }
      const result = await apiRequest(config, { method: "PATCH", path: "/admin/config", body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- RUNTIME CONFIG ---

  server.registerTool(
    "get_runtime_config",
    {
      description: "Get the runtime configuration for the current Sandbox Studio deployment",
    },
    async () => {
      const result = await apiRequest(config, { method: "GET", path: "/config" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
