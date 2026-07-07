import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { apiRequest } from "../client.js";

export function registerUserTools(server: McpServer, config: Config) {
  // --- USERS ---

  server.registerTool(
    "list_users",
    {
      description: "List users from the connected identity provider. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        pageIdentifier: z.string().optional().describe("Pagination token"),
        pageSize: z.number().optional().describe("Number of results per page"),
        filter: z.string().optional().describe("Search filter for user name or email"),
      },
    },
    async ({ pageIdentifier, pageSize, filter }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: "/users",
        query: { pageIdentifier, pageSize, filter },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "list_groups",
    {
      description: "List groups from the connected identity provider. Results are paginated — if the response contains a nextPageIdentifier, inform the user that more results are available and offer to fetch the next page.",
      inputSchema: {
        pageIdentifier: z.string().optional().describe("Pagination token"),
        pageSize: z.number().optional().describe("Number of results per page"),
      },
    },
    async ({ pageIdentifier, pageSize }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: "/users/groups",
        query: { pageIdentifier, pageSize },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "validate_users",
    {
      description: "Validate that user IDs exist in the identity provider",
      inputSchema: {
        users: z.array(z.string()).describe("Array of user IDs to validate"),
      },
    },
    async ({ users }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: "/users/validate",
        body: { users },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- USER PREFERENCES ---

  server.registerTool(
    "update_preferences",
    {
      description: "Update the current user's preferences",
      inputSchema: {
        language: z.string().describe("Language code (e.g. 'en', 'fr')"),
      },
    },
    async ({ language }) => {
      const result = await apiRequest(config, {
        method: "PUT",
        path: "/preferences",
        body: { language },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- OAUTH CLIENTS ---

  server.registerTool(
    "list_all_oauth_clients",
    {
      description: "List all OAuth API clients (admin endpoint)",
    },
    async () => {
      const result = await apiRequest(config, { method: "GET", path: "/admin/oauth/clients" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "list_my_oauth_clients",
    {
      description: "List OAuth API clients owned by the current user",
    },
    async () => {
      const result = await apiRequest(config, { method: "GET", path: "/oauth/clients" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "create_oauth_client",
    {
      description: "Create a new OAuth API client for machine-to-machine integrations",
      inputSchema: {
        description: z.string().describe("Description of the API client"),
      },
    },
    async ({ description }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: "/oauth/clients",
        body: { description },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "delete_oauth_client",
    {
      description: "Delete an OAuth API client",
      inputSchema: {
        clientId: z.string().describe("Client ID to delete"),
      },
    },
    async ({ clientId }) => {
      const result = await apiRequest(config, {
        method: "DELETE",
        path: `/oauth/clients/${clientId}`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_oauth_client",
    {
      description: "Update an OAuth API client's description",
      inputSchema: {
        clientId: z.string().describe("Client ID to update"),
        description: z.string().describe("New description for the client"),
      },
    },
    async ({ clientId, description }) => {
      const result = await apiRequest(config, {
        method: "PATCH",
        path: `/oauth/clients/${clientId}`,
        body: { description },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- TERMS OF SERVICE ---

  server.registerTool(
    "get_terms_of_service",
    {
      description: "Get the latest published terms of service",
    },
    async () => {
      const result = await apiRequest(config, { method: "GET", path: "/terms-of-service" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "list_terms_versions",
    {
      description: "List all published terms of service versions",
    },
    async () => {
      const result = await apiRequest(config, { method: "GET", path: "/admin/terms-of-service/versions" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_terms_version",
    {
      description: "Get a specific terms of service version",
      inputSchema: {
        versionId: z.number().describe("Version ID"),
      },
    },
    async ({ versionId }) => {
      const result = await apiRequest(config, {
        method: "GET",
        path: `/admin/terms-of-service/version/${versionId}`,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "publish_terms_of_service",
    {
      description: "Publish a new terms of service version",
      inputSchema: {
        content: z.string().describe("Terms of service content (supports markdown)"),
      },
    },
    async ({ content }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: "/admin/terms-of-service",
        body: { content },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- TAGS ---

  server.registerTool(
    "get_tags",
    {
      description: "Get all unique tags defined across account templates",
    },
    async () => {
      const result = await apiRequest(config, { method: "GET", path: "/tags" });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- UTILS ---

  server.registerTool(
    "validate_s3_path",
    {
      description: "Validate that an S3 path exists and is accessible",
      inputSchema: {
        s3Path: z.string().describe("S3 URI to validate (e.g. s3://bucket/path)"),
      },
    },
    async ({ s3Path }) => {
      const result = await apiRequest(config, {
        method: "POST",
        path: "/utils/s3-check",
        body: { s3Path },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
