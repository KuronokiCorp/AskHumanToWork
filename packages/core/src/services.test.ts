/**
 * Integration tests for the core services against a REAL Postgres database.
 * Locally: `createdb askhumantowork_test` first. CI provides a service container.
 * Covers the behaviors that were originally hand-verified: dedup, natural dates,
 * recurrence respawn, the reminder ladder + cancellation, and plan gating.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/askhumantowork_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=';

const { createDb, users, todos, reminders, integrations } = await import('@askhumantowork/db');
const { createContext, TodoService, ReminderService, canUseIntegrations, encryptSecret } =
  await import('./index.js');

const db = createDb(process.env.DATABASE_URL);
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

let ctx: Awaited<ReturnType<typeof createContext>>;

beforeAll(async () => {
  await migrate(db, { migrationsFolder });
  ctx = await createContext(db);
}, 30_000);

afterAll(async () => {
  await ctx.boss.stop({ graceful: false });
  // drizzle postgres-js exposes the underlying client as $client
  await (db.$client as { end: () => Promise<void> }).end();
});

beforeEach(async () => {
  await db.delete(users); // cascades todos/reminders/tokens/integrations
});

async function makeUser(plan: 'free' | 'pro' = 'free') {
  const [user] = await db
    .insert(users)
    .values({
      email: `t${Date.now()}${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: 'x',
      timezone: 'Asia/Tokyo',
      plan,
    })
    .returning();
  return user!;
}

describe('TodoService', () => {
  it('resolves natural dates in the user timezone', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const { todo } = await svc.create(user.id, { title: 'tz check', dueNatural: 'tomorrow 3pm' });
    expect(todo.dueAt).not.toBeNull();
    // 3pm JST == 06:00 UTC
    expect(new Date(todo.dueAt!).getUTCHours()).toBe(6);
  });

  it('dedups identical title+due+project within the window', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const first = await svc.create(user.id, { title: 'dedup me', dueNatural: 'friday 5pm' });
    const second = await svc.create(user.id, { title: 'dedup me', dueNatural: 'friday 5pm' });
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.todo.id).toBe(first.todo.id);
  });

  it('fuzzy-matches project names case-insensitively', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const a = await svc.create(user.id, { title: 'one', project: 'My Project' });
    const b = await svc.create(user.id, { title: 'two', project: 'my project' });
    expect(b.todo.projectId).toBe(a.todo.projectId);
  });

  it('spawns the next occurrence when a recurring todo is completed', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const { todo } = await svc.create(user.id, { title: 'weekly review', repeat: 'every monday' });
    expect(todo.recurrence?.display).toBe('every monday');
    expect(todo.dueAt).not.toBeNull();
    expect(new Date(todo.dueAt!).getUTCDay()).toBe(1); // Monday (00:00 UTC == 09:00 JST Monday)

    await svc.complete(user.id, todo.id);

    const rows = await db.query.todos.findMany({ where: eq(todos.ownerId, user.id) });
    expect(rows).toHaveLength(2);
    const next = rows.find((r) => r.status === 'open')!;
    expect(next.recurrence).not.toBeNull();
    expect(next.dueAt!.getTime()).toBe(new Date(todo.dueAt!).getTime() + 7 * 24 * 3_600_000);
  });

  it('does not double-spawn on double-complete', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const { todo } = await svc.create(user.id, { title: 'daily thing', repeat: 'every day' });
    await svc.complete(user.id, todo.id);
    await svc.update(user.id, todo.id, { status: 'done' }); // complete again
    const open = await db.query.todos.findMany({
      where: (t, { and: a, eq: e }) => a(e(t.ownerId, user.id), e(t.status, 'open')),
    });
    expect(open).toHaveLength(1);
  });
});

describe('ReminderService', () => {
  it('schedules the ladder for a future due date and cancels on complete', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const due = new Date(Date.now() + 2 * 24 * 3_600_000); // 2 days out → full ladder
    const { todo } = await svc.create(user.id, { title: 'ladder', dueAt: due.toISOString() });

    const pending = await db.query.reminders.findMany({ where: eq(reminders.todoId, todo.id) });
    // 3 ladder times × 2 channels (email + web_push)
    expect(pending).toHaveLength(6);
    expect(pending.every((r) => r.status === 'pending')).toBe(true);

    await svc.complete(user.id, todo.id);
    const after = await db.query.reminders.findMany({ where: eq(reminders.todoId, todo.id) });
    expect(after.every((r) => r.status === 'cancelled')).toBe(true);
  });

  it('snooze cancels pending and schedules a single new time per channel', async () => {
    const user = await makeUser();
    const todoSvc = new TodoService(ctx);
    const reminderSvc = new ReminderService(ctx);
    const { todo } = await todoSvc.create(user.id, {
      title: 'snooze me',
      dueAt: new Date(Date.now() + 3_600_000 * 30).toISOString(),
    });
    const until = new Date(Date.now() + 3_600_000);
    await reminderSvc.snooze(todo.id, until, user.notificationPrefs);
    const rows = await db.query.reminders.findMany({ where: eq(reminders.todoId, todo.id) });
    const stillPending = rows.filter((r) => r.status === 'pending');
    expect(stillPending).toHaveLength(2); // email + web_push at the snooze time
    expect(stillPending.every((r) => r.fireAt.getTime() === until.getTime())).toBe(true);
  });
});

describe('plan gating', () => {
  it('free users get no sync fan-out even with an active integration', async () => {
    const user = await makeUser('free');
    await db.insert(integrations).values({
      userId: user.id,
      provider: 'google-tasks',
      oauthTokensEnc: encryptSecret(JSON.stringify({ accessToken: 'x' })),
      status: 'active',
    });
    const svc = new TodoService(ctx);
    const { sync } = await svc.create(user.id, { title: 'gated' });
    expect(sync).toEqual([]);
    expect(await canUseIntegrations(ctx, user.id)).toBe(false);
  });

  it('pro users fan out to active integrations', async () => {
    const user = await makeUser('pro');
    await db.insert(integrations).values({
      userId: user.id,
      provider: 'google-tasks',
      oauthTokensEnc: encryptSecret(JSON.stringify({ accessToken: 'x' })),
      status: 'active',
    });
    const svc = new TodoService(ctx);
    const { sync } = await svc.create(user.id, { title: 'synced' });
    expect(sync).toEqual([{ provider: 'google-tasks', status: 'queued' }]);
    expect(await canUseIntegrations(ctx, user.id)).toBe(true);
  });
});
