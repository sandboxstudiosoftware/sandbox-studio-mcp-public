import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { apiRequest } from "../client.js";

export function registerLeaseTools(server: McpServer, config: Config) {
  // 1. list_leases - GET /leases
  server.registerTool(
    "list_leases",
    {
      description: "List leases with optional filtering by status, user, date, and pagination. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        pageSize: z.number().optional().describe("Number of results per page"),
        pageIdentifier: z.string().optional().describe("Pagination token for the next page"),
        userId: z.string().optional().describe("Filter leases by user ID"),
        startDate: z.string().optional().describe("Filter leases starting from this date"),
        status: z
          .array(
            z.enum([
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
            ])
          )
          .optional()
          .describe("Filter leases by status"),
      },
    },
    async ({ pageSize, pageIdentifier, userId, startDate, status }) => {
      const query: Record<string, string | string[] | number | boolean | undefined> = {};
      if (pageSize !== undefined) query.pageSize = pageSize;
      if (pageIdentifier) query.pageIdentifier = pageIdentifier;
      if (userId) query.userId = userId;
      if (startDate) query.startDate = startDate;
      if (status) query.status = status;
      const result = await apiRequest(config, { method: "GET", path: "/leases", query });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 2. get_lease - GET /leases/{leaseId}
  server.registerTool(
    "get_lease",
    {
      description: "Get details of a specific lease by ID",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease"),
      },
    },
    async ({ leaseId }) => {
      const result = await apiRequest(config, { method: "GET", path: `/leases/${leaseId}` });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 3. request_lease - POST /leases
  server.registerTool(
    "request_lease",
    {
      description: "Request a new lease from a template. May require approval depending on template configuration.",
      inputSchema: {
        templateId: z.string().uuid().describe("The ID of the template to create the lease from"),
        comments: z.string().optional().describe("Comments for the lease request"),
        usersToShareWith: z
          .array(z.string())
          .optional()
          .describe("List of user IDs to share the lease with"),
        leaseForUserId: z
          .string()
          .optional()
          .describe("User ID to create the lease on behalf of"),
      },
    },
    async ({ templateId, comments, usersToShareWith, leaseForUserId }) => {
      const body: Record<string, unknown> = { templateId };
      if (comments !== undefined) body.comments = comments;
      if (usersToShareWith !== undefined) body.usersToShareWith = usersToShareWith;
      if (leaseForUserId !== undefined) body.leaseForUserId = leaseForUserId;
      const result = await apiRequest(config, { method: "POST", path: "/leases", body });
      const leaseId = (result as Record<string, unknown>)?.leaseId;
      const baseUiUrl = config.instanceUrl.replace(/\/api$/, "");
      const link = leaseId ? `${baseUiUrl}/leases/${leaseId}` : undefined;
      const output = { ...(result as object), ...(link ? { _link: link } : {}) };
      return { content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }] };
    }
  );

  // 4. update_lease - PATCH /leases/{leaseId}
  server.registerTool(
    "update_lease",
    {
      description: "Update an existing lease's budget, duration, or expiration settings",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease to update"),
        maxBudget: z
          .number()
          .positive()
          .nullable()
          .optional()
          .describe("Maximum budget for the lease, or null to remove the limit"),
        maxBudgetAction: z
          .enum(["SUSPEND_ACCOUNT", "WIPE_ACCOUNT"])
          .optional()
          .describe("Action to take when the budget is exceeded"),
        budgetThresholds: z
          .array(
            z.object({
              dollarsSpent: z.number().positive(),
              action: z.enum(["ALERT", "SUSPEND_ACCOUNT"]),
            })
          )
          .optional()
          .describe("Budget thresholds for notifications/actions"),
        expirationDate: z
          .string()
          .nullable()
          .optional()
          .describe("Expiration date (ISO 8601) for the lease, or null to remove"),
        maxDurationAction: z
          .enum(["SUSPEND_ACCOUNT", "WIPE_ACCOUNT"])
          .optional()
          .describe("Action to take when the max duration is reached"),
        durationThresholds: z
          .array(
            z.object({
              hoursRemaining: z.number().positive(),
              action: z.enum(["ALERT", "SUSPEND_ACCOUNT"]),
            })
          )
          .optional()
          .describe("Duration thresholds for notifications/actions"),
        maxDurationInHours: z
          .number()
          .positive()
          .nullable()
          .optional()
          .describe("Maximum duration in hours, or null to remove the limit"),
      },
    },
    async ({
      leaseId,
      maxBudget,
      maxBudgetAction,
      budgetThresholds,
      expirationDate,
      maxDurationAction,
      durationThresholds,
      maxDurationInHours,
    }) => {
      const body: Record<string, unknown> = {};
      if (maxBudget !== undefined) body.maxBudget = maxBudget;
      if (maxBudgetAction !== undefined) body.maxBudgetAction = maxBudgetAction;
      if (budgetThresholds !== undefined) body.budgetThresholds = budgetThresholds;
      if (expirationDate !== undefined) body.expirationDate = expirationDate;
      if (maxDurationAction !== undefined) body.maxDurationAction = maxDurationAction;
      if (durationThresholds !== undefined) body.durationThresholds = durationThresholds;
      if (maxDurationInHours !== undefined) body.maxDurationInHours = maxDurationInHours;
      const result = await apiRequest(config, {
        method: "PATCH",
        path: `/leases/${leaseId}`,
        body,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 5. suspend_lease - POST /leases/{leaseId}/suspend
  server.registerTool(
    "suspend_lease",
    {
      description: "Suspend an active lease",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease to suspend"),
      },
    },
    async ({ leaseId }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: `/leases/${leaseId}/suspend`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 6. resume_lease - POST /leases/{leaseId}/resume
  server.registerTool(
    "resume_lease",
    {
      description: "Resume a suspended lease",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease to resume"),
      },
    },
    async ({ leaseId }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: `/leases/${leaseId}/resume`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 7. review_lease - POST /leases/{leaseId}/review
  server.registerTool(
    "review_lease",
    {
      description: "Approve or deny a pending lease request",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease to review"),
        action: z.enum(["approve", "deny"]).describe("Whether to approve or deny the lease request"),
      },
    },
    async ({ leaseId, action }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: `/leases/${leaseId}/review`,
        body: { action },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 8. terminate_lease - POST /leases/{leaseId}/terminate
  server.registerTool(
    "terminate_lease",
    {
      description: `Terminate an active lease and begin cleanup.

⚠️ WARNING: When terminating multiple leases, ALWAYS confirm with the user:
- Clearly list which leases will be terminated (showing owner name, template name, and lease ID)
- Distinguish between the user's OWN leases and OTHER users' leases
- If the request involves terminating leases owned by other users, explicitly warn that this will affect other people's work
- Never batch-terminate all leases without explicit confirmation for each group (own vs others)

This action is IRREVERSIBLE. The account will be cleaned/wiped after termination.`,
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease to terminate"),
      },
    },
    async ({ leaseId }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: `/leases/${leaseId}/terminate`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 9. withdraw_lease - POST /leases/{leaseId}/withdraw
  server.registerTool(
    "withdraw_lease",
    {
      description: "Withdraw a pending lease request before it is approved",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease to withdraw"),
      },
    },
    async ({ leaseId }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: `/leases/${leaseId}/withdraw`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 10. get_lease_team_members - GET /leases/{leaseId}/team-members
  server.registerTool(
    "get_lease_team_members",
    {
      description: "Get the team members who have access to a shared lease",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease"),
      },
    },
    async ({ leaseId }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: `/leases/${leaseId}/team-members`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 11. share_lease - POST /leases/{leaseId}/team-members
  server.registerTool(
    "share_lease",
    {
      description: "Share a lease with additional users",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease to share"),
        userIds: z.array(z.string()).describe("List of user IDs to share the lease with"),
      },
    },
    async ({ leaseId, userIds }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: `/leases/${leaseId}/team-members`,
        body: { userIds },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 12. unshare_lease - DELETE /leases/{leaseId}/team-members
  server.registerTool(
    "unshare_lease",
    {
      description: "Remove users from a shared lease",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease"),
        userIds: z.array(z.string()).describe("List of user IDs to remove from the lease"),
      },
    },
    async ({ leaseId, userIds }) => {
      const result = await apiRequest(config, {
        method: "DELETE",
        path: `/leases/${leaseId}/team-members`,
        body: { userIds },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 13. get_lease_logs - GET /leases/{leaseId}/logs
  server.registerTool(
    "get_lease_logs",
    {
      description: "Get the setup/activity logs for a lease",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease"),
      },
    },
    async ({ leaseId }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: `/leases/${leaseId}/logs`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 14. get_lease_secrets - GET /leases/{leaseId}/secrets
  server.registerTool(
    "get_lease_secrets",
    {
      description: "Get the build output secrets (credentials) for a lease",
      inputSchema: {
        leaseId: z.string().uuid().describe("The unique identifier of the lease"),
      },
    },
    async ({ leaseId }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: `/leases/${leaseId}/secrets`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
