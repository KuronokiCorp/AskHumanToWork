#!/usr/bin/env node
/**
 * AskHumanToWork stdio MCP server.
 *
 * Claude Desktop / Claude Code config:
 *   command: node <repo>/packages/mcp/dist/bin.js
 *   env: TODO_API_TOKEN=tfa_... TODO_API_URL=http://localhost:3000
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createTodoMcpServer } from './tools.js';
import { RestTodoClient } from './client-rest.js';

const token = process.env.TODO_API_TOKEN;
if (!token) {
  console.error('TODO_API_TOKEN env var is required (create one in the web app → Settings → API tokens)');
  process.exit(1);
}
const apiUrl = process.env.TODO_API_URL ?? 'http://localhost:3000';
const webUrl = process.env.TODO_WEB_URL ?? 'http://localhost:5173';
const agent = process.env.TODO_AGENT_NAME ?? 'mcp-stdio';

const client = new RestTodoClient(apiUrl, token, agent, webUrl);
const server = createTodoMcpServer(client);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`askhumantowork MCP server running (stdio) → ${apiUrl}`);
