import { and, desc, eq, gte, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import { projects, todos, users } from '@askhumantowork/db';
import {
  nextOccurrence,
  parseRecurrence,
  resolveNaturalDate,
  type CreateTodoInput,
  type ListTodosQuery,
  type Provider,
  type Recurrence,
  type Todo,
  type UpdateTodoInput,
} from '@askhumantowork/shared';
import type { AppContext } from './context.js';
import { ProjectService } from './project-service.js';
import { ReminderService } from './reminder-service.js';
import { serializeTodo } from './serializers.js';
import { sha256 } from './crypto.js';
import { enqueueTodoSync } from './integrations/outbox.js';

const DEDUP_WINDOW_MS = 10 * 60_000;

export interface CreateTodoResult {
  todo: Todo;
  deduplicated: boolean;
  sync: { provider: Provider; status: 'queued' | 'skipped' }[];
}

export class TodoService {
  private projectSvc: ProjectService;
  private reminderSvc: ReminderService;

  constructor(private ctx: AppContext) {
    this.projectSvc = new ProjectService(ctx);
    this.reminderSvc = new ReminderService(ctx);
  }

  private async getUser(userId: string) {
    const user = await this.ctx.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new Error('user not found');
    return user;
  }

  private resolveDue(
    input: { dueNatural?: string; dueAt?: string | null },
    timezone: string,
  ): Date | null | undefined {
    if (input.dueNatural) {
      const resolved = resolveNaturalDate(input.dueNatural, timezone);
      if (!resolved) throw new UserFacingError(`Could not parse due date: "${input.dueNatural}"`);
      return resolved;
    }
    if (input.dueAt === null) return null;
    if (input.dueAt) return new Date(input.dueAt);
    return undefined;
  }

  async create(
    userId: string,
    input: CreateTodoInput,
    meta: { source: 'human' | 'ai'; agent?: string; tokenName?: string } = { source: 'human' },
  ): Promise<CreateTodoResult> {
    const user = await this.getUser(userId);
    let dueAt = this.resolveDue(input, user.timezone) ?? null;

    const project = input.project
      ? await this.projectSvc.resolveByName(userId, input.project)
      : null;

    // Idempotency: identical title+due+project within the window returns the existing todo.
    const dedupHash = sha256(
      `${input.title.trim().toLowerCase()}|${dueAt?.toISOString() ?? ''}|${project?.id ?? ''}`,
    );
    const existing = await this.ctx.db.query.todos.findFirst({
      where: and(
        eq(todos.ownerId, userId),
        eq(todos.dedupHash, dedupHash),
        gte(todos.createdAt, new Date(Date.now() - DEDUP_WINDOW_MS)),
      ),
    });
    if (existing) {
      return { todo: serializeTodo(existing, project), deduplicated: true, sync: [] };
    }

    let recurrence: Recurrence | null = null;
    if (input.repeat) {
      recurrence = parseRecurrence(input.repeat);
      if (!recurrence) throw new UserFacingError(`Could not parse recurrence: "${input.repeat}"`);
      if (!dueAt) {
        // No explicit due: derive the first occurrence from the rule (09:00 local baseline).
        const baseline = resolveNaturalDate('today 9am', user.timezone) ?? new Date();
        dueAt = nextOccurrence(recurrence, baseline);
      }
    }

    const [row] = await this.ctx.db
      .insert(todos)
      .values({
        ownerId: userId,
        projectId: project?.id ?? null,
        title: input.title.trim(),
        notes: input.notes ?? null,
        dueAt,
        priority: input.priority ?? 0,
        source: meta.source,
        createdByAgent: meta.agent ?? null,
        createdByToken: meta.tokenName ?? null,
        originContext: input.originContext ?? null,
        tags: input.tags ?? [],
        recurrence,
        dedupHash,
      })
      .returning();
    if (!row) throw new Error('insert failed');

    const explicit = input.reminders
      ?.map((r) => resolveNaturalDate(r, user.timezone) ?? new Date(r))
      .filter((d) => !Number.isNaN(d.getTime()));
    await this.reminderSvc.scheduleForTodo(row.id, {
      dueAt,
      explicit,
      notificationPrefs: user.notificationPrefs,
    });

    const sync = await enqueueTodoSync(this.ctx, row, 'create', input.syncTo);
    return { todo: serializeTodo(row, project), deduplicated: false, sync };
  }

  async update(userId: string, todoId: string, input: UpdateTodoInput): Promise<Todo> {
    const user = await this.getUser(userId);
    const current = await this.getOwnedRow(userId, todoId);

    const dueAt = this.resolveDue(input, user.timezone);
    const project =
      input.project === null
        ? null
        : input.project
          ? await this.projectSvc.resolveByName(userId, input.project)
          : undefined;

    const patch: Partial<typeof todos.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.notes !== undefined) patch.notes = input.notes;
    if (dueAt !== undefined) patch.dueAt = dueAt;
    if (project !== undefined) patch.projectId = project?.id ?? null;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.status !== undefined) {
      patch.status = input.status;
      patch.completedAt = input.status === 'done' ? new Date() : null;
    }
    if (input.repeat !== undefined) {
      if (input.repeat === null) {
        patch.recurrence = null;
      } else {
        const rule = parseRecurrence(input.repeat);
        if (!rule) throw new UserFacingError(`Could not parse recurrence: "${input.repeat}"`);
        patch.recurrence = rule;
      }
    }

    const [row] = await this.ctx.db
      .update(todos)
      .set(patch)
      .where(and(eq(todos.id, todoId), eq(todos.ownerId, userId)))
      .returning();
    if (!row) throw new UserFacingError('todo not found');

    if (input.status === 'done' || input.status === 'cancelled') {
      await this.reminderSvc.cancelForTodo(todoId);
      await enqueueTodoSync(this.ctx, row, input.status === 'done' ? 'complete' : 'update');
      // Recurring: completing spawns the next occurrence (same fields, next due).
      if (input.status === 'done' && row.recurrence && row.dueAt) {
        await this.spawnNextOccurrence(user, row);
      }
    } else {
      if (dueAt !== undefined && dueAt?.getTime() !== current.dueAt?.getTime()) {
        await this.reminderSvc.scheduleForTodo(todoId, {
          dueAt: dueAt ?? null,
          notificationPrefs: user.notificationPrefs,
        });
      }
      await enqueueTodoSync(this.ctx, row, 'update');
    }
    return this.getById(userId, row.id);
  }

  async complete(userId: string, todoId: string): Promise<Todo> {
    return this.update(userId, todoId, { status: 'done' });
  }

  async remove(userId: string, todoId: string): Promise<void> {
    const row = await this.getOwnedRow(userId, todoId);
    await this.reminderSvc.cancelForTodo(todoId);
    await enqueueTodoSync(this.ctx, row, 'delete');
    await this.ctx.db.delete(todos).where(and(eq(todos.id, todoId), eq(todos.ownerId, userId)));
  }

  async getById(userId: string, todoId: string): Promise<Todo> {
    const rows = await this.ctx.db
      .select({ todo: todos, projectName: projects.name })
      .from(todos)
      .leftJoin(projects, eq(todos.projectId, projects.id))
      .where(and(eq(todos.id, todoId), eq(todos.ownerId, userId)))
      .limit(1);
    const r = rows[0];
    if (!r) throw new UserFacingError('todo not found');
    return serializeTodo(r.todo, r.projectName ? { name: r.projectName } : null);
  }

  async list(userId: string, query: ListTodosQuery): Promise<Todo[]> {
    const conditions: SQL[] = [eq(todos.ownerId, userId)];
    if (query.status) conditions.push(eq(todos.status, query.status));
    if (query.source) conditions.push(eq(todos.source, query.source));
    if (query.dueBefore) conditions.push(lt(todos.dueAt, new Date(query.dueBefore)));
    if (query.overdue) {
      conditions.push(lt(todos.dueAt, new Date()), eq(todos.status, 'open'), isNotNull(todos.dueAt));
    }
    if (query.tags?.length) {
      conditions.push(sql`${todos.tags} && ${query.tags}`);
    }
    if (query.project) {
      const project = await new ProjectService(this.ctx).resolveByName(userId, query.project);
      if (project) conditions.push(eq(todos.projectId, project.id));
    }
    if (query.search) {
      conditions.push(
        sql`to_tsvector('simple', coalesce(${todos.title}, '') || ' ' || coalesce(${todos.notes}, '')) @@ plainto_tsquery('simple', ${query.search})`,
      );
    }

    const rows = await this.ctx.db
      .select({ todo: todos, projectName: projects.name })
      .from(todos)
      .leftJoin(projects, eq(todos.projectId, projects.id))
      .where(and(...conditions))
      .orderBy(sql`${todos.dueAt} ASC NULLS LAST`, desc(todos.priority), desc(todos.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return rows.map((r) => serializeTodo(r.todo, r.projectName ? { name: r.projectName } : null));
  }

  /** Create the next occurrence of a completed recurring todo. */
  private async spawnNextOccurrence(
    user: typeof users.$inferSelect,
    completed: typeof todos.$inferSelect,
  ): Promise<void> {
    const rule = completed.recurrence as Recurrence;
    const nextDue = nextOccurrence(rule, completed.dueAt!);
    const dedupHash = sha256(
      `${completed.title.trim().toLowerCase()}|${nextDue.toISOString()}|${completed.projectId ?? ''}`,
    );
    // Idempotent: if the next occurrence already exists (double-complete race), skip.
    const existing = await this.ctx.db.query.todos.findFirst({
      where: and(eq(todos.ownerId, user.id), eq(todos.dedupHash, dedupHash), eq(todos.status, 'open')),
    });
    if (existing) return;

    const [next] = await this.ctx.db
      .insert(todos)
      .values({
        ownerId: user.id,
        projectId: completed.projectId,
        title: completed.title,
        notes: completed.notes,
        dueAt: nextDue,
        priority: completed.priority,
        source: completed.source,
        createdByAgent: completed.createdByAgent,
        createdByToken: completed.createdByToken,
        originContext: completed.originContext,
        tags: completed.tags,
        recurrence: rule,
        dedupHash,
      })
      .returning();
    if (!next) return;
    await this.reminderSvc.scheduleForTodo(next.id, {
      dueAt: nextDue,
      notificationPrefs: user.notificationPrefs,
    });
    await enqueueTodoSync(this.ctx, next, 'create');
  }

  private async getOwnedRow(userId: string, todoId: string) {
    const row = await this.ctx.db.query.todos.findFirst({
      where: and(eq(todos.id, todoId), eq(todos.ownerId, userId)),
    });
    if (!row) throw new UserFacingError('todo not found');
    return row;
  }
}

/** Errors safe to surface to API/MCP clients. */
export class UserFacingError extends Error {}
