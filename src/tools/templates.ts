import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { apiRequest } from "../client.js";

/**
 * User-level template tools: browse public templates and view details.
 * Available to all roles.
 */
export function registerPublicTemplateTools(server: McpServer, config: Config) {
  server.registerTool(
    "list_public_templates",
    {
      description: "List public account templates available for lease requests. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        pageIdentifier: z.string().optional().describe("Pagination token"),
        pageSize: z.number().optional().describe("Number of results per page"),
      },
    },
    async ({ pageIdentifier, pageSize }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: "/templates/public",
        query: { pageIdentifier, pageSize },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_template",
    {
      description: "Get full details of an account template by ID",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
      },
    },
    async ({ templateId }) => {
      const result = await apiRequest(config, { method: "GET", path: `/templates/${templateId}` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_template_info",
    {
      description: "Get basic details (name, description, icon, colour) of a template",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
      },
    },
    async ({ templateId }) => {
      const result = await apiRequest(config, { method: "GET", path: `/templates/${templateId}/info` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}

const LeaseStatus = z.enum([
  "PendingApproval",
  "ProcessingApproval",
  "ApprovalDenied",
  "Active",
  "PendingSetup",
  "Suspended",
  "Expired",
  "BudgetExceeded",
  "ManuallyTerminated",
  "AccountQuarantined",
  "Ejected",
  "ProcessingTermination",
  "Withdrawn",
  "SetupFailed",
  "Reserved",
]);

const BudgetAction = z.enum(["SUSPEND_ACCOUNT", "WIPE_ACCOUNT"]);
const ThresholdAction = z.enum(["ALERT", "SUSPEND_ACCOUNT"]);
const BudgetDisplayMode = z.enum(["ALL", "CONSUMED_PERCENTAGE"]);

export function registerTemplateTools(server: McpServer, config: Config) {
  // 2. list_managed_templates
  server.registerTool(
    "list_managed_templates",
    {
      description: "List templates managed by the current user. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        pageIdentifier: z.string().optional().describe("Pagination token"),
        pageSize: z.number().optional().describe("Number of results per page"),
      },
    },
    async ({ pageIdentifier, pageSize }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: "/templates/managed",
        query: { pageIdentifier, pageSize },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 3. create_template
  server.registerTool(
    "create_template",
    {
      description: `Create a new account template.

Before creating a template, ask the user if they would like to:
- Add tags for categorisation (e.g., "ai", "development", "training", "data-science")
- Set a custom icon and colour
- Specify who should manage or approve leases

When providing a launchSetupScript or launchRunScript, use 'set-sandbox-output' to expose variables to the lease owner instead of 'echo':
  set-sandbox-output --name <name> --value <value> [--is-secret]

Examples:
  set-sandbox-output --name "Public IP" --value "$PUBLIC_IP"
  set-sandbox-output --name "Admin Password" --value "$PASSWORD" --is-secret`,
      inputSchema: {
        name: z.string().describe("Template name"),
        description: z.string().nullable().optional().describe("Template description"),
        icon: z.string().nullable().optional().describe("Icon identifier"),
        colour: z.string().nullable().optional().describe("Colour hex code"),
        leasesCanBeShared: z.boolean().optional().describe("Whether leases can be shared"),
        maxAdditionalMembers: z.number().optional().describe("Max additional team members"),
        tags: z.array(z.object({ name: z.string(), value: z.string() })).optional().describe("Template tags, each with a 'name' and 'value'"),
        maxBudget: z.number().positive().nullable().optional().describe("Max budget in dollars"),
        maxBudgetAction: BudgetAction.optional().describe("Action when budget exceeded"),
        budgetThresholds: z
          .array(z.object({ dollarsSpent: z.number().positive(), action: ThresholdAction }))
          .optional()
          .describe("Budget thresholds"),
        budgetDisplayMode: BudgetDisplayMode.optional().describe("How budget is displayed to users"),
        maxDurationInHours: z.number().positive().nullable().optional().describe("Max duration in hours"),
        maxDurationAction: BudgetAction.optional().describe("Action when duration exceeded"),
        durationThresholds: z
          .array(z.object({ hoursRemaining: z.number().positive(), action: ThresholdAction }))
          .optional()
          .describe("Duration thresholds"),
        requiresApproval: z.boolean().optional().describe("Whether leases require approval"),
        approverUserIds: z.array(z.string()).optional().describe("User IDs who can approve"),
        approverGroupIds: z.array(z.string()).optional().describe("Group IDs who can approve"),
        managerGroupIds: z.array(z.string()).optional().describe("Manager group IDs"),
        managerUserIds: z.array(z.string()).optional().describe("Manager user IDs"),
        accountPermissions: z.record(z.unknown()).optional().describe("IAM permission set configuration"),
        runSetupBeforeAccess: z.boolean().optional().describe("Run setup script before granting access"),
        launchAssetsS3Uri: z.string().nullable().optional().describe("S3 URI for launch assets"),
        launchSetupScript: z.string().nullable().optional().describe("Setup script content. Use 'set-sandbox-output --name <name> --value <value> [--is-secret]' to expose outputs to users."),
        launchRunScript: z.string().nullable().optional().describe("Run script content. Use 'set-sandbox-output --name <name> --value <value> [--is-secret]' to expose outputs to users."),
        estimatedSetupDurationMinutes: z.number().nullable().optional().describe("Estimated setup time in minutes"),
      },
    },
    async (args) => {
      const body: Record<string, unknown> = { name: args.name };
      const optionalFields = [
        "description", "icon", "colour", "leasesCanBeShared", "maxAdditionalMembers",
        "tags", "maxBudget", "maxBudgetAction", "budgetThresholds", "budgetDisplayMode",
        "maxDurationInHours", "maxDurationAction", "durationThresholds", "requiresApproval",
        "approverUserIds", "approverGroupIds", "managerGroupIds", "managerUserIds",
        "accountPermissions", "runSetupBeforeAccess", "launchAssetsS3Uri",
        "launchSetupScript", "launchRunScript", "estimatedSetupDurationMinutes",
      ] as const;
      for (const field of optionalFields) {
        if ((args as Record<string, unknown>)[field] !== undefined) {
          body[field] = (args as Record<string, unknown>)[field];
        }
      }
      const result = await apiRequest(config, { method: "POST", path: "/templates", body });
      const templateId = (result as Record<string, unknown>)?.templateId;
      const baseUiUrl = config.instanceUrl.replace(/\/api$/, "");
      const link = templateId ? `${baseUiUrl}/templates/${templateId}` : undefined;
      const output = { ...(result as object), ...(link ? { _link: link } : {}) };
      return { content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }] };
    }
  );

  // 5. delete_template
  server.registerTool(
    "delete_template",
    {
      description: "Delete an account template",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID to delete"),
      },
    },
    async ({ templateId }) => {
      const result = await apiRequest(config, { method: "DELETE", path: `/templates/${templateId}` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 7. update_template_info
  server.registerTool(
    "update_template_info",
    {
      description: "Update basic details of a template (name, description, icon, colour)",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
        name: z.string().describe("Template name"),
        description: z.string().nullable().optional().describe("Template description"),
        icon: z.string().nullable().optional().describe("Icon identifier"),
        colour: z.string().nullable().optional().describe("Colour hex code"),
      },
    },
    async ({ templateId, name, description, icon, colour }) => {
      const body: Record<string, unknown> = { name };
      if (description !== undefined) body.description = description;
      if (icon !== undefined) body.icon = icon;
      if (colour !== undefined) body.colour = colour;
      const result = await apiRequest(config, { method: "PUT", path: `/templates/${templateId}/info`, body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 8. get_template_leases
  server.registerTool(
    "get_template_leases",
    {
      description: "Get leases associated with a template. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
        pageIdentifier: z.string().optional().describe("Pagination token"),
        pageSize: z.number().optional().describe("Number of results per page"),
        status: z.array(LeaseStatus).optional().describe("Filter by lease status"),
      },
    },
    async ({ templateId, pageIdentifier, pageSize, status }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: `/templates/${templateId}/leases`,
        query: { pageIdentifier, pageSize, status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 9. get_template_permissions
  server.registerTool(
    "get_template_permissions",
    {
      description: "Get the IAM permission configuration for a template",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
      },
    },
    async ({ templateId }) => {
      const result = await apiRequest(config, { method: "GET", path: `/templates/${templateId}/permissions` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 10. update_template_permissions
  server.registerTool(
    "update_template_permissions",
    {
      description: "Update the IAM permission configuration for a template",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
        sessionDuration: z.string().optional().describe("IAM session duration"),
        accountPermissions: z.record(z.unknown()).optional().describe("Permission set configuration"),
      },
    },
    async ({ templateId, sessionDuration, accountPermissions }) => {
      const body: Record<string, unknown> = {};
      if (sessionDuration !== undefined) body.sessionDuration = sessionDuration;
      if (accountPermissions !== undefined) body.accountPermissions = accountPermissions;
      const result = await apiRequest(config, { method: "PUT", path: `/templates/${templateId}/permissions`, body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 11. get_template_launch_settings
  server.registerTool(
    "get_template_launch_settings",
    {
      description: "Get launch/setup settings for a template",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
      },
    },
    async ({ templateId }) => {
      const result = await apiRequest(config, { method: "GET", path: `/templates/${templateId}/launch-settings` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 12. update_template_launch_settings
  server.registerTool(
    "update_template_launch_settings",
    {
      description: `Update launch/setup settings for a template.

IMPORTANT: When writing launch setup scripts or run scripts, use 'set-sandbox-output' to expose variables to the lease owner instead of using 'echo'. This command registers outputs in the Sandbox Studio UI.

Usage:
  set-sandbox-output --name <name> --value <value> [--is-secret]

Examples:
  set-sandbox-output --name "Public IP" --value "$PUBLIC_IP"
  set-sandbox-output --name "RDP Endpoint" --value "$PUBLIC_IP:3389"
  set-sandbox-output --name "Admin Password" --value "$PASSWORD" --is-secret
  set-sandbox-output --name "Console URL" --value "https://$REGION.console.aws.amazon.com/ec2"

Use --is-secret for sensitive values like passwords, keys, or tokens. These will be masked in the UI.
Do NOT use plain 'echo' for output variables meant for the user.`,
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
        runSetupBeforeAccess: z.boolean().optional().describe("Run setup before granting access"),
        launchAssetsS3Uri: z.string().nullable().optional().describe("S3 URI for launch assets"),
        launchSetupScript: z.string().nullable().optional().describe("Setup script content"),
        launchRunScript: z.string().nullable().optional().describe("Run script content"),
        estimatedSetupDurationMinutes: z.number().nullable().optional().describe("Estimated setup time in minutes"),
      },
    },
    async ({ templateId, runSetupBeforeAccess, launchAssetsS3Uri, launchSetupScript, launchRunScript, estimatedSetupDurationMinutes }) => {
      const body: Record<string, unknown> = {};
      if (runSetupBeforeAccess !== undefined) body.runSetupBeforeAccess = runSetupBeforeAccess;
      if (launchAssetsS3Uri !== undefined) body.launchAssetsS3Uri = launchAssetsS3Uri;
      if (launchSetupScript !== undefined) body.launchSetupScript = launchSetupScript;
      if (launchRunScript !== undefined) body.launchRunScript = launchRunScript;
      if (estimatedSetupDurationMinutes !== undefined) body.estimatedSetupDurationMinutes = estimatedSetupDurationMinutes;
      const result = await apiRequest(config, { method: "PUT", path: `/templates/${templateId}/launch-settings`, body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 13. update_template_budget
  server.registerTool(
    "update_template_budget",
    {
      description: "Update budget settings for a template",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
        maxBudget: z.number().positive().nullable().optional().describe("Max budget in dollars, or null to remove"),
        maxBudgetAction: BudgetAction.optional().describe("Action when budget exceeded"),
        budgetThresholds: z
          .array(z.object({ dollarsSpent: z.number().positive(), action: ThresholdAction }))
          .optional()
          .describe("Budget thresholds"),
        budgetDisplayMode: BudgetDisplayMode.optional().describe("How budget is displayed"),
      },
    },
    async ({ templateId, maxBudget, maxBudgetAction, budgetThresholds, budgetDisplayMode }) => {
      const body: Record<string, unknown> = {};
      if (maxBudget !== undefined) body.maxBudget = maxBudget;
      if (maxBudgetAction !== undefined) body.maxBudgetAction = maxBudgetAction;
      if (budgetThresholds !== undefined) body.budgetThresholds = budgetThresholds;
      if (budgetDisplayMode !== undefined) body.budgetDisplayMode = budgetDisplayMode;
      const result = await apiRequest(config, { method: "PUT", path: `/templates/${templateId}/budget`, body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 14. update_template_duration
  server.registerTool(
    "update_template_duration",
    {
      description: "Update duration settings for a template",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
        maxDurationInHours: z.number().positive().nullable().optional().describe("Max duration in hours, or null to remove"),
        maxDurationAction: BudgetAction.optional().describe("Action when duration exceeded"),
        durationThresholds: z
          .array(z.object({ hoursRemaining: z.number().positive(), action: ThresholdAction }))
          .optional()
          .describe("Duration thresholds"),
      },
    },
    async ({ templateId, maxDurationInHours, maxDurationAction, durationThresholds }) => {
      const body: Record<string, unknown> = {};
      if (maxDurationInHours !== undefined) body.maxDurationInHours = maxDurationInHours;
      if (maxDurationAction !== undefined) body.maxDurationAction = maxDurationAction;
      if (durationThresholds !== undefined) body.durationThresholds = durationThresholds;
      const result = await apiRequest(config, { method: "PUT", path: `/templates/${templateId}/duration`, body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 15. update_template_managers
  server.registerTool(
    "update_template_managers",
    {
      description: "Update managers and approval settings for a template",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
        requiresApproval: z.boolean().optional().describe("Whether leases require approval"),
        approverUserIds: z.array(z.string()).optional().describe("User IDs who can approve"),
        approverGroupIds: z.array(z.string()).optional().describe("Group IDs who can approve"),
        managerGroupIds: z.array(z.string()).optional().describe("Manager group IDs"),
        managerUserIds: z.array(z.string()).optional().describe("Manager user IDs"),
      },
    },
    async ({ templateId, requiresApproval, approverUserIds, approverGroupIds, managerGroupIds, managerUserIds }) => {
      const body: Record<string, unknown> = {};
      if (requiresApproval !== undefined) body.requiresApproval = requiresApproval;
      if (approverUserIds !== undefined) body.approverUserIds = approverUserIds;
      if (approverGroupIds !== undefined) body.approverGroupIds = approverGroupIds;
      if (managerGroupIds !== undefined) body.managerGroupIds = managerGroupIds;
      if (managerUserIds !== undefined) body.managerUserIds = managerUserIds;
      const result = await apiRequest(config, { method: "PUT", path: `/templates/${templateId}/managers`, body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 16. update_template_sharing
  server.registerTool(
    "update_template_sharing",
    {
      description: "Update sharing settings for a template",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
        leasesCanBeShared: z.boolean().optional().describe("Whether leases can be shared with other users"),
        maxAdditionalMembers: z.number().optional().describe("Maximum additional team members"),
      },
    },
    async ({ templateId, leasesCanBeShared, maxAdditionalMembers }) => {
      const body: Record<string, unknown> = {};
      if (leasesCanBeShared !== undefined) body.leasesCanBeShared = leasesCanBeShared;
      if (maxAdditionalMembers !== undefined) body.maxAdditionalMembers = maxAdditionalMembers;
      const result = await apiRequest(config, { method: "PUT", path: `/templates/${templateId}/sharing`, body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 17. update_template_tags
  server.registerTool(
    "update_template_tags",
    {
      description: "Update tags for a template. Tags are key-value pairs with a name and value.",
      inputSchema: {
        templateId: z.string().uuid().describe("Template ID"),
        tags: z.array(z.object({ name: z.string(), value: z.string() })).describe("List of tags to set on the template, each with a 'name' and 'value'"),
      },
    },
    async ({ templateId, tags }) => {
      const result = await apiRequest(config, {
        method: "PUT",
        path: `/templates/${templateId}/tags`,
        body: { tags },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
