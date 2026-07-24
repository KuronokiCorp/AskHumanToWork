/**
 * Integration tests for the Cloud Scheduler cron tick (backlog #1, spec
 * docs/specs/cloud-scheduler-cron-tick.md) against a REAL Postgres database.
 * Locally: `createdb askhumantowork_test` first; CI provides a service container.
 *
 * Reminders are exercised on the `web_push` channel, which is a no-op success
 * when VAPID is unconfigured — so these tests assert the table-driven firing
 * logic (claim / status transitions / quiet-hours / cancellation) without needing
 * a real push service. The digest idempotency test uses a tiny in-process SMTP
 * sink to count how many emails actually go out.
 */
import net from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/askhumantowork_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=';
// Point notify's SMTP transport at the local sink started below.
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1025';
// Force the deterministic template digest (never call a real Anthropic API in tests).
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
// No VAPID and no Stripe: web_push delivers as a no-op, billing pass is skipped.

const { createDb, users, todos, reminders } = await import('@askhumantowork/db');
const { createContext } = await import('@askhumantowork/core');
const { deliverDueReminders } = await import('./reminders-runner.js');
const { runCronTick } = await import('./cron-runner.js');
const { buildServer } = await import('./server.js');
const { env } = await import('./env.js');

const db = createDb(process.env.DATABASE_URL);
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

let ctx: Awaited<ReturnType<typeof createContext>>;

// --- Minimal SMTP sink: accepts and discards, counts one per delivered message. ---
let emailsDelivered = 0;
const smtp = net.createServer((sock) => {
  sock.write('220 sink\r\n');
  let inData = false;
  sock.on('data', (buf) => {
    if (inData) {
      if (buf.toString().includes('\r\n.\r\n')) {
        inData = false;
        sock.write('250 queued\r\n');
      }
      return;
    }
    const cmd = buf.toString().trim().toUpperCase();
    if (cmd.startsWith('DATA')) {
      inData = true;
      emailsDelivered++;
      sock.write('354 go\r\n');
    } else if (cmd.startsWith('QUIT')) {
      sock.write('221 bye\r\n');
      sock.end();
    } else {
      sock.write('250 ok\r\n');
    }
  });
});

const HOUR = 3_600_000;

beforeAll(async () => {
  await migrate(db, { migrationsFolder });
  ctx = await createContext(db);
  await new Promise<void>((res) => smtp.listen(1025, '127.0.0.1', res));
}, 30_000);

afterAll(async () => {
  await ctx.boss.stop({ graceful: false });
  await (db.$client as { end: () => Promise<void> }).end();
  await new Promise<void>((res) => smtp.close(() => res()));
});

beforeEach(async () => {
  await db.delete(users); // cascades todos/reminders
  emailsDelivered = 0;
});

async function makeUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: `t${Date.now()}${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: 'x',
      timezone: 'UTC',
      ...overrides,
    })
    .returning();
  return user!;
}

async function makeTodo(ownerId: string, overrides: Partial<typeof todos.$inferInsert> = {}) {
  const [todo] = await db
    .insert(todos)
    .values({ ownerId, title: 'Ship the thing', ...overrides })
    .returning();
  return todo!;
}

async function makeReminder(todoId: string, overrides: Partial<typeof reminders.$inferInsert> = {}) {
  const [r] = await db
    .insert(reminders)
    .values({ todoId, fireAt: new Date(Date.now() - HOUR), channel: 'web_push', ...overrides })
    .returning();
  return r!;
}

describe('deliverDueReminders (table-driven firing)', () => {
  it('delivers a reminder that came due while the instance was asleep', async () => {
    // The headline delayed-reminder case: fireAt is in the past, status pending.
    const user = await makeUser();
    const todo = await makeTodo(user.id, { dueAt: new Date(Date.now() - HOUR) });
    const rem = await makeReminder(todo.id, { fireAt: new Date(Date.now() - HOUR) });

    const res = await deliverDueReminders(ctx);
    expect(res.processed).toBe(1);

    const after = await db.query.reminders.findFirst({ where: eq(reminders.id, rem.id) });
    expect(after?.status).toBe('sent');
  });

  it('does NOT deliver a reminder whose fire time is still in the future', async () => {
    const user = await makeUser();
    const todo = await makeTodo(user.id, { dueAt: new Date(Date.now() + 2 * HOUR) });
    const rem = await makeReminder(todo.id, { fireAt: new Date(Date.now() + HOUR) });

    const res = await deliverDueReminders(ctx);
    expect(res.processed).toBe(0);

    const after = await db.query.reminders.findFirst({ where: eq(reminders.id, rem.id) });
    expect(after?.status).toBe('pending');
  });

  it('never double-sends when two ticks race on the same due reminder', async () => {
    const user = await makeUser();
    const todo = await makeTodo(user.id, { dueAt: new Date(Date.now() - HOUR) });
    await makeReminder(todo.id, { fireAt: new Date(Date.now() - HOUR) });

    const [a, b] = await Promise.all([deliverDueReminders(ctx), deliverDueReminders(ctx)]);
    expect(a.processed + b.processed).toBe(1); // exactly one tick owned it
  });

  it('defers (leaves pending) a reminder while the user is in quiet hours', async () => {
    const user = await makeUser({
      // Quiet all day so "now" is always inside the window regardless of test time.
      notificationPrefs: { channels: { web_push: true }, quietHours: { start: '00:00', end: '23:59' } },
    });
    const todo = await makeTodo(user.id, { dueAt: new Date(Date.now() - HOUR) });
    const rem = await makeReminder(todo.id, { fireAt: new Date(Date.now() - HOUR) });

    const res = await deliverDueReminders(ctx);
    expect(res.processed).toBe(0);
    expect(res.deferred).toBe(1);

    const after = await db.query.reminders.findFirst({ where: eq(reminders.id, rem.id) });
    expect(after?.status).toBe('pending'); // still deliverable on a later tick
  });

  it('cancels (does not send) a reminder when its todo is already done', async () => {
    const user = await makeUser();
    const todo = await makeTodo(user.id, { status: 'done', dueAt: new Date(Date.now() - HOUR) });
    const rem = await makeReminder(todo.id, { fireAt: new Date(Date.now() - HOUR) });

    const res = await deliverDueReminders(ctx);
    expect(res.processed).toBe(0);

    const after = await db.query.reminders.findFirst({ where: eq(reminders.id, rem.id) });
    expect(after?.status).toBe('cancelled');
  });
});

describe('POST /api/internal/cron/tick — auth (fails closed)', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const original = env.cronSecret;

  beforeAll(async () => {
    app = await buildServer(ctx);
    await app.ready();
  });
  afterAll(async () => {
    env.cronSecret = original;
    await app.close();
  });

  it('503 (disabled) when CRON_SECRET is unset', async () => {
    env.cronSecret = '';
    const r = await app.inject({ method: 'POST', url: '/api/internal/cron/tick' });
    expect(r.statusCode).toBe(503);
  });

  it('401 with a missing or wrong key', async () => {
    env.cronSecret = 'sekret';
    const missing = await app.inject({ method: 'POST', url: '/api/internal/cron/tick' });
    expect(missing.statusCode).toBe(401);
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/internal/cron/tick',
      headers: { 'x-cron-key': 'nope' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('200 + summary with the correct key (Bearer or X-Cron-Key)', async () => {
    env.cronSecret = 'sekret';
    const bearer = await app.inject({
      method: 'POST',
      url: '/api/internal/cron/tick',
      headers: { authorization: 'Bearer sekret' },
    });
    expect(bearer.statusCode).toBe(200);
    expect(bearer.json()).toHaveProperty('remindersProcessed');

    const header = await app.inject({
      method: 'POST',
      url: '/api/internal/cron/tick',
      headers: { 'x-cron-key': 'sekret' },
    });
    expect(header.statusCode).toBe(200);
  });
});

describe('runCronTick — digest once-per-day idempotency', () => {
  it('sends the morning digest at most once per user local day across many ticks', async () => {
    const hour = new Date().getUTCHours(); // user is UTC, so this is their local hour now
    const user = await makeUser({
      notificationPrefs: { channels: { email: true }, digest: { enabled: true, hour } },
    });
    // A due todo so the agenda is non-empty and a digest email is actually sent.
    await makeTodo(user.id, { dueAt: new Date() });

    await runCronTick(ctx); // first tick in the hour -> one digest email
    await runCronTick(ctx); // later tick, same hour -> guarded, no second email
    await runCronTick(ctx);

    expect(emailsDelivered).toBe(1);

    const after = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    const stamp = (after?.notificationPrefs as { digest?: { lastSentOn?: string } }).digest?.lastSentOn;
    expect(stamp).toBe(new Date().toISOString().slice(0, 10));
  });
});
