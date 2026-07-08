# Sandbox Studio MCP Server

A local [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that connects AI assistants to the [Sandbox Studio](https://sandboxstudiosoftware.com) API. This lets you manage AWS sandbox accounts, leases, templates, events, and settings through natural language conversations.

## Install

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sandbox-studio&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22sandbox-studio-mcp%22%5D%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sandbox-studio&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22sandbox-studio-mcp%22%5D%7D&quality=insiders)
[![Install in Cursor](https://img.shields.io/badge/Cursor-Install_Server-000000?style=flat-square&logo=cursor&logoColor=white)](cursor://anysphere.cursor-deeplink/mcp/install?name=sandbox-studio&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22sandbox-studio-mcp%22%5D%7D)

> After installing, run `npx sandbox-studio-mcp init` to configure your credentials.

## What is this?

Sandbox Studio is a platform for managing temporary AWS accounts — useful for training, labs, hackathons, and development sandboxes. This MCP server exposes the full Sandbox Studio API as tools that AI assistants (Claude, Kiro, Cursor, etc.) can call on your behalf.

**Example conversations:**

> "Create a template for my students with a $50 budget and EC2 access only"

> "Request a lease for the VS Code Server template and tell me when it's ready"

> "Show me all pending approvals and deny Emma's requests"

> "Terminate all my leases except the GPU one"

## How it works

```
┌─────────────────┐      stdio       ┌──────────────────┐      HTTPS      ┌─────────────────────┐
│   AI Assistant  │◄────────────────►│   MCP Server     │◄───────────────►│   Sandbox Studio    │
│ (Kiro/Claude/   │                  │   (this project) │     OAuth2      │   API               │
│  Cursor)        │                  │                  │                 │                     │
└─────────────────┘                  └──────────────────┘                 └─────────────────────┘
```

1. The AI assistant spawns the MCP server as a local subprocess
2. When you ask a question, the AI decides which tools to call
3. The MCP server authenticates with Sandbox Studio using OAuth2 client credentials
4. API responses are returned to the AI, which formats them for you

## Prerequisites

- Node.js >= 18
- pnpm (or npm)
- A Sandbox Studio instance with API access
- OAuth client credentials — create these in the Sandbox Studio admin panel

## Quick Start

### 1. Configure credentials

```bash
npx sandbox-studio-mcp init
```

This will prompt you for:
- **Instance URL** — your Sandbox Studio base URL (e.g. `https://sandbox.example.com`)
- **Client ID** — from your OAuth client in the Sandbox Studio admin panel
- **Client Secret** — from your OAuth client

> To create OAuth credentials, go to your Sandbox Studio admin panel → API Clients → Create new client.

### 2. Connect to your AI assistant

#### Kiro

Add to `~/.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "sandbox-studio": {
      "command": "npx",
      "args": ["-y", "sandbox-studio-mcp"]
    }
  }
}
```

#### Claude Code

```bash
claude mcp add sandbox-studio -- npx -y sandbox-studio-mcp
```

#### Cursor / VS Code (manual)

Add to your MCP settings (or use the one-click badges above):

```json
{
  "mcp": {
    "servers": {
      "sandbox-studio": {
        "command": "npx",
        "args": ["-y", "sandbox-studio-mcp"]
      }
    }
  }
}
```

#### Codex

Add to `~/.codex/config.json`:

```json
{
  "mcpServers": {
    "sandbox-studio": {
      "command": "npx",
      "args": ["-y", "sandbox-studio-mcp"]
    }
  }
}
```

## AI Behaviour Guidance

The MCP server includes guidance in tool descriptions that shapes how the AI interacts with you. This is one of the key design patterns of this project:

### Safety guardrails

- **Lease termination** — When terminating multiple leases, the AI will list them clearly, distinguish between your own and others' leases, and ask for confirmation before proceeding.
- **Bulk operations** — The AI won't batch-terminate or batch-deny without explicit confirmation.

### Template creation prompts

When creating templates, the AI is guided to ask about:
- Tags for categorisation
- Custom icon and colour
- Manager/approver configuration

### Launch script convention

When the AI writes launch scripts for templates, it uses `set-sandbox-output` instead of `echo` to expose variables to the lease owner in the Sandbox Studio UI:

```bash
set-sandbox-output --name "Public IP" --value "$PUBLIC_IP"
set-sandbox-output --name "Admin Password" --value "$PASSWORD" --is-secret
```

The `--is-secret` flag masks the value in the UI.

### Response enrichment

When templates or leases are created, the response includes a `_link` field with a direct URL to the resource in the Sandbox Studio UI.

## OAuth2 Authentication

The server uses the OAuth2 **client credentials** grant flow:

1. On first API call, it requests a token from `{instanceUrl}/api/oauth/token`
2. The token is cached in memory with a 60-second refresh buffer
3. On 401 responses, it automatically clears the cache and retries
4. HTML responses (login page redirects) are detected and trigger a token refresh

To create OAuth credentials, go to your Sandbox Studio admin panel → API Clients → Create new client.

## Available Tools (65+)

### Leases
| Tool | Description |
|------|-------------|
| `list_leases` | List leases with filtering by status, user, date |
| `get_lease` | Get lease details by ID |
| `request_lease` | Request a new lease from a template |
| `update_lease` | Update lease budget/duration/expiration |
| `suspend_lease` | Suspend an active lease |
| `resume_lease` | Resume a suspended lease |
| `review_lease` | Approve or deny a lease request |
| `terminate_lease` | Terminate a lease (irreversible) |
| `withdraw_lease` | Withdraw a pending request |
| `get_lease_team_members` | List shared users |
| `share_lease` | Share with additional users |
| `unshare_lease` | Remove shared users |
| `get_lease_logs` | Get setup/activity logs |
| `get_lease_secrets` | Get build output secrets |

### Templates
| Tool | Description |
|------|-------------|
| `list_public_templates` | List templates available for lease requests |
| `list_managed_templates` | List templates you manage |
| `create_template` | Create a new template |
| `get_template` | Get full template details |
| `delete_template` | Delete a template |
| `get_template_info` | Get basic info (name, description, icon) |
| `update_template_info` | Update basic info |
| `get_template_leases` | List leases for a template |
| `get_template_permissions` | Get IAM permission config |
| `update_template_permissions` | Update IAM permissions |
| `get_template_launch_settings` | Get launch/setup scripts |
| `update_template_launch_settings` | Update launch/setup scripts |
| `update_template_budget` | Update budget settings |
| `update_template_duration` | Update duration settings |
| `update_template_managers` | Update managers/approvers |
| `update_template_sharing` | Update sharing settings |
| `update_template_tags` | Update tags |

### Accounts
| Tool | Description |
|------|-------------|
| `list_accounts` | List sandbox accounts |
| `list_unregistered_accounts` | List available unregistered accounts |
| `get_account` | Get account details |
| `import_accounts` | Import AWS accounts into the pool |
| `eject_accounts` | Eject accounts from the pool |
| `get_account_lease_history` | Get lease history for an account |
| `retry_account_cleanup` | Retry failed cleanup |
| `get_account_cleanup_logs` | Get cleanup logs |
| `get_account_failed_resources` | Get failed cleanup resources |

### Events
| Tool | Description |
|------|-------------|
| `list_events` | List events with status filtering |
| `create_event` | Create a new event |
| `get_event` | Get event details |
| `update_event` | Update an event |
| `get_event_teams` | Get event teams |
| `add_event_teams` | Add teams to an event |
| `assign_event_team_owner` | Assign a team owner |
| `provision_event` | Provision event accounts |
| `start_event` | Start a provisioned event |
| `terminate_event` | Terminate an event |

### Approvals & Reporting
| Tool | Description |
|------|-------------|
| `list_approvals` | List pending approval requests |
| `get_lease_costs` | Get cost reporting data |

### Admin Jobs
| Tool | Description |
|------|-------------|
| `trigger_drift_detection` | Run drift detection |
| `trigger_lease_monitoring` | Run lease monitoring |

### Settings
| Tool | Description |
|------|-------------|
| `get_global_config` | Get global platform config |
| `update_global_config` | Update global config |
| `get_runtime_config` | Get runtime config |
| `get_cleanup_settings` | Get nuke config |
| `update_cleanup_settings` | Update nuke config |
| `get_cleanup_hook` | Get cleanup hook script |
| `update_cleanup_hook` | Update cleanup hook |
| `get_email_settings` | Get email templates |
| `update_email_settings` | Update email templates |
| `send_test_email` | Send test email |
| `get_smtp_settings` | Get SMTP config |
| `update_smtp_settings` | Update SMTP config |

### Users & Identity
| Tool | Description |
|------|-------------|
| `list_users` | List users from identity provider |
| `list_groups` | List groups from identity provider |
| `validate_users` | Validate user IDs exist |
| `update_preferences` | Update user preferences |
| `list_all_oauth_clients` | List all OAuth clients (admin) |
| `list_my_oauth_clients` | List your OAuth clients |
| `create_oauth_client` | Create an OAuth client |
| `update_oauth_client` | Update an OAuth client |
| `delete_oauth_client` | Delete an OAuth client |
| `get_terms_of_service` | Get current terms of service |
| `list_terms_versions` | List ToS versions |
| `get_terms_version` | Get specific ToS version |
| `publish_terms_of_service` | Publish new ToS |
| `get_tags` | Get all template tags |
| `validate_s3_path` | Validate an S3 path |

## Project Structure

```
src/
├── index.ts          # Entry point — registers all tools, connects via stdio
├── config.ts         # Config file management (~/.sandbox-studio-mcp/config.json)
├── auth.ts           # OAuth2 client_credentials token management
├── client.ts         # HTTP client with auth, retry, and HTML detection
├── init-config.ts    # Interactive config setup CLI
└── tools/
    ├── leases.ts     # Lease lifecycle tools
    ├── accounts.ts   # Account pool management
    ├── templates.ts  # Template configuration (with AI guidance)
    ├── events.ts     # Events, approvals, reporting, admin jobs
    ├── settings.ts   # Cleanup, email, SMTP, global config
    └── users.ts      # Users, groups, OAuth clients, ToS, tags
```

## Development

```bash
# Build
pnpm build

# Watch mode (rebuild on change)
pnpm dev

# Run directly
node dist/index.js
```

## Extending

### Adding a new tool

1. Choose the appropriate file in `src/tools/`
2. Register the tool with `server.registerTool(name, schema, handler)`
3. Use `apiRequest(config, options)` to call the Sandbox Studio API

### Adding AI guidance

Use the tool's `description` field to influence AI behaviour:

```typescript
server.registerTool("my_tool", {
  description: `Do something.

IMPORTANT: Always ask the user about X before calling this tool.
Never do Y without explicit confirmation.`,
  inputSchema: { ... }
}, handler);
```

This is the primary mechanism for shaping how AI assistants use your tools.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| HTML responses instead of JSON | Check that `instanceUrl` in config is correct (e.g. `https://sandbox.example.com` without a trailing path) |
| 401 errors | Verify client credentials are valid and the OAuth client is active |
| Token refresh loops | The OAuth client may have been deleted — recreate in admin panel |
| Tools not appearing | Rebuild (`pnpm build`) and restart the MCP server |

## License

MIT
