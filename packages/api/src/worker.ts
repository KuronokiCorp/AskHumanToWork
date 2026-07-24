/**
 * Background workers: integration sync outbox drain.
 *
 * Reminder firing and the poll/digest/cleanup/billing crons used to run here on
 * pg-boss's in-process scheduler. With minInstances=0 (CEO cost decision 22 Jul)
 * that scheduler cannot fire while the instance is asleep, so those moved to the
 * Cloud Scheduler cron tick (POST /api/internal/cron/tick → runCronTick;
 * spec docs/specs/cloud-scheduler-cron-tick.md). What remains here is the `sync`
 * queue: it is drained on demand (enqueued by user integration actions, which
 * themselves keep the instance awake), so an in-process worker is still correct.
 *
 * Run standalone: pnpm --filter @askhumantowork/api dev:worker
 */
import './env.js';
import { createDb } from '@askhumantowork/db';
import {
  createContext,
  QUEUES,
  runSyncJob,
  type AppContext,
} from '@askhumantowork/core';

/**
 * Register pg-boss workers on the given context. Called by the dedicated worker
 * entry below, or by the API process itself when RUN_WORKER=true (single-service
 * deployments like Firebase App Hosting).
 */
export async function registerWorkers(ctx: AppContext): Promise<void> {
  // ---------- Integration sync (on-demand outbox drain) ----------
  await ctx.boss.work(QUEUES.sync, async ([job]) => {
    if (!job) return;
    await runSyncJob(ctx, (job.data as { syncJobId: string }).syncJobId);
  });

  console.log('Workers running (pg-boss): sync outbox drain. ' +
    'Reminders/digest/poll/cleanup/billing run via the Cloud Scheduler cron tick.');
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
