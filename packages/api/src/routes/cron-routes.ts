/**
 * Authenticated cron endpoint hit by an external Cloud Scheduler job every
 * 5-15 min (spec docs/specs/cloud-scheduler-cron-tick.md). Fails closed: with no
 * CRON_SECRET configured it refuses to run, and it never runs unauthenticated.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '@askhumantowork/core';
import { env } from '../env.js';
import { runCronTick } from '../cron-runner.js';

/** Constant-time string compare that is safe for differing lengths. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function presentedSecret(headers: Record<string, unknown>): string {
  const auth = headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  const key = headers['x-cron-key'];
  if (typeof key === 'string') return key;
  return '';
}

export function registerCronRoutes(app: FastifyInstance, ctx: AppContext): void {
  // Rate-limit disabled: Scheduler calls must never be throttled (like /api/health).
  app.post('/api/internal/cron/tick', { config: { rateLimit: false } }, async (req, reply) => {
    if (!env.cronSecret) {
      return reply.code(503).send({ error: 'cron disabled' });
    }
    const provided = presentedSecret(req.headers as Record<string, unknown>);
    if (!provided || !secretMatches(provided, env.cronSecret)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const summary = await runCronTick(ctx);
    return { ok: true, ...summary };
  });
}
