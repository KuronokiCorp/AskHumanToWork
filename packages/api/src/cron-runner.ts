/**
 * Cron tick: the single deterministic driver for all due scheduled work.
 *
 * Backlog #1 / spec docs/specs/cloud-scheduler-cron-tick.md. Called by the
 * authenticated POST /api/internal/cron/tick endpoint that a Cloud Scheduler job
 * hits every 5-15 min. The HTTP call both wakes the scaled-to-zero instance and
 * runs everything now due, replacing the in-process pg-boss cron schedules that
 * cannot fire while minInstances=0 leaves the instance asleep.
 */
import { eq } from 'drizzle-orm';
import { users } from '@askhumantowork/db';
import {
  StripeBillingService,
  runInboundPollers,
  stripeConfigFromEnv,
  type AppContext,
} from '@askhumantowork/core';
import { sendEmail, sendWebPush } from './notify.js';
import { cleanupExpiredSessions } from './session-store.js';
import { composeDigest, digestPrefsOf, isLocalHour, localDateOf } from './digest.js';
import { deliverDueReminders } from './reminders-runner.js';
import { env } from './env.js';

export interface CronTickResult {
  remindersProcessed: number;
  remindersFailed: number;
  remindersDeferred: number;
  digestsSent: number;
  polled: boolean;
  cleaned: boolean;
  billingReported: number;
}

/** Send the morning digest to every user whose local hour matches, at most once per local day. */
async function runDueDigests(ctx: AppContext): Promise<number> {
  const all = await ctx.db.query.users.findMany();
  let sent = 0;
  for (const user of all) {
    const prefs = digestPrefsOf(user);
    if (!prefs.enabled) continue;
    const hour = prefs.hour ?? 8;
    if (!isLocalHour(user.timezone, hour)) continue;

    // Once-per-day guard: the tick runs many times inside the target hour.
    const today = localDateOf(user.timezone);
    if (prefs.lastSentOn === today) continue;

    try {
      const digest = await composeDigest(ctx, user);
      // Stamp the guard even when the agenda is empty, so we don't recompute the
      // (possibly AI-written) digest on every tick for the rest of the hour.
      const existing = (user.notificationPrefs as Record<string, unknown> | null) ?? {};
      await ctx.db
        .update(users)
        .set({ notificationPrefs: { ...existing, digest: { ...prefs, lastSentOn: today } } })
        .where(eq(users.id, user.id));
      if (!digest) continue; // empty agenda — no email

      const payload = { title: digest.subject, body: digest.body, url: `${env.webBaseUrl}/today` };
      await sendEmail(user.email, payload);
      await sendWebPush(ctx.db, user.id, payload);
      sent++;
    } catch (err) {
      console.error(`[digest] failed for ${user.email}:`, err);
    }
  }
  return sent;
}

/** Run every piece of due scheduled work. Each part is independently idempotent. */
export async function runCronTick(ctx: AppContext): Promise<CronTickResult> {
  const reminders = await deliverDueReminders(ctx);

  let digestsSent = 0;
  try {
    digestsSent = await runDueDigests(ctx);
  } catch (err) {
    console.error('[cron] digest pass failed:', err);
  }

  let polled = false;
  try {
    await runInboundPollers(ctx);
    polled = true;
  } catch (err) {
    console.error('[cron] inbound poll failed:', err);
  }

  let cleaned = false;
  try {
    await cleanupExpiredSessions(ctx.db);
    cleaned = true;
  } catch (err) {
    console.error('[cron] cleanup failed:', err);
  }

  let billingReported = 0;
  const stripeConfig = stripeConfigFromEnv();
  if (stripeConfig) {
    try {
      const billingSvc = new StripeBillingService(ctx, stripeConfig);
      const { reported } = await billingSvc.reportPendingUsage();
      billingReported = reported;
    } catch (err) {
      console.error('[cron] billing report failed:', err);
    }
  }

  return {
    remindersProcessed: reminders.processed,
    remindersFailed: reminders.failed,
    remindersDeferred: reminders.deferred,
    digestsSent,
    polled,
    cleaned,
    billingReported,
  };
}
