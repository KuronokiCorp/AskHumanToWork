/**
 * Integration tests for the per-todo AI chat against a REAL Postgres database,
 * with a stubbed model client so no network call (or spend) is involved.
 * Locally: `createdb askhumantowork_test` first. CI provides a service container.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/askhumantowork_test';
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ?? 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=';

const { createDb, users, aiUsageEvents, todoMessages } = await import('@askhumantowork/db');
const {
  createContext,
  TodoService,
  TodoChatService,
  FREE_ALLOWANCE_MICROS,
  usageSummary,
} = await import('./index.js');
type ChatModelClient = import('./todo-chat-service.js').ChatModelClient;

const db = createDb(process.env.DATABASE_URL);
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

let ctx: Awaited<ReturnType<typeof createContext>>;

beforeAll(async () => {
  await migrate(db, { migrationsFolder });
  ctx = await createContext(db);
}, 30_000);

afterAll(async () => {
  await ctx.boss.stop({ graceful: false });
  await (db.$client as { end: () => Promise<void> }).end();
});

beforeEach(async () => {
  await db.delete(users); // cascades todos / messages / usage events
});

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      email: `chat${Date.now()}${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: 'x',
      timezone: 'Asia/Tokyo',
    })
    .returning();
  return user!;
}

/** Records what the service asked the model, and returns a fixed reply. */
function stubModel(costMicros = 1_000): ChatModelClient & { lastRequest?: unknown; calls: number } {
  const stub = {
    calls: 0,
    lastRequest: undefined as unknown,
    async complete(req: { system: string; messages: { role: string; content: string }[] }) {
      stub.calls++;
      stub.lastRequest = req;
      return {
        content: 'Break it into three steps.',
        model: 'MiniMax-M3',
        inputTokens: 120,
        outputTokens: 40,
        costMicros,
      };
    },
  };
  return stub;
}

describe('TodoChatService', () => {
  it('persists both turns and returns the assistant reply', async () => {
    const user = await makeUser();
    const { todo } = await new TodoService(ctx).create(user.id, { title: 'Write the RFC' });
    const svc = new TodoChatService(ctx, stubModel());

    const { message } = await svc.send(user.id, todo.id, 'How do I start?');
    expect(message.role).toBe('assistant');
    expect(message.content).toBe('Break it into three steps.');

    const history = await svc.list(user.id, todo.id);
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(history[0]!.content).toBe('How do I start?');
  });

  it('feeds the todo fields to the model as context', async () => {
    const user = await makeUser();
    const { todo } = await new TodoService(ctx).create(user.id, {
      title: 'Ship the migration',
      notes: 'blocked on review',
      priority: 3,
    });
    const model = stubModel();
    await new TodoChatService(ctx, model).send(user.id, todo.id, 'status?');

    const req = model.lastRequest as { system: string };
    expect(req.system).toContain('Ship the migration');
    expect(req.system).toContain('blocked on review');
    expect(req.system).toContain('high');
  });

  it('instructs the model to keep answers short and on-task', async () => {
    const user = await makeUser();
    const { todo } = await new TodoService(ctx).create(user.id, { title: 'Ship the migration' });
    const model = stubModel();
    await new TodoChatService(ctx, model).send(user.id, todo.id, 'anything');

    // Both guards are prompt-only, so a silent edit that drops them would
    // otherwise show up as cost and off-topic answers in production.
    const { system } = model.lastRequest as { system: string };
    expect(system).toContain('under 200 words');
    expect(system).toContain('Stay on this task');
    expect(system).toMatch(/do not answer it/);
  });

  it('replays prior turns so the conversation has memory', async () => {
    const user = await makeUser();
    const { todo } = await new TodoService(ctx).create(user.id, { title: 'Plan offsite' });
    const model = stubModel();
    const svc = new TodoChatService(ctx, model);

    await svc.send(user.id, todo.id, 'first');
    await svc.send(user.id, todo.id, 'second');

    const req = model.lastRequest as { messages: { role: string; content: string }[] };
    expect(req.messages.map((m) => m.content)).toEqual([
      'first',
      'Break it into three steps.',
      'second',
    ]);
  });

  it('ledgers usage with markup, and bills nothing inside the free allowance', async () => {
    const user = await makeUser();
    const { todo } = await new TodoService(ctx).create(user.id, { title: 'Budget check' });

    const { usage } = await new TodoChatService(ctx, stubModel(1_000)).send(
      user.id,
      todo.id,
      'hi',
    );
    expect(usage.priceMicros).toBe(2_000); // 2x markup on raw cost
    expect(usage.billedMicros).toBe(0);

    const [event] = await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.ownerId, user.id));
    expect(event!.costMicros).toBe(1_000);
    expect(event!.priceMicros).toBe(2_000);
    expect(event!.inputTokens).toBe(120);
    expect(event!.outputTokens).toBe(40);
    // Nothing owed, so there is nothing for the billing worker to report.
    expect(event!.reportedToStripe).toBe(true);
  });

  it('bills the overage once the free allowance is exhausted', async () => {
    const user = await makeUser();
    const { todo } = await new TodoService(ctx).create(user.id, { title: 'Overage' });
    // Pre-spend the whole allowance.
    await db.insert(aiUsageEvents).values({
      ownerId: user.id,
      model: 'MiniMax-M3',
      priceMicros: FREE_ALLOWANCE_MICROS,
      billedMicros: 0,
      reportedToStripe: true,
    });
    // A card on file is what makes spending past the allowance allowed at all.
    await db.update(users).set({ billingStatus: 'active' }).where(eq(users.id, user.id));

    const { usage } = await new TodoChatService(ctx, stubModel(1_500)).send(
      user.id,
      todo.id,
      'hi',
    );
    expect(usage.priceMicros).toBe(3_000);
    expect(usage.billedMicros).toBe(3_000); // allowance gone — all of it is billable

    const summary = await usageSummary(ctx, user.id);
    expect(summary.remainingFreeMicros).toBe(0);
    expect(summary.billedMicros).toBe(3_000);
  });

  it('refuses to spend when the allowance is gone and no card is on file', async () => {
    const user = await makeUser();
    const { todo } = await new TodoService(ctx).create(user.id, { title: 'No card' });
    await db.insert(aiUsageEvents).values({
      ownerId: user.id,
      model: 'MiniMax-M3',
      priceMicros: FREE_ALLOWANCE_MICROS,
      reportedToStripe: true,
    });

    const model = stubModel();
    await expect(new TodoChatService(ctx, model).send(user.id, todo.id, 'hi')).rejects.toThrow(
      /free AI allowance/i,
    );
    // The refusal must happen before the paid call, not after.
    expect(model.calls).toBe(0);
    expect(await db.select().from(todoMessages)).toHaveLength(0);
  });

  it('writes nothing when the model call fails', async () => {
    const user = await makeUser();
    const { todo } = await new TodoService(ctx).create(user.id, { title: 'Upstream down' });
    const failing = {
      async complete() {
        throw new Error('upstream exploded');
      },
    };

    await expect(new TodoChatService(ctx, failing).send(user.id, todo.id, 'hello')).rejects.toThrow(
      /upstream exploded/,
    );

    // No orphaned user turn: it would render with no reply, and be replayed as
    // context on every later turn.
    expect(await db.select().from(todoMessages)).toHaveLength(0);
    expect(await db.select().from(aiUsageEvents)).toHaveLength(0);
  });

  it('keeps the thread replayable after a failure', async () => {
    const user = await makeUser();
    const { todo } = await new TodoService(ctx).create(user.id, { title: 'Retry' });
    const flaky = {
      calls: 0,
      async complete() {
        flaky.calls++;
        if (flaky.calls === 1) throw new Error('transient');
        return {
          content: 'Recovered.',
          model: 'MiniMax-M3',
          inputTokens: 10,
          outputTokens: 5,
          costMicros: 10,
        };
      },
    };
    const svc = new TodoChatService(ctx, flaky);

    await expect(svc.send(user.id, todo.id, 'first try')).rejects.toThrow(/transient/);
    await svc.send(user.id, todo.id, 'second try');

    const history = await svc.list(user.id, todo.id);
    expect(history.map((m) => m.content)).toEqual(['second try', 'Recovered.']);
  });

  it("refuses to open another user's todo", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const { todo } = await new TodoService(ctx).create(owner.id, { title: 'Private' });

    const svc = new TodoChatService(ctx, stubModel());
    await expect(svc.send(stranger.id, todo.id, 'peek')).rejects.toThrow(/not found/i);
    await expect(svc.list(stranger.id, todo.id)).rejects.toThrow(/not found/i);
  });

  it('keeps each todo thread separate', async () => {
    const user = await makeUser();
    const svc = new TodoChatService(ctx, stubModel());
    const todoSvc = new TodoService(ctx);
    const a = (await todoSvc.create(user.id, { title: 'A' })).todo;
    const b = (await todoSvc.create(user.id, { title: 'B' })).todo;

    await svc.send(user.id, a.id, 'about A');

    expect(await svc.list(user.id, a.id)).toHaveLength(2);
    expect(await svc.list(user.id, b.id)).toHaveLength(0);
  });
});
