import { and, eq } from 'drizzle-orm';
import { integrations, reminders, syncJobs, todoLinks, todos } from '@askhumantowork/db';
import type { AppContext } from '../context.js';
import { sha256 } from '../crypto.js';
import { adapters, getConnection } from './registry.js';
import { canUseIntegrations } from '../entitlements.js';
import type { ExternalChange, TodoRow } from './adapter.js';

const MAX_ATTEMPTS = 5;

function provenanceFooter(todo: TodoRow, webBaseUrl: string): string {
  const parts: string[] = [];
  if (todo.source === 'ai') {
    parts.push(`Added by ${todo.createdByAgent ?? 'an AI agent'} via AskHumanToWork`);
    if (todo.originContext) parts.push(`Why: ${todo.originContext}`);
  }
  parts.push(`${webBaseUrl}/t/${todo.id}`);
  return `— ${parts.join(' · ')}`;
}

function pushHash(todo: TodoRow): string {
  return sha256(
    `${todo.title}|${todo.notes ?? ''}|${todo.dueAt?.toISOString() ?? ''}|${todo.status}|${todo.priority}|${todo.tags.join(',')}`,
  );
}

/** Drain one outbound sync job (called from the BullMQ 'sync' worker). */
export async function runSyncJob(ctx: AppContext, syncJobId: string): Promise<void> {
  const job = await ctx.db.query.syncJobs.findFirst({ where: eq(syncJobs.id, syncJobId) });
  if (!job || job.status === 'done') return;

  const integration = await ctx.db.query.integrations.findFirst({
    where: eq(integrations.id, job.integrationId),
  });
  if (!integration || integration.status !== 'active') {
    await ctx.db.update(syncJobs).set({ status: 'failed', lastError: 'integration inactive' })
      .where(eq(syncJobs.id, syncJobId));
    return;
  }

  await ctx.db.update(syncJobs).set({ status: 'running', attempts: job.attempts + 1 })
    .where(eq(syncJobs.id, syncJobId));

  try {
    const adapter = adapters[integration.provider];
    const conn = await getConnection(ctx, integration);
    const todo = job.todoId
      ? await ctx.db.query.todos.findFirst({ where: eq(todos.id, job.todoId) })
      : null;

    const link = job.todoId
      ? await ctx.db.query.todoLinks.findFirst({
          where: and(eq(todoLinks.todoId, job.todoId), eq(todoLinks.integrationId, integration.id)),
        })
      : null;

    const webBaseUrl = process.env.WEB_BASE_URL ?? 'http://localhost:5173';

    if (job.action === 'delete') {
      if (link) {
        await adapter.deleteTask(conn, { externalId: link.externalId, externalListId: link.externalListId ?? undefined });
        await ctx.db.delete(todoLinks).where(
          and(eq(todoLinks.todoId, link.todoId), eq(todoLinks.integrationId, integration.id)),
        );
      }
    } else if (!todo) {
      throw new Error('todo not found for sync job');
    } else if (job.action === 'create' || (job.action === 'update' && !link)) {
      if (link) return; // already created (retry after partial success)
      const hash = pushHash(todo);
      const ref = await adapter.createTask(conn, todo, provenanceFooter(todo, webBaseUrl));
      await ctx.db.insert(todoLinks).values({
        todoId: todo.id,
        integrationId: integration.id,
        externalId: ref.externalId,
        externalListId: ref.externalListId,
        etag: ref.etag,
        lastPushedHash: hash,
        syncStatus: 'synced',
      }).onConflictDoNothing();
    } else if (job.action === 'complete') {
      if (link) {
        await adapter.completeTask(conn, { externalId: link.externalId, externalListId: link.externalListId ?? undefined });
        await ctx.db.update(todoLinks).set({ syncStatus: 'synced', updatedAt: new Date() })
          .where(and(eq(todoLinks.todoId, todo.id), eq(todoLinks.integrationId, integration.id)));
      }
    } else if (job.action === 'update' && link) {
      const hash = pushHash(todo);
      if (link.lastPushedHash === hash) {
        // no-op: nothing changed that the provider can see
      } else {
        const ref = await adapter.updateTask(
          conn,
          { externalId: link.externalId, externalListId: link.externalListId ?? undefined, etag: link.etag ?? undefined },
          todo,
          provenanceFooter(todo, webBaseUrl),
        );
        await ctx.db.update(todoLinks)
          .set({ etag: ref.etag, lastPushedHash: hash, syncStatus: 'synced', updatedAt: new Date() })
          .where(and(eq(todoLinks.todoId, todo.id), eq(todoLinks.integrationId, integration.id)));
      }
    }

    await ctx.db.update(syncJobs).set({ status: 'done', lastError: null }).where(eq(syncJobs.id, syncJobId));
    await ctx.db.update(integrations).set({ lastSyncAt: new Date(), lastError: null })
      .where(eq(integrations.id, integration.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    await ctx.db.update(syncJobs)
      .set({
        status: failed ? 'failed' : 'queued',
        lastError: message,
        nextRetryAt: failed ? null : new Date(Date.now() + 2 ** attempts * 30_000),
      })
      .where(eq(syncJobs.id, syncJobId));
    await ctx.db.update(integrations).set({ lastError: message }).where(eq(integrations.id, integration.id));
    if (!failed) {
      // exponential backoff re-enqueue
      await ctx.queues.sync.add('outbound', { syncJobId }, { delay: 2 ** attempts * 30_000 });
    }
    if (failed) throw err;
  }
}

/** Apply one inbound change from a provider to our DB (loop-safe: no outbound echo). */
async function applyInboundChange(
  ctx: AppContext,
  integrationId: string,
  change: ExternalChange,
): Promise<void> {
  const link = await ctx.db.query.todoLinks.findFirst({
    where: and(eq(todoLinks.integrationId, integrationId), eq(todoLinks.externalId, change.externalId)),
  });
  if (!link) return; // task not managed by us — we don't import provider-only tasks in v1

  const todo = await ctx.db.query.todos.findFirst({ where: eq(todos.id, link.todoId) });
  if (!todo) return;

  if (change.deleted) {
    await ctx.db.delete(todoLinks).where(
      and(eq(todoLinks.todoId, link.todoId), eq(todoLinks.integrationId, integrationId)),
    );
    return;
  }

  // The critical case: completed externally → complete here + cancel reminders.
  if (change.completed && todo.status !== 'done') {
    await ctx.db.update(todos)
      .set({ status: 'done', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(todos.id, todo.id));
    const pending = await ctx.db.query.reminders.findMany({
      where: (r, { eq: e, and: a }) => a(e(r.todoId, todo.id), e(r.status, 'pending')),
    });
    for (const r of pending) {
      await ctx.db.update(reminders).set({ status: 'cancelled' }).where(eq(reminders.id, r.id));
      const qjob = await ctx.queues.reminders.getJob(r.id);
      await qjob?.remove().catch(() => {});
    }
  } else if (change.completed === false && todo.status === 'done') {
    // reopened externally
    await ctx.db.update(todos)
      .set({ status: 'open', completedAt: null, updatedAt: new Date() })
      .where(eq(todos.id, todo.id));
  }

  if (change.etag) {
    await ctx.db.update(todoLinks).set({ etag: change.etag, updatedAt: new Date() })
      .where(and(eq(todoLinks.todoId, link.todoId), eq(todoLinks.integrationId, integrationId)));
  }
}

/** Poll all active two-way integrations for inbound changes. */
export async function runInboundPollers(ctx: AppContext): Promise<void> {
  const active = await ctx.db.query.integrations.findMany({
    where: eq(integrations.status, 'active'),
  });
  for (const integration of active) {
    const cfg = integration.config as { direction?: string };
    if (cfg.direction === 'outbound') continue; // one-way only
    if (!(await canUseIntegrations(ctx, integration.userId))) continue; // pro feature
    try {
      const adapter = adapters[integration.provider];
      const conn = await getConnection(ctx, integration);
      const { changes, cursor } = await adapter.listChanges(conn, integration.syncCursor);
      for (const change of changes) {
        await applyInboundChange(ctx, integration.id, change);
      }
      await ctx.db.update(integrations)
        .set({ syncCursor: cursor, lastSyncAt: new Date(), lastError: null })
        .where(eq(integrations.id, integration.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.db.update(integrations).set({ lastError: message })
        .where(eq(integrations.id, integration.id));
    }
  }
}
