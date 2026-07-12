/**
 * Background workers: reminder delivery + integration sync + housekeeping.
 * All queues are pg-boss (Postgres) — no Redis. Run: pnpm --filter @askhumantowork/api dev:worker
 */
import './env.js';
import { eq } from 'drizzle-orm';
import { createDb, reminders, todos } from '@askhumantowork/db';
import {
  createContext,
  QUEUES,
  ReminderService,
  runInboundPollers,
  runSyncJob,
  signAction,
  type AppContext,
} from '@askhumantowork/core';
import { env } from './env.js';
import { getUserForNotify, inQuietHours, sendEmail, sendWebPush } from './notify.js';
import { cleanupExpiredSessions } from './session-store.js';
import { composeDigest, digestPrefsOf, isLocalHour } from './digest.js';

/**
 * Register all pg-boss workers on the given context. Called by the dedicated
 * worker entry below, or by the API process itself when RUN_WORKER=true
 * (single-service deployments like Firebase App Hosting).
 */
export async function registerWorkers(ctx: AppContext): Promise<void> {
  const reminderSvc = new ReminderService(ctx);

  // ---------- Reminder delivery ----------

  await ctx.boss.work(QUEUES.reminder, async ([job]) => {
    if (!job) return;
    const { reminderId } = job.data as { reminderId: string };
    const reminder = await ctx.db.query.reminders.findFirst({ where: eq(reminders.id, reminderId) });
    // Cancelled/sent rows are no-ops — cancellation is DB-only by design.
    if (!reminder || reminder.status !== 'pending') return;

    const todo = await ctx.db.query.todos.findFirst({ where: eq(todos.id, reminder.todoId) });
    if (!todo || todo.status === 'done' || todo.status === 'cancelled') {
      await ctx.db.update(reminders).set({ status: 'cancelled' }).where(eq(reminders.id, reminderId));
      return;
    }

    const user = await getUserForNotify(ctx.db, todo.ownerId);
    if (!user) return;

    // Quiet hours: push the reminder forward in 30-min steps until outside the window.
    if (inQuietHours(user.notificationPrefs, user.timezone)) {
      await ctx.boss.send(QUEUES.reminder, { reminderId }, { startAfter: new Date(Date.now() + 30 * 60_000) });
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
  });

  // ---------- Integration sync ----------

  await ctx.boss.work(QUEUES.sync, async ([job]) => {
    if (!job) return;
    await runSyncJob(ctx, (job.data as { syncJobId: string }).syncJobId);
  });

  await ctx.boss.work(QUEUES.poll, async () => {
    await runInboundPollers(ctx);
  });
  await ctx.boss.schedule(QUEUES.poll, '*/2 * * * *'); // every 2 minutes

  // ---------- Morning digest ----------

  await ctx.boss.work(QUEUES.digest, async () => {
    const all = await ctx.db.query.users.findMany();
    for (const user of all) {
      const prefs = digestPrefsOf(user);
      if (!prefs.enabled) continue;
      if (!isLocalHour(user.timezone, prefs.hour ?? 8)) continue;
      try {
        const digest = await composeDigest(ctx, user);
        if (!digest) continue; // empty agenda — no email
        const payload = { title: digest.subject, body: digest.body, url: `${env.webBaseUrl}/today` };
        await sendEmail(user.email, payload);
        await sendWebPush(ctx.db, user.id, payload);
      } catch (err) {
        console.error(`[digest] failed for ${user.email}:`, err);
      }
    }
  });
  await ctx.boss.schedule(QUEUES.digest, '0 * * * *'); // hourly; per-user local hour matched in handler

  // ---------- Housekeeping ----------

  await ctx.boss.work(QUEUES.cleanup, async () => {
    await cleanupExpiredSessions(ctx.db);
  });
  await ctx.boss.schedule(QUEUES.cleanup, '0 4 * * *'); // daily 04:00

  console.log('Workers running (pg-boss): reminders + sync (poll every 2m) + housekeeping');
}

// Standalone worker entry: `node packages/api/dist/worker.js`
if (process.argv[1]?.endsWith('worker.js') || process.argv[1]?.endsWith('worker.ts')) {
  const db = createDb();
  const ctx = await createContext(db);
  await registerWorkers(ctx);

  // Cloud Run requires services to listen on $PORT — expose a bare health
  // endpoint when deployed there (not set in local dev).
  if (process.env.PORT) {
    const { createServer } = await import('node:http');
    createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true,"role":"worker"}');
    }).listen(Number(process.env.PORT), () =>
      console.log(`worker health listener on :${process.env.PORT}`),
    );
  }
}
