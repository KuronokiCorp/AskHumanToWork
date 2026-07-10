import { and, eq } from 'drizzle-orm';
import { integrations, syncJobs, todos } from '@askhumantowork/db';
import type { Provider } from '@askhumantowork/shared';
import type { AppContext } from './../context.js';
import { canUseIntegrations } from '../entitlements.js';

type TodoRow = typeof todos.$inferSelect;
export type SyncAction = 'create' | 'update' | 'complete' | 'delete';

interface IntegrationConfig {
  direction?: 'outbound' | 'two-way';
  filters?: { minPriority?: number; sourceOnly?: 'human' | 'ai'; requireDueDate?: boolean };
  defaultListId?: string;
  defaultListName?: string;
  projectRouting?: Record<string, string>;
}

function passesFilters(todo: TodoRow, cfg: IntegrationConfig): boolean {
  const f = cfg.filters ?? {};
  if (f.minPriority !== undefined && todo.priority < f.minPriority) return false;
  if (f.sourceOnly && todo.source !== f.sourceOnly) return false;
  if (f.requireDueDate && !todo.dueAt) return false;
  return true;
}

/**
 * Outbox pattern: record sync jobs for every active integration that should
 * mirror this todo, then nudge the sync queue. Called after todo writes.
 * `syncTo` (from MCP add_todo) overrides routing to specific providers.
 */
export async function enqueueTodoSync(
  ctx: AppContext,
  todo: TodoRow,
  action: SyncAction,
  syncTo?: Provider[],
): Promise<{ provider: Provider; status: 'queued' | 'skipped' }[]> {
  // Third-party sync is a pro feature; free users' integrations (e.g. after a
  // downgrade) are simply not mirrored to.
  if (!(await canUseIntegrations(ctx, todo.ownerId))) return [];

  const active = await ctx.db.query.integrations.findMany({
    where: and(eq(integrations.userId, todo.ownerId), eq(integrations.status, 'active')),
  });

  const results: { provider: Provider; status: 'queued' | 'skipped' }[] = [];
  for (const integ of active) {
    const cfg = (integ.config ?? {}) as IntegrationConfig;
    const targeted = syncTo ? syncTo.includes(integ.provider) : passesFilters(todo, cfg);
    if (!targeted) {
      results.push({ provider: integ.provider, status: 'skipped' });
      continue;
    }
    const [job] = await ctx.db
      .insert(syncJobs)
      .values({ integrationId: integ.id, todoId: todo.id, direction: 'outbound', action })
      .returning();
    if (job) {
      await ctx.queues.sync.add('outbound', { syncJobId: job.id }, { jobId: job.id });
      results.push({ provider: integ.provider, status: 'queued' });
    }
  }
  return results;
}
