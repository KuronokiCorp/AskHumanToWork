import { and, eq, inArray } from 'drizzle-orm';
import { reminders, todos } from '@askhumantowork/db';
import type { ReminderChannel } from '@askhumantowork/shared';
import { type AppContext } from './context.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Reliable reminder engine. Default ladder for a todo with a due date:
 *   due − 1 day, due − 1 hour, at due — then daily overdue nudges (added by the
 *   worker when an at-due reminder fires and the todo is still open).
 *
 * Source of truth is the `reminders` table; pg-boss jobs are just delayed
 * triggers. Cancellation only updates rows — a stale job that still fires is a
 * no-op because the worker re-checks `status = 'pending'` before sending.
 */
export class ReminderService {
  constructor(private ctx: AppContext) {}

  private channelsFor(prefs: unknown): ReminderChannel[] {
    const channels = (prefs as { channels?: Record<string, boolean> } | null)?.channels ?? {};
    const out: ReminderChannel[] = [];
    if (channels.email !== false) out.push('email');
    if (channels.web_push !== false) out.push('web_push');
    return out.length ? out : ['email'];
  }

  private async enqueue(_reminderId: string, _fireAt: Date): Promise<void> {
    // No-op since backlog #1: reminders fire from the `reminders` table (the source
    // of truth) via the Cloud Scheduler cron tick, not from delayed pg-boss jobs —
    // the in-process pg-boss scheduler cannot fire at minInstances=0 while the
    // instance is asleep. scheduleForTodo/snooze/scheduleOverdueNudge still write
    // the table rows below; the tick (deliverDueReminders) polls and delivers them.
    // Kept as a method so the call sites stay unchanged.
    return;
  }

  /** Recompute the ladder for a todo (idempotent: cancels previous ladder first). */
  async scheduleForTodo(
    todoId: string,
    opts: { dueAt: Date | null; explicit?: Date[]; notificationPrefs: unknown },
  ): Promise<void> {
    await this.cancelForTodo(todoId, 'ladder');

    const fireTimes: { fireAt: Date; kind: string }[] = [];
    const now = Date.now();

    if (opts.explicit?.length) {
      for (const d of opts.explicit) {
        if (d.getTime() > now) fireTimes.push({ fireAt: d, kind: 'ladder' });
      }
    } else if (opts.dueAt) {
      const due = opts.dueAt.getTime();
      for (const t of [due - DAY, due - HOUR, due]) {
        if (t > now) fireTimes.push({ fireAt: new Date(t), kind: 'ladder' });
      }
    }
    if (!fireTimes.length) return;

    const channels = this.channelsFor(opts.notificationPrefs);
    const values = fireTimes.flatMap(({ fireAt, kind }) =>
      channels.map((channel) => ({ todoId, fireAt, channel, kind })),
    );
    const rows = await this.ctx.db.insert(reminders).values(values).returning();
    await Promise.all(rows.map((r) => this.enqueue(r.id, r.fireAt)));
  }

  /** Schedule the next daily overdue nudge (called by the worker after an at-due fire). */
  async scheduleOverdueNudge(todoId: string, notificationPrefs: unknown): Promise<void> {
    const fireAt = new Date(Date.now() + DAY);
    const channels = this.channelsFor(notificationPrefs);
    const rows = await this.ctx.db
      .insert(reminders)
      .values(channels.map((channel) => ({ todoId, fireAt, channel, kind: 'overdue' })))
      .returning();
    await Promise.all(rows.map((r) => this.enqueue(r.id, r.fireAt)));
  }

  /** Cancel pending reminders for a todo (all kinds unless narrowed). DB-only. */
  async cancelForTodo(todoId: string, kind?: string): Promise<void> {
    const pending = await this.ctx.db.query.reminders.findMany({
      where: (r, { eq: e, and: a }) =>
        kind
          ? a(e(r.todoId, todoId), e(r.status, 'pending'), e(r.kind, kind))
          : a(e(r.todoId, todoId), e(r.status, 'pending')),
      columns: { id: true },
    });
    if (!pending.length) return;
    await this.ctx.db
      .update(reminders)
      .set({ status: 'cancelled' })
      .where(inArray(reminders.id, pending.map((r) => r.id)));
  }

  /** Snooze: cancel pending and schedule a single reminder at `until`. */
  async snooze(todoId: string, until: Date, notificationPrefs: unknown): Promise<void> {
    await this.cancelForTodo(todoId);
    const channels = this.channelsFor(notificationPrefs);
    const rows = await this.ctx.db
      .insert(reminders)
      .values(channels.map((channel) => ({ todoId, fireAt: until, channel, kind: 'snooze' })))
      .returning();
    await Promise.all(rows.map((r) => this.enqueue(r.id, r.fireAt)));
  }

  /** Pending reminders for a user (mobile app schedules local notifications from this). */
  async pendingForUser(userId: string) {
    return this.ctx.db
      .select({
        id: reminders.id,
        todoId: reminders.todoId,
        fireAt: reminders.fireAt,
        channel: reminders.channel,
        title: todos.title,
      })
      .from(reminders)
      .innerJoin(todos, eq(reminders.todoId, todos.id))
      .where(and(eq(todos.ownerId, userId), eq(reminders.status, 'pending')))
      .orderBy(reminders.fireAt);
  }
}
