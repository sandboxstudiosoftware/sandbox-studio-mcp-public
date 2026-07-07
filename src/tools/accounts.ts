import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { apiRequest } from "../client.js";

export function registerAccountTools(server: McpServer, config: Config) {
  server.registerTool(
    "list_accounts",
    {
      description: "List all registered sandbox accounts with pagination. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        pageIdentifier: z.string().optional().describe("Pagination token for the next page"),
        pageSize: z.number().optional().describe("Number of results per page"),
      },
    },
    async ({ pageIdentifier, pageSize }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: "/admin/accounts",
        query: { pageIdentifier, pageSize },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "import_accounts",
    {
      description: "Import AWS accounts into the sandbox pool",
      inputSchema: {
        accountIds: z.array(z.string().regex(/^\d{12}$/)).describe("List of 12-digit AWS account IDs to import"),
      },
    },
    async ({ accountIds }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: "/admin/accounts/import",
        body: { accountIds },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "eject_accounts",
    {
      description: "Eject AWS accounts from the sandbox pool",
      inputSchema: {
        accountIds: z.array(z.string().regex(/^\d{12}$/)).describe("List of 12-digit AWS account IDs to eject"),
      },
    },
    async ({ accountIds }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: "/admin/accounts/eject",
        body: { accountIds },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "list_unregistered_accounts",
    {
      description: "List AWS accounts available in the organization but not yet registered in the sandbox pool. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        pageIdentifier: z.string().optional().describe("Pagination token for the next page"),
        pageSize: z.number().optional().describe("Number of results per page"),
      },
    },
    async ({ pageIdentifier, pageSize }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: "/admin/accounts/unregistered",
        query: { pageIdentifier, pageSize },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_account",
    {
      description: "Get details of a specific sandbox account by AWS account ID",
      inputSchema: {
        awsAccountId: z.string().regex(/^\d{12}$/).describe("12-digit AWS account ID"),
      },
    },
    async ({ awsAccountId }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: `/admin/accounts/${awsAccountId}`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_account_lease_history",
    {
      description: "Get lease history for a specific sandbox account. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        awsAccountId: z.string().regex(/^\d{12}$/).describe("12-digit AWS account ID"),
        pageIdentifier: z.string().optional().describe("Pagination token for the next page"),
        pageSize: z.number().optional().describe("Number of results per page"),
        status: z.string().optional().describe("Filter leases by status"),
      },
    },
    async ({ awsAccountId, pageIdentifier, pageSize, status }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: `/admin/accounts/${awsAccountId}/leases`,
        query: { pageIdentifier, pageSize, status },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "retry_account_cleanup",
    {
      description: "Retry cleanup for a sandbox account that failed its previous cleanup attempt",
      inputSchema: {
        awsAccountId: z.string().regex(/^\d{12}$/).describe("12-digit AWS account ID"),
      },
    },
    async ({ awsAccountId }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: `/admin/accounts/${awsAccountId}/cleanup`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_account_cleanup_logs",
    {
      description: "Get cleanup logs for a specific sandbox account",
      inputSchema: {
        awsAccountId: z.string().regex(/^\d{12}$/).describe("12-digit AWS account ID"),
      },
    },
    async ({ awsAccountId }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: `/admin/accounts/${awsAccountId}/cleanup-logs`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_account_failed_resources",
    {
      description: "Get resources that failed cleanup for a specific sandbox account",
      inputSchema: {
        awsAccountId: z.string().regex(/^\d{12}$/).describe("12-digit AWS account ID"),
      },
    },
    async ({ awsAccountId }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: `/admin/accounts/${awsAccountId}/failed-resources`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
