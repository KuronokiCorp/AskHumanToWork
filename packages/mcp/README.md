# askhumantowork-mcp

MCP server for [AskHumanToWork](https://github.com/) — the todo hub where **AI agents capture your
todos** (with due dates and "why this exists" provenance) and the system **reminds you until they're
done**.

This package is the stdio MCP connector. It talks to your AskHumanToWork server over its REST API.

## Setup

1. In the AskHumanToWork web app: **Settings → API tokens → Create token**. Copy the `tfa_...` token.
2. Add the server to your MCP client:

**Claude Code**

```bash
claude mcp add askhumantowork \
  --env TODO_API_TOKEN=tfa_... \
  --env TODO_API_URL=https://your-server.example.com \
  -- npx -y askhumantowork-mcp
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "askhumantowork": {
      "command": "npx",
      "args": ["-y", "askhumantowork-mcp"],
      "env": {
        "TODO_API_TOKEN": "tfa_...",
        "TODO_API_URL": "https://your-server.example.com"
      }
    }
  }
}
```

Environment variables: `TODO_API_TOKEN` (required), `TODO_API_URL` (default `http://localhost:3000`),
`TODO_WEB_URL` (deep-link base, default `http://localhost:5173`), `TODO_AGENT_NAME` (shown as the
todo's provenance, default `mcp-stdio`).

Prefer a remote connection with no local install? AskHumanToWork also serves Streamable HTTP MCP at
`POST <server>/mcp` with `Authorization: Bearer <token>`.

## Tools

`add_todo` · `list_todos` · `search_todos` · `update_todo` · `complete_todo` · `reschedule_todo` ·
`get_agenda` · `list_projects` · `list_integrations` · `resolve_time`

Natural-language due dates ("friday 5pm", "in 3 days") are resolved **server-side in your timezone**,
adds are idempotent (10-minute dedup window), and every AI-created todo carries `origin_context` so
you remember *why* it exists when the reminder fires.

Resources: `todo://agenda/today`, `todo://agenda/overdue`, `todo://projects`
Prompts: `capture-followups`, `review-my-todos`
