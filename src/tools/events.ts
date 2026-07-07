import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { apiRequest } from "../client.js";

const EventStatus = z.enum([
  "Created",
  "Provisioning",
  "ProvisioningFailed",
  "ReadyToStart",
  "Starting",
  "Running",
  "Terminating",
  "Terminated",
  "Error",
]);

const ApprovalStatus = z.enum(["pending", "denied", "approved", "withdrawn"]);

export function registerEventTools(server: McpServer, config: Config) {
  // --- APPROVALS ---

  server.registerTool(
    "list_approvals",
    {
      description: "List pending lease approval requests. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        pageSize: z.number().optional().describe("Number of results per page"),
        pageIdentifier: z.string().optional().describe("Pagination token"),
        status: z.array(ApprovalStatus).optional().describe("Filter by approval status"),
      },
    },
    async ({ pageSize, pageIdentifier, status }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: "/approvals",
        query: { pageSize, pageIdentifier, status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- EVENTS ---

  server.registerTool(
    "list_events",
    {
      description: "List sandbox events with optional status filtering. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        pageSize: z.number().optional().describe("Number of results per page"),
        pageIdentifier: z.string().optional().describe("Pagination token"),
        eventStatuses: z.array(EventStatus).optional().describe("Filter by event status"),
      },
    },
    async ({ pageSize, pageIdentifier, eventStatuses }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: "/events",
        query: { pageSize, pageIdentifier, eventStatuses },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "create_event",
    {
      description: "Create a new sandbox event with provisioned accounts and team assignments",
      inputSchema: {
        name: z.string().describe("Event name"),
        templateId: z.string().uuid().describe("Template ID to use for event accounts"),
        description: z.string().optional().describe("Event description"),
        colour: z.string().optional().describe("Event colour"),
        icon: z.string().optional().describe("Event icon"),
        scheduledStartDate: z.string().optional().describe("Scheduled start date (ISO 8601)"),
        scheduledEndDate: z.string().optional().describe("Scheduled end date (ISO 8601)"),
        durationInHours: z.number().optional().describe("Event duration in hours"),
        minAccounts: z.number().int().optional().describe("Minimum number of accounts to provision"),
        startImmediately: z.boolean().optional().describe("Start the event immediately after provisioning"),
        provisionImmediately: z.boolean().optional().describe("Begin provisioning immediately"),
        managerUserIds: z.array(z.string()).optional().describe("Manager user IDs"),
        managerGroupIds: z.array(z.string()).optional().describe("Manager group IDs"),
        teams: z
          .array(z.object({ name: z.string(), members: z.array(z.string()).optional() }))
          .optional()
          .describe("Teams to create for the event"),
      },
    },
    async (args) => {
      const body: Record<string, unknown> = { name: args.name, templateId: args.templateId };
      const optionalFields = [
        "description", "colour", "icon", "scheduledStartDate", "scheduledEndDate",
        "durationInHours", "minAccounts", "startImmediately", "provisionImmediately",
        "managerUserIds", "managerGroupIds", "teams",
      ] as const;
      for (const field of optionalFields) {
        if ((args as Record<string, unknown>)[field] !== undefined) {
          body[field] = (args as Record<string, unknown>)[field];
        }
      }
      const result = await apiRequest(config, { method: "POST", path: "/events", body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_event",
    {
      description: "Get details of a specific event",
      inputSchema: {
        eventId: z.string().describe("Event ID"),
      },
    },
    async ({ eventId }) => {
      const result = await apiRequest(config, { method: "GET", path: `/events/${eventId}` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_event",
    {
      description: "Update an existing event's configuration",
      inputSchema: {
        eventId: z.string().describe("Event ID"),
        name: z.string().optional().describe("Event name"),
        description: z.string().optional().describe("Event description"),
        colour: z.string().optional().describe("Event colour"),
        icon: z.string().optional().describe("Event icon"),
        scheduledStartDate: z.string().nullable().optional().describe("Scheduled start date or null to remove"),
        scheduledEndDate: z.string().nullable().optional().describe("Scheduled end date or null to remove"),
        durationInHours: z.number().nullable().optional().describe("Duration in hours or null to remove"),
        templateId: z.string().uuid().optional().describe("Template ID"),
        managerUserIds: z.array(z.string()).optional().describe("Manager user IDs"),
        managerGroupIds: z.array(z.string()).optional().describe("Manager group IDs"),
      },
    },
    async ({ eventId, ...rest }) => {
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) body[key] = value;
      }
      const result = await apiRequest(config, { method: "PATCH", path: `/events/${eventId}`, body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_event_teams",
    {
      description: "Get teams for a specific event",
      inputSchema: {
        eventId: z.string().describe("Event ID"),
      },
    },
    async ({ eventId }) => {
      const result = await apiRequest(config, { method: "GET", path: `/events/${eventId}/teams` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "add_event_teams",
    {
      description: "Add teams to an event",
      inputSchema: {
        eventId: z.string().describe("Event ID"),
        teams: z.array(z.object({ name: z.string(), members: z.array(z.string()).optional() })).describe("Teams to add"),
        minAccounts: z.number().optional().describe("Minimum accounts to provision for new teams"),
      },
    },
    async ({ eventId, teams, minAccounts }) => {
      const body: Record<string, unknown> = { teams };
      if (minAccounts !== undefined) body.minAccounts = minAccounts;
      const result = await apiRequest(config, { method: "POST", path: `/events/${eventId}/teams`, body });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "terminate_event",
    {
      description: "Terminate an event and all its associated leases",
      inputSchema: {
        eventId: z.string().describe("Event ID"),
      },
    },
    async ({ eventId }) => {
      const result = await apiRequest(config, { method: "POST", path: `/events/${eventId}/terminate` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "start_event",
    {
      description: "Start a provisioned event, granting access to teams",
      inputSchema: {
        eventId: z.string().describe("Event ID"),
      },
    },
    async ({ eventId }) => {
      const result = await apiRequest(config, { method: "POST", path: `/events/${eventId}/start` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "provision_event",
    {
      description: "Provision accounts for an event",
      inputSchema: {
        eventId: z.string().describe("Event ID"),
      },
    },
    async ({ eventId }) => {
      const result = await apiRequest(config, { method: "POST", path: `/events/${eventId}/provision` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "assign_event_team_owner",
    {
      description: "Assign an owner to a team within an event",
      inputSchema: {
        eventId: z.string().describe("Event ID"),
        teamId: z.string().describe("Team ID"),
        userId: z.string().describe("User ID to assign as team owner"),
      },
    },
    async ({ eventId, teamId, userId }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: `/events/${eventId}/teams/${teamId}/assign`,
        body: { userId },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- REPORTING ---

  server.registerTool(
    "get_lease_costs",
    {
      description: "Get lease cost reporting data with optional grouping and filtering",
      inputSchema: {
        start_date: z.string().describe("Start date (full ISO 8601 datetime, e.g. '2026-07-01T00:00:00Z')"),
        end_date: z.string().optional().describe("End date (full ISO 8601 datetime, e.g. '2026-07-07T23:59:59Z')"),
        group_type: z.enum(["lease-templates", "tags", "event"]).optional().describe("How to group results"),
        group_by: z.string().optional().describe("Specific group to filter by (JSON array)"),
        tag_filter: z.string().optional().describe("Filter by tag (JSON array)"),
        lease_template_filter: z.string().optional().describe("Filter by template ID (JSON array)"),
        event_filter: z.string().optional().describe("Filter by event ID (JSON array)"),
        aggregation: z.enum(["daily", "monthly"]).optional().describe("Time aggregation"),
        page: z.number().optional().describe("Page number"),
        limit: z.number().optional().describe("Results per page"),
      },
    },
    async (args) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: "/reporting/lease-costs",
        query: args as Record<string, string | number | boolean | undefined>,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- ADMIN JOBS ---

  server.registerTool(
    "trigger_drift_detection",
    {
      description: "Trigger an on-demand drift detection job across sandbox accounts",
    },
    async () => {
      const result = await apiRequest(config, { method: "POST", path: "/admin/jobs/drift-detection" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "trigger_lease_monitoring",
    {
      description: "Trigger an on-demand lease monitoring job to check budgets and durations",
    },
    async () => {
      const result = await apiRequest(config, { method: "POST", path: "/admin/jobs/lease-monitoring" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
