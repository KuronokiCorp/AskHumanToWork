import type { FastifyInstance } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createTodoMcpServer, type IntegrationInfo, type TodoClient } from 'askhumantowork-mcp';
import {
  AgendaService,
  ProjectService,
  TodoService,
  adapters,
  type AppContext,
} from '@askhumantowork/core';
import {
  formatInTimezone,
  resolveNaturalDate,
  type CreateTodoInput,
  type ListTodosQuery,
  type UpdateTodoInput,
} from '@askhumantowork/shared';
import { eq } from 'drizzle-orm';
import { integrations, users } from '@askhumantowork/db';
import { resolveBearer } from './auth.js';
import { env } from './env.js';

/** In-process TodoClient: MCP tools call core services directly. */
class CoreTodoClient implements TodoClient {
  private todoSvc: TodoService;
  private agendaSvc: AgendaService;
  private projectSvc: ProjectService;

  constructor(
    private ctx: AppContext,
    private userId: string,
    private agent: string,
  ) {
    this.todoSvc = new TodoService(ctx);
    this.agendaSvc = new AgendaService(ctx);
    this.projectSvc = new ProjectService(ctx);
  }

  webBaseUrl() {
    return env.webBaseUrl;
  }

  agentName() {
    return this.agent;
  }

  async addTodo(input: CreateTodoInput) {
    const result = await this.todoSvc.create(this.userId, input, { source: 'ai', agent: this.agent });
    return { todo: result.todo, deduplicated: result.deduplicated, sync: result.sync };
  }

  async listTodos(query: Partial<ListTodosQuery>) {
    return this.todoSvc.list(this.userId, { limit: 50, offset: 0, ...query });
  }

  async getTodo(id: string) {
    return this.todoSvc.getById(this.userId, id);
  }

  async updateTodo(id: string, input: UpdateTodoInput) {
    return this.todoSvc.update(this.userId, id, input);
  }

  async completeTodo(id: string) {
    return this.todoSvc.complete(this.userId, id);
  }

  async getAgenda() {
    return this.agendaSvc.forUser(this.userId);
  }

  async listProjects() {
    const rows = await this.projectSvc.list(this.userId);
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      archived: p.archived,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  async listIntegrations(): Promise<IntegrationInfo[]> {
    const rows = await this.ctx.db.query.integrations.findMany({
      where: eq(integrations.userId, this.userId),
    });
    return rows.map((r) => ({
      provider: r.provider,
      displayName: adapters[r.provider].displayName,
      status: r.status,
      capabilities: adapters[r.provider].capabilities as unknown as Record<string, boolean>,
    }));
  }

  async resolveTime(text: string) {
    const user = await this.ctx.db.query.users.findFirst({ where: eq(users.id, this.userId) });
    if (!user) return null;
    const resolved = resolveNaturalDate(text, user.timezone);
    if (!resolved) return null;
    return {
      iso: resolved.toISOString(),
      display: formatInTimezone(resolved, user.timezone),
      timezone: user.timezone,
    };
  }
}

/**
 * Streamable HTTP MCP endpoint (stateless mode: a fresh server+transport per
 * request, authenticated by PAT bearer). Remote MCP clients point here.
 */
export function registerMcpHttp(app: FastifyInstance, ctx: AppContext) {
  app.post('/mcp', async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Authorization: Bearer <token> required' },
        id: null,
      });
    }
    const auth = await resolveBearer(ctx, header.slice(7));
    if (!auth) {
      return reply.code(401).send({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'invalid token' },
        id: null,
      });
    }

    const client = new CoreTodoClient(ctx, auth.userId, auth.agentName ?? 'mcp-http');
    const server = createTodoMcpServer(client);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
    reply.hijack();
  });

  // Stateless server: no SSE stream or session teardown.
  app.get('/mcp', async (_req, reply) => reply.code(405).send({ error: 'method not allowed' }));
  app.delete('/mcp', async (_req, reply) => reply.code(405).send({ error: 'method not allowed' }));
}
