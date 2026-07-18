import type { FastifyInstance } from 'fastify';
import {
  AgendaService,
  ProjectService,
  ReminderService,
  TodoService,
  UserFacingError,
  type AppContext,
} from '@askhumantowork/core';
import {
  createTodoInputSchema,
  listTodosQuerySchema,
  resolveNaturalDate,
  updateTodoInputSchema,
} from '@askhumantowork/shared';
import { eq } from 'drizzle-orm';
import { todos, users } from '@askhumantowork/db';
import { verifyAction } from '@askhumantowork/core';
import { requireAuth, requireScope, tokenProjectScope } from '../auth.js';

export function registerTodoRoutes(app: FastifyInstance, ctx: AppContext) {
  const todoSvc = new TodoService(ctx);
  const agendaSvc = new AgendaService(ctx);
  const projectSvc = new ProjectService(ctx);
  const reminderSvc = new ReminderService(ctx);
  const auth = requireAuth(ctx);

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof UserFacingError) return reply.code(400).send({ error: err.message });
    if (err.name === 'ZodError') return reply.code(400).send({ error: 'validation', details: err });
    // Errors with an explicit status (rate limit 429, fastify 4xx) pass through.
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    app.log.error(err);
    return reply.code(500).send({ error: 'internal error' });
  });

  app.get('/api/todos', { preHandler: [auth, requireScope('todos:read')] }, async (req) => {
    const query = listTodosQuerySchema.parse(req.query);
    return { todos: await todoSvc.list(req.auth!.userId, query, tokenProjectScope(req.auth)) };
  });

  app.post('/api/todos', { preHandler: [auth, requireScope('todos:write')] }, async (req, reply) => {
    const input = createTodoInputSchema.parse(req.body);
    const viaToken = req.auth!.via === 'token' && req.auth!.agentName !== 'mobile-device';
    const source = viaToken ? 'ai' : 'human';
    const result = await todoSvc.create(
      req.auth!.userId,
      input,
      {
        source: (req.headers['x-todo-source'] as 'human' | 'ai') ?? source,
        agent: req.headers['x-agent-name'] as string | undefined,
        // Authoritative "which device/app" = the token name the user chose.
        tokenName: viaToken ? req.auth!.agentName : undefined,
      },
      tokenProjectScope(req.auth),
    );
    return reply.code(result.deduplicated ? 200 : 201).send(result);
  });

  app.get('/api/todos/:id', { preHandler: [auth, requireScope('todos:read')] }, async (req) => {
    const { id } = req.params as { id: string };
    return { todo: await todoSvc.getById(req.auth!.userId, id, tokenProjectScope(req.auth)) };
  });

  app.patch('/api/todos/:id', { preHandler: [auth, requireScope('todos:write')] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = updateTodoInputSchema.parse(req.body);
    return { todo: await todoSvc.update(req.auth!.userId, id, input, tokenProjectScope(req.auth)) };
  });

  app.post(
    '/api/todos/:id/complete',
    { preHandler: [auth, requireScope('todos:write')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return { todo: await todoSvc.complete(req.auth!.userId, id, tokenProjectScope(req.auth)) };
    },
  );

  app.post(
    '/api/todos/:id/snooze',
    { preHandler: [auth, requireScope('todos:write')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { until } = req.body as { until: string };
      const user = await ctx.db.query.users.findFirst({ where: eq(users.id, req.auth!.userId) });
      const resolved = resolveNaturalDate(until, user!.timezone) ?? new Date(until);
      if (Number.isNaN(resolved.getTime())) {
        return reply.code(400).send({ error: `cannot parse snooze time: ${until}` });
      }
      await todoSvc.getById(req.auth!.userId, id, tokenProjectScope(req.auth)); // ownership check
      await reminderSvc.snooze(id, resolved, user!.notificationPrefs);
      return { ok: true, until: resolved.toISOString() };
    },
  );

  app.delete('/api/todos/:id', { preHandler: [auth, requireScope('todos:write')] }, async (req) => {
    const { id } = req.params as { id: string };
    await todoSvc.remove(req.auth!.userId, id, tokenProjectScope(req.auth));
    return { ok: true };
  });

  app.get('/api/agenda', { preHandler: [auth, requireScope('todos:read')] }, async (req) => {
    return agendaSvc.forUser(req.auth!.userId, tokenProjectScope(req.auth));
  });

  /**
   * Session-start briefing for agents: diff since this token's previous use
   * (completed / added), blocked todos with reasons, and ranked next steps.
   * `?since=ISO` overrides the marker (useful for sessions and testing).
   */
  app.get('/api/briefing', { preHandler: [auth, requireScope('todos:read')] }, async (req) => {
    const { since: sinceParam } = req.query as { since?: string };
    const parsed = sinceParam ? new Date(sinceParam) : null;
    const since =
      parsed && !Number.isNaN(parsed.getTime())
        ? parsed
        : (req.auth!.prevUsedAt ?? new Date(Date.now() - 24 * 3_600_000));
    return agendaSvc.briefingForUser(req.auth!.userId, tokenProjectScope(req.auth), since);
  });

  app.get('/api/projects', { preHandler: [auth, requireScope('projects:read')] }, async (req) => {
    return { projects: await projectSvc.list(req.auth!.userId) };
  });

  app.post('/api/projects', { preHandler: [auth, requireScope('todos:write')] }, async (req) => {
    const { name, color } = req.body as { name: string; color?: string };
    return { project: await projectSvc.create(req.auth!.userId, name, color) };
  });

  app.get('/api/reminders/pending', { preHandler: [auth, requireScope('todos:read')] }, async (req) => {
    return { reminders: await reminderSvc.pendingForUser(req.auth!.userId) };
  });

  /**
   * One-click actions from reminder emails / push notification buttons.
   * No session — authenticated by an HMAC signature scoped to (todo, action, expiry).
   */
  app.get('/api/todos/:id/action', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { action, exp, sig } = req.query as { action?: string; exp?: string; sig?: string };
    if (!action || !exp || !sig || !verifyAction(id, action, Number(exp), sig)) {
      return reply.code(403).type('text/html').send('<p>Link expired or invalid.</p>');
    }
    const row = await ctx.db.query.todos.findFirst({ where: eq(todos.id, id) });
    if (!row) return reply.code(404).type('text/html').send('<p>Todo not found.</p>');

    const user = await ctx.db.query.users.findFirst({ where: eq(users.id, row.ownerId) });
    let message = '';
    if (action === 'complete') {
      if (row.status !== 'done') await todoSvc.complete(row.ownerId, id);
      message = `✓ Completed: ${row.title}`;
    } else if (action === 'snooze1h' || action === 'snooze1d') {
      const until = new Date(Date.now() + (action === 'snooze1h' ? 3_600_000 : 24 * 3_600_000));
      await reminderSvc.snooze(id, until, user?.notificationPrefs);
      message = `💤 Snoozed until ${until.toLocaleString('en-US', { timeZone: user?.timezone })}: ${row.title}`;
    } else {
      return reply.code(400).type('text/html').send('<p>Unknown action.</p>');
    }
    return reply.type('text/html').send(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
       <body style="font-family:system-ui;display:grid;place-items:center;height:90vh;background:#fafafa">
       <div style="text-align:center"><div style="font-size:40px">✅</div>
       <p style="font-size:15px;color:#3f3f46">${message}</p>
       <p style="font-size:12px;color:#a1a1aa">You can close this tab.</p></div>`,
    );
  });
}
