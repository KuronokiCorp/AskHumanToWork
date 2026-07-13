#!/usr/bin/env node
/**
 * HeyHuman stdio MCP server — a thin HTTP client for the hosted API.
 * No database, no local server required: it just needs your API token.
 *
 * Claude Desktop / Claude Code config:
 *   command: npx -y heyhuman-mcp
 *   env: TODO_API_TOKEN=tfa_...            (create in the web app → Settings → API tokens)
 *        TODO_API_URL=...                  (optional — defaults to the hosted app)
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createTodoMcpServer } from './tools.js';
import { RestTodoClient } from './client-rest.js';

/** Hosted API — the connector talks to this by default; no local stack needed. */
const DEFAULT_API_URL = 'https://askhumantowork--askhumantowork.asia-east1.hosted.app';

const token = process.env.TODO_API_TOKEN;
if (!token) {
  console.error('TODO_API_TOKEN env var is required (create one in the web app → Settings → API tokens)');
  process.exit(1);
}
const apiUrl = process.env.TODO_API_URL ?? DEFAULT_API_URL;
const webUrl = process.env.TODO_WEB_URL ?? apiUrl;
const agent = process.env.TODO_AGENT_NAME ?? 'mcp-stdio';

const client = new RestTodoClient(apiUrl, token, agent, webUrl);
const server = createTodoMcpServer(client);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`HeyHuman MCP server running (stdio) → ${apiUrl}`);
