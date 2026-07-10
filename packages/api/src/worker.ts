/**
 * Background workers: reminder delivery + integration sync.
 * Run: pnpm --filter @askhumantowork/api dev:worker
 */
import './env.js';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { createDb, reminders, todos } from '@askhumantowork/db';
import {
  createContext,
  ReminderService,
  runInboundPollers,
  runSyncJob,
  signAction,
} from '@askhumantowork/core';
import { env } from './env.js';
import { getUserForNotify, inQuietHours, sendEmail, sendWebPush } from './notify.js';

const db = createDb();
const ctx = createContext(db);
const reminderSvc = new ReminderService(ctx);

// ---------- Reminder delivery ----------

const reminderWorker = new Worker(
  'reminders',
  async (job) => {
    const { reminderId } = job.data as { reminderId: string };
    const reminder = await ctx.db.query.reminders.findFirst({
      where: eq(reminders.id, reminderId),
    });
    if (!reminder || reminder.status !== 'pending') return;

    const todo = await ctx.db.query.todos.findFirst({ where: eq(todos.id, reminder.todoId) });
    if (!todo || todo.status === 'done' || todo.status === 'cancelled') {
      await ctx.db.update(reminders).set({ status: 'cancelled' }).where(eq(reminders.id, reminderId));
      return;
    }

    const user = await getUserForNotify(ctx.db, todo.ownerId);
    if (!user) return;

    // Quiet hours: push the reminder forward by 30-min steps until outside the window.
    if (inQuietHours(user.notificationPrefs, user.timezone)) {
      await job.moveToDelayed(Date.now() + 30 * 60_000, job.token);
      return;
    }

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

    if (reminder.channel === 'email') await sendEmail(user.email, payload);
    if (reminder.channel === 'web_push') await sendWebPush(ctx.db, user.id, payload);

    await ctx.db.update(reminders).set({ status: 'sent' }).where(eq(reminders.id, reminderId));

    // Escalation: when the at-due (or overdue) reminder fires and the todo is still open,
    // schedule the next daily nudge. Only from the email channel to avoid double-scheduling.
    const atOrPastDue = todo.dueAt && reminder.fireAt.getTime() >= todo.dueAt.getTime() - 1000;
    if (atOrPastDue && reminder.channel === 'email' && (todo.status === 'open' || todo.status === 'doing')) {
      await reminderSvc.scheduleOverdueNudge(todo.id, user.notificationPrefs);
    }
  },
  { connection: ctx.redis },
);

// ---------- Integration sync ----------

const syncWorker = new Worker(
  'sync',
  async (job) => {
    if (job.name === 'outbound') {
      await runSyncJob(ctx, (job.data as { syncJobId: string }).syncJobId);
    } else if (job.name === 'poll') {
      await runInboundPollers(ctx);
    }
  },
  { connection: ctx.redis },
);

// Poll external providers for inbound changes every 2 minutes.
await ctx.queues.sync.upsertJobScheduler('inbound-poll', { every: 120_000 }, { name: 'poll' });

console.log('Workers running: reminders + sync (inbound poll every 2m)');

for (const w of [reminderWorker, syncWorker]) {
  w.on('failed', (job, err) => console.error(`[${w.name}] job ${job?.id} failed:`, err.message));
}
