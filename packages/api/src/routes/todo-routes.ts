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
import { users } from '@askhumantowork/db';
import { requireAuth, requireScope } from '../auth.js';

export function registerTodoRoutes(app: FastifyInstance, ctx: AppContext) {
  const todoSvc = new TodoService(ctx);
  const agendaSvc = new AgendaService(ctx);
  const projectSvc = new ProjectService(ctx);
  const reminderSvc = new ReminderService(ctx);
  const auth = requireAuth(ctx);

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof UserFacingError) return reply.code(400).send({ error: err.message });
    if (err.name === 'ZodError') return reply.code(400).send({ error: 'validation', details: err });
    app.log.error(err);
    return reply.code(500).send({ error: 'internal error' });
  });

  app.get('/api/todos', { preHandler: [auth, requireScope('todos:read')] }, async (req) => {
    const query = listTodosQuerySchema.parse(req.query);
    return { todos: await todoSvc.list(req.auth!.userId, query) };
  });

  app.post('/api/todos', { preHandler: [auth, requireScope('todos:write')] }, async (req, reply) => {
    const input = createTodoInputSchema.parse(req.body);
    const source = req.auth!.via === 'token' && req.auth!.agentName !== 'mobile-device' ? 'ai' : 'human';
    const result = await todoSvc.create(req.auth!.userId, input, {
      source: (req.headers['x-todo-source'] as 'human' | 'ai') ?? source,
      agent: req.headers['x-agent-name'] as string | undefined,
    });
    return reply.code(result.deduplicated ? 200 : 201).send(result);
  });

  app.get('/api/todos/:id', { preHandler: [auth, requireScope('todos:read')] }, async (req) => {
    const { id } = req.params as { id: string };
    return { todo: await todoSvc.getById(req.auth!.userId, id) };
  });

  app.patch('/api/todos/:id', { preHandler: [auth, requireScope('todos:write')] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = updateTodoInputSchema.parse(req.body);
    return { todo: await todoSvc.update(req.auth!.userId, id, input) };
  });

  app.post(
    '/api/todos/:id/complete',
    { preHandler: [auth, requireScope('todos:write')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return { todo: await todoSvc.complete(req.auth!.userId, id) };
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
      await todoSvc.getById(req.auth!.userId, id); // ownership check
      await reminderSvc.snooze(id, resolved, user!.notificationPrefs);
      return { ok: true, until: resolved.toISOString() };
    },
  );

  app.delete('/api/todos/:id', { preHandler: [auth, requireScope('todos:write')] }, async (req) => {
    const { id } = req.params as { id: string };
    await todoSvc.remove(req.auth!.userId, id);
    return { ok: true };
  });

  app.get('/api/agenda', { preHandler: [auth, requireScope('todos:read')] }, async (req) => {
    return agendaSvc.forUser(req.auth!.userId);
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
}
