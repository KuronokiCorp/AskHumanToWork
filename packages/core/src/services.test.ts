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
  it('records which device/app (token name) created an AI todo', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const { todo } = await svc.create(
      user.id,
      { title: 'from my laptop' },
      { source: 'ai', agent: 'claude-code', tokenName: 'Shinan MacBook (Claude Code)' },
    );
    expect(todo.source).toBe('ai');
    expect(todo.createdByToken).toBe('Shinan MacBook (Claude Code)');
    expect(todo.createdByAgent).toBe('claude-code');
  });

  it('carries the origin token to the next recurrence occurrence', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const { todo } = await svc.create(
      user.id,
      { title: 'weekly from laptop', repeat: 'every monday' },
      { source: 'ai', tokenName: 'Shinan MacBook' },
    );
    await svc.complete(user.id, todo.id);
    const next = (await db.query.todos.findMany({ where: eq(todos.ownerId, user.id) })).find(
      (r) => r.status === 'open',
    )!;
    expect(next.createdByToken).toBe('Shinan MacBook');
  });

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

  it('creating a project with an existing name reuses (and revives) it instead of erroring', async () => {
    const user = await makeUser();
    const { ProjectService } = await import('./index.js');
    const svc = new ProjectService(ctx);
    const a = await svc.create(user.id, 'Dup Proj');
    const b = await svc.create(user.id, 'Dup Proj');
    expect(b!.id).toBe(a!.id);
    await svc.archive(user.id, a!.id);
    const c = await svc.create(user.id, 'Dup Proj');
    expect(c!.id).toBe(a!.id);
    expect(c!.archived).toBe(false);
  });

  it('a project-scoped token sees only its project + todos it created', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);

    // In the token's project (human-created, no token) → visible via project match.
    const inScope = await svc.create(user.id, { title: 'in Alpha', project: 'Alpha' });
    const projectId = inScope.todo.projectId!;

    // Different project, different token → NOT visible.
    const other = await svc.create(
      user.id,
      { title: 'in Beta', project: 'Beta' },
      { source: 'ai', tokenName: 'other-token' },
    );

    // Different project but created BY the scoped token → visible via createdByToken.
    const mine = await svc.create(
      user.id,
      { title: 'mine in Beta', project: 'Beta' },
      { source: 'ai', tokenName: 'scoped-token' },
    );

    const scope = { projectId, tokenName: 'scoped-token' };

    const titles = (await svc.list(user.id, { limit: 50, offset: 0 }, scope))
      .map((t) => t.title)
      .sort();
    expect(titles).toEqual(['in Alpha', 'mine in Beta']);

    // Reads/writes outside the scope are rejected; inside are allowed.
    await expect(svc.getById(user.id, other.todo.id, scope)).rejects.toThrow();
    await expect(
      svc.update(user.id, other.todo.id, { title: 'hijacked' }, scope),
    ).rejects.toThrow();
    expect((await svc.getById(user.id, inScope.todo.id, scope)).id).toBe(inScope.todo.id);
    expect((await svc.getById(user.id, mine.todo.id, scope)).id).toBe(mine.todo.id);

    // A new todo from the scoped token with no project lands in the token's project.
    const created = await svc.create(
      user.id,
      { title: 'auto-filed' },
      { source: 'ai', tokenName: 'scoped-token' },
      scope,
    );
    expect(created.todo.projectId).toBe(projectId);

    // Full-access (no scope) still sees everything.
    expect(await svc.list(user.id, { limit: 50, offset: 0 })).toHaveLength(4);
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

describe('AgendaService briefing', () => {
  it('diffs completed/added since a marker, surfaces blocked with reason, ranks next steps', async () => {
    const user = await makeUser();
    const { AgendaService } = await import('./index.js');
    const todoSvc = new TodoService(ctx);
    const agendaSvc = new AgendaService(ctx);

    // Before the marker: one todo that will be completed after it.
    const done = await todoSvc.create(user.id, { title: 'Ship the fix' });
    const marker = new Date();

    const blocked = await todoSvc.create(user.id, { title: 'Publish app', dueNatural: 'in 3 days' });
    await todoSvc.update(user.id, blocked.todo.id, {
      status: 'blocked',
      blockedReason: 'waiting for App Review',
    });
    const urgent = await todoSvc.create(user.id, { title: 'Renew cert', dueNatural: 'in 1 hour' });
    await todoSvc.complete(user.id, done.todo.id);

    const b = await agendaSvc.briefingForUser(user.id, null, marker);
    expect(b.completedSinceLastSession.map((t) => t.title)).toEqual(['Ship the fix']);
    expect(b.addedSinceLastSession.map((t) => t.title).sort()).toEqual(['Publish app', 'Renew cert']);
    expect(b.blocked).toHaveLength(1);
    expect(b.blocked[0]!.blockedReason).toBe('waiting for App Review');
    // Blocked todos are excluded from nextSteps; the soonest-due open todo leads.
    expect(b.nextSteps.map((t) => t.title)).toEqual(['Renew cert']);
    expect(b.summary).toContain('1 completed');
    expect(b.summary).toContain('1 blocked');

    // Unblocking clears the reason automatically.
    const reopened = await todoSvc.update(user.id, blocked.todo.id, { status: 'open' });
    expect(reopened.blockedReason).toBeNull();
    expect((await todoSvc.getById(user.id, urgent.todo.id)).status).toBe('open');
  });
});

describe('default due date (BACKLOG #3: +1 week when unset)', () => {
  const jstParts = (d: Date) =>
    Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .formatToParts(d)
        .map((p) => [p.type, p.value]),
    ) as Record<string, string>;

  it('AC1: no due field → dueAt is today+7d at 09:00 in the user timezone', async () => {
    const { resolveNaturalDate } = await import('@askhumantowork/shared');
    const user = await makeUser(); // timezone Asia/Tokyo
    const svc = new TodoService(ctx);
    const { todo } = await svc.create(user.id, { title: 'no due given' });

    expect(todo.dueAt).not.toBeNull();
    const due = new Date(todo.dueAt!);
    // Independent, tz-aware semantic check: it lands at 09:00 JST.
    expect(jstParts(due).hour).toBe('09');
    expect(jstParts(due).minute).toBe('00');
    // And it is exactly one week past the 09:00-local baseline (not string-compared).
    const expected = new Date(resolveNaturalDate('today 9am', 'Asia/Tokyo')!.getTime() + 7 * 86_400_000);
    expect(due.getTime()).toBe(expected.getTime());
  });

  it('AC2: explicit dueAt:null stays null (due-less todos remain possible)', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const { todo } = await svc.create(user.id, { title: 'deliberately due-less', dueAt: null });
    expect(todo.dueAt).toBeNull();
  });

  it('AC3: an explicit due (natural or ISO) is untouched by the default', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const iso = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const natural = await svc.create(user.id, { title: 'nat', dueNatural: 'tomorrow 5pm' });
    const absolute = await svc.create(user.id, { title: 'abs', dueAt: iso });
    // Neither equals the +7d default: 'tomorrow 5pm' is ~1 day out, the ISO is 3 days out.
    expect(jstParts(new Date(natural.todo.dueAt!)).hour).toBe('17');
    expect(new Date(absolute.todo.dueAt!).toISOString()).toBe(iso);
  });

  it('AC4: a recurring todo with no due keeps its recurrence baseline, not the +7d default', async () => {
    const { resolveNaturalDate } = await import('@askhumantowork/shared');
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const { todo } = await svc.create(user.id, { title: 'weekly', repeat: 'every monday' });
    expect(todo.dueAt).not.toBeNull();
    // First occurrence is derived from the rule (next Monday 09:00), NOT today+7d.
    const plusSeven = new Date(resolveNaturalDate('today 9am', 'Asia/Tokyo')!.getTime() + 7 * 86_400_000);
    expect(new Date(todo.dueAt!).getTime()).not.toBe(plusSeven.getTime());
    expect(jstParts(new Date(todo.dueAt!)).hour).toBe('09');
  });

  it('AC5: an agent-token create with no due defaults to +7d AND schedules a reminder ladder', async () => {
    const user = await makeUser();
    const svc = new TodoService(ctx);
    const { todo } = await svc.create(
      user.id,
      { title: 'agent no-due' },
      { source: 'ai', agent: 'heyhuman', tokenName: 'laptop' },
    );
    expect(todo.source).toBe('ai');
    const due = new Date(todo.dueAt!);
    expect(due.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(due.getTime()).toBeLessThan(Date.now() + 8 * 86_400_000);
    const ladder = await db.query.reminders.findMany({ where: eq(reminders.todoId, todo.id) });
    expect(ladder.length).toBeGreaterThan(0);
    expect(ladder.every((r) => r.status === 'pending')).toBe(true);
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
