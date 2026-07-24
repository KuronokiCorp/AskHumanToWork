/**
 * Table-driven reminder firing (scale-to-zero safe).
 *
 * Backlog #1 / spec docs/specs/cloud-scheduler-cron-tick.md. With minInstances=0
 * the in-process pg-boss scheduler cannot be relied on to fire delayed reminder
 * jobs — nothing polls the queue while the instance is asleep. The `reminders`
 * table has always been the source of truth (see core/reminder-service.ts); this
 * runner fires directly from it and is driven by the Cloud Scheduler cron tick.
 */
import { and, eq, lte } from 'drizzle-orm';
import { reminders, todos } from '@askhumantowork/db';
import { ReminderService, signAction, type AppContext } from '@askhumantowork/core';
import { env } from './env.js';
import { getUserForNotify, inQuietHours, sendEmail, sendWebPush } from './notify.js';

/** Max reminders delivered per tick — bounds work + DB load per invocation. */
const BATCH = 200;

export interface ReminderRunResult {
  processed: number;
  failed: number;
  deferred: number;
}

/**
 * Deliver every reminder that is due now (status='pending' AND fireAt<=now).
 * Idempotent across overlapping ticks and a still-awake pg-boss worker: each row
 * is claimed with an atomic pending->sent flip before sending, so exactly one
 * caller ever owns it. A transient delivery failure reverts the row to 'pending'
 * so the next tick retries it (at-least-once), rather than silently dropping it.
 */
export async function deliverDueReminders(ctx: AppContext): Promise<ReminderRunResult> {
  const reminderSvc = new ReminderService(ctx);
  const now = new Date();

  const due = await ctx.db.query.reminders.findMany({
    where: and(eq(reminders.status, 'pending'), lte(reminders.fireAt, now)),
    orderBy: (r, { asc }) => [asc(r.fireAt)],
    limit: BATCH,
  });

  let processed = 0;
  let failed = 0;
  let deferred = 0;

  for (const reminder of due) {
    const todo = await ctx.db.query.todos.findFirst({ where: eq(todos.id, reminder.todoId) });
    if (!todo || todo.status === 'done' || todo.status === 'cancelled') {
      // DB-only cancellation, same as the original worker short-circuit.
      await ctx.db.update(reminders).set({ status: 'cancelled' }).where(eq(reminders.id, reminder.id));
      continue;
    }

    const user = await getUserForNotify(ctx.db, todo.ownerId);
    if (!user) continue; // leave pending; nothing to deliver to yet

    // Quiet hours: leave the row pending and let a later tick pick it up once the
    // window closes (replaces the old "re-enqueue 30 min later" pg-boss deferral).
    if (inQuietHours(user.notificationPrefs, user.timezone)) {
      deferred++;
      continue;
    }

    // Atomic claim: only the caller that flips pending->sent owns delivery.
    const claimed = await ctx.db
      .update(reminders)
      .set({ status: 'sent' })
      .where(and(eq(reminders.id, reminder.id), eq(reminders.status, 'pending')))
      .returning({ id: reminders.id });
    if (!claimed.length) continue; // another tick already claimed it

    const overdue = todo.dueAt && todo.dueAt.getTime() < Date.now();
    const dueText = todo.dueAt
      ? overdue
        ? `was due ${todo.dueAt.toLocaleString('en-US', { timeZone: user.timezone })}`
        : `due ${todo.dueAt.toLocaleString('en-US', { timeZone: user.timezone })}`
      : '';
    const provenance =
      todo.source === 'ai' && todo.originContext
        ? `\n(Added by ${todo.createdByAgent ?? 'an AI agent'}: ${todo.originContext})`
        : '';

    // One-click action links, valid 14 days, HMAC-signed (work without a session).
    const exp = Math.floor(Date.now() / 1000) + 14 * 24 * 3600;
    const actionUrl = (action: string) =>
      `${env.apiBaseUrl}/api/todos/${todo.id}/action?action=${action}&exp=${exp}&sig=${signAction(todo.id, action, exp)}`;

    const payload = {
      title: overdue ? `Overdue: ${todo.title}` : `Reminder: ${todo.title}`,
      body: `${todo.title} ${dueText}${provenance}`.trim(),
      url: `${env.webBaseUrl}/t/${todo.id}`,
      actions: {
        complete: actionUrl('complete'),
        snooze1h: actionUrl('snooze1h'),
        snooze1d: actionUrl('snooze1d'),
      },
    };

    try {
      if (reminder.channel === 'email') await sendEmail(user.email, payload);
      if (reminder.channel === 'web_push') await sendWebPush(ctx.db, user.id, payload);
      processed++;
    } catch (err) {
      // Revert the claim so a later tick retries; never drop it silently.
      await ctx.db
        .update(reminders)
        .set({ status: 'pending' })
        .where(eq(reminders.id, reminder.id));
      failed++;
      console.error(`[reminders] delivery failed for ${reminder.id}:`, err);
      continue;
    }

    // Escalation: when the at-due (or overdue) reminder fires and the todo is still
    // open, schedule the next daily nudge. Email channel only, to avoid double-scheduling.
    const atOrPastDue = todo.dueAt && reminder.fireAt.getTime() >= todo.dueAt.getTime() - 1000;
    if (atOrPastDue && reminder.channel === 'email' && (todo.status === 'open' || todo.status === 'doing')) {
      await reminderSvc.scheduleOverdueNudge(todo.id, user.notificationPrefs);
    }
  }

  return { processed, failed, deferred };
}
