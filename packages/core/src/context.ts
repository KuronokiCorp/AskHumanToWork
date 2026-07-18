import type { Database } from '@askhumantowork/db';
import { PgBoss } from 'pg-boss';

/** Queue names. All jobs live in Postgres (pg-boss) — no Redis required. */
export const QUEUES = {
  /** Delayed one-shot: fire a single reminder row. Payload { reminderId }. */
  reminder: 'reminder',
  /** Integration sync outbox drain. Payload { syncJobId }. */
  sync: 'sync',
  /** Cron: poll providers for inbound changes. */
  poll: 'poll',
  /** Cron: housekeeping (expired sessions). */
  cleanup: 'cleanup',
  /** Cron (hourly): morning digest for users whose local hour matches. */
  digest: 'digest',
  /** Cron: push billable AI overage to Stripe's usage meter. */
  billing: 'billing',
} as const;

export interface AppContext {
  db: Database;
  boss: PgBoss;
}

export async function createContext(db: Database): Promise<AppContext> {
  // Far-future reminders set per-job retentionSeconds when enqueued.
  const boss = new PgBoss({
    connectionString: process.env.DATABASE_URL ?? 'postgres://localhost:5432/askhumantowork',
  });
  boss.on('error', (err: Error) => console.error('[pg-boss]', err));
  await boss.start();
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name).catch(() => {}); // idempotent across instances
  }
  return { db, boss };
}
