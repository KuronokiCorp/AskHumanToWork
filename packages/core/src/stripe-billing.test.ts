/**
 * Stripe billing tests against a REAL Postgres database with a fake Stripe
 * client. These cover the parts we own — which usage rows get reported, how
 * they're grouped, and how subscription state maps to billingStatus — without
 * live keys. The Stripe API calls themselves are still unexercised.
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

const { createDb, users, aiUsageEvents } = await import('@askhumantowork/db');
const { createContext, StripeBillingService } = await import('./index.js');

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
  await db.delete(users);
});

const CONFIG = {
  secretKey: 'sk_test_fake',
  meterEventName: 'ai_usage_micros',
  priceId: 'price_fake',
  webhookSecret: 'whsec_fake',
};

interface MeterEvent {
  event_name: string;
  identifier?: string;
  payload: { stripe_customer_id: string; value: string };
}

/** Records meter events; can be told to fail for a given customer. */
function fakeStripe(failFor?: string) {
  const events: MeterEvent[] = [];
  let nextEvent: unknown = null;
  return {
    events,
    /** Queue the event that constructEvent should return next. */
    setWebhookEvent(e: unknown) {
      nextEvent = e;
    },
    client: {
      billing: {
        meterEvents: {
          create: async (e: MeterEvent) => {
            if (failFor && e.payload.stripe_customer_id === failFor) {
              throw new Error('stripe down');
            }
            events.push(e);
            return e;
          },
        },
      },
      webhooks: {
        constructEvent: (_body: unknown, signature: string) => {
          // Stand in for signature verification so the mapping below is what's
          // under test, not Stripe's crypto.
          if (signature === 'bad') throw new Error('signature mismatch');
          return nextEvent;
        },
      },
    },
  };
}

/** A subscription webhook event in the shape handleWebhook consumes. */
function subscriptionEvent(status: string, customer = 'cus_alice', priceId = CONFIG.priceId) {
  return {
    type: 'customer.subscription.updated',
    data: {
      object: {
        status,
        customer,
        items: { data: [{ id: 'si_meter_item', price: { id: priceId } }] },
      },
    },
  };
}

function service(stripe: ReturnType<typeof fakeStripe>) {
  // The fake only implements what these paths touch.
  return new StripeBillingService(ctx, CONFIG, stripe.client as never);
}

type BillingStatus = 'none' | 'active' | 'past_due';

async function makeUser(stripeCustomerId: string | null, billingStatus: BillingStatus = 'active') {
  const [user] = await db
    .insert(users)
    .values({
      email: `bill${Date.now()}${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: 'x',
      timezone: 'UTC',
      stripeCustomerId,
      billingStatus,
    })
    .returning();
  return user!;
}

async function addUsage(userId: string, billedMicros: number, reported = false) {
  const [row] = await db
    .insert(aiUsageEvents)
    .values({
      ownerId: userId,
      model: 'MiniMax-M3',
      priceMicros: billedMicros,
      billedMicros,
      reportedToStripe: reported,
    })
    .returning();
  return row!;
}

describe('reportPendingUsage', () => {
  it('reports unreported overage and marks it done', async () => {
    const user = await makeUser('cus_alice');
    const row = await addUsage(user.id, 2_500);
    const stripe = fakeStripe();

    const result = await service(stripe).reportPendingUsage();

    expect(result.reported).toBe(1);
    expect(stripe.events).toHaveLength(1);
    expect(stripe.events[0]).toMatchObject({
      event_name: 'ai_usage_micros',
      identifier: row.id, // the usage row's UUID — makes retries idempotent
      payload: { stripe_customer_id: 'cus_alice', value: '2500' },
    });

    const [after] = await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.id, row.id));
    expect(after!.reportedToStripe).toBe(true);
  });

  it('does not report the same row twice', async () => {
    const user = await makeUser('cus_alice');
    await addUsage(user.id, 2_500);
    const stripe = fakeStripe();
    const svc = service(stripe);

    await svc.reportPendingUsage();
    const second = await svc.reportPendingUsage();

    expect(second.reported).toBe(0);
    expect(stripe.events).toHaveLength(1);
  });

  it('ignores rows with nothing owed', async () => {
    const user = await makeUser('cus_alice');
    await addUsage(user.id, 0); // fully inside the free allowance
    const stripe = fakeStripe();

    const result = await service(stripe).reportPendingUsage();

    expect(result.reported).toBe(0);
    expect(stripe.events).toHaveLength(0);
  });

  it('retires overage for a user who never added a card', async () => {
    // No Stripe customer means nothing to bill against — the row must not be
    // retried forever on every worker tick.
    const user = await makeUser(null);
    const row = await addUsage(user.id, 900);
    const stripe = fakeStripe();

    const result = await service(stripe).reportPendingUsage();

    expect(result).toEqual({ reported: 0, skipped: 1 });
    expect(stripe.events).toHaveLength(0);
    const [after] = await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.id, row.id));
    expect(after!.reportedToStripe).toBe(true);
  });

  it('leaves a row unreported when Stripe rejects it, so the next run retries', async () => {
    const user = await makeUser('cus_alice');
    const row = await addUsage(user.id, 1_200);
    const stripe = fakeStripe('cus_alice');

    const result = await service(stripe).reportPendingUsage();

    expect(result.reported).toBe(0);
    const [after] = await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.id, row.id));
    expect(after!.reportedToStripe).toBe(false);
  });

  it("one customer's failure does not block another's", async () => {
    const alice = await makeUser('cus_alice');
    const bob = await makeUser('cus_bob');
    await addUsage(alice.id, 500);
    const bobRow = await addUsage(bob.id, 700);
    const stripe = fakeStripe('cus_alice');

    const result = await service(stripe).reportPendingUsage();

    expect(result.reported).toBe(1);
    expect(stripe.events.map((e) => e.payload.stripe_customer_id)).toEqual(['cus_bob']);
    const [after] = await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.id, bobRow.id));
    expect(after!.reportedToStripe).toBe(true);
  });

  it('skips events too old for Stripe to accept', async () => {
    // Stripe rejects meter events older than 35 days; sending them would fail
    // on every tick forever.
    const user = await makeUser('cus_alice');
    await db
      .insert(aiUsageEvents)
      .values({
        ownerId: user.id,
        model: 'MiniMax-M3',
        priceMicros: 400,
        billedMicros: 400,
        reportedToStripe: false,
        createdAt: new Date(Date.now() - 40 * 24 * 3_600_000),
      })
      .returning();
    const stripe = fakeStripe();

    const result = await service(stripe).reportPendingUsage();

    expect(result.reported).toBe(0);
    expect(stripe.events).toHaveLength(0);
  });
});

describe('handleWebhook', () => {
  async function statusAfter(subStatus: string, startFrom: BillingStatus = 'none') {
    const user = await makeUser('cus_alice', startFrom);
    const stripe = fakeStripe();
    stripe.setWebhookEvent(subscriptionEvent(subStatus));
    await service(stripe).handleWebhook('{}', 'sig');
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    return after!;
  }

  it('turns a live subscription into an active card on file', async () => {
    const user = await statusAfter('active');
    expect(user.billingStatus).toBe('active');
    // The metered item is what usage bills against — remember which one.
    expect(user.stripeSubscriptionItemId).toBe('si_meter_item');
  });

  it('treats a trial as active', async () => {
    expect((await statusAfter('trialing')).billingStatus).toBe('active');
  });

  it('marks past_due and unpaid so spending pauses', async () => {
    expect((await statusAfter('past_due', 'active')).billingStatus).toBe('past_due');
    expect((await statusAfter('unpaid', 'active')).billingStatus).toBe('past_due');
  });

  it('clears the card and the item when the subscription ends', async () => {
    const user = await statusAfter('canceled', 'active');
    expect(user.billingStatus).toBe('none');
    expect(user.stripeSubscriptionItemId).toBeNull();
  });

  it('records no subscription item when the metered price is absent', async () => {
    const user = await makeUser('cus_alice');
    const stripe = fakeStripe();
    stripe.setWebhookEvent(subscriptionEvent('active', 'cus_alice', 'price_something_else'));
    await service(stripe).handleWebhook('{}', 'sig');

    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after!.billingStatus).toBe('active');
    expect(after!.stripeSubscriptionItemId).toBeNull();
  });

  it('only touches the customer the event names', async () => {
    const alice = await makeUser('cus_alice', 'none');
    const bob = await makeUser('cus_bob', 'none');
    const stripe = fakeStripe();
    stripe.setWebhookEvent(subscriptionEvent('active', 'cus_alice'));
    await service(stripe).handleWebhook('{}', 'sig');

    const [a] = await db.select().from(users).where(eq(users.id, alice.id));
    const [b] = await db.select().from(users).where(eq(users.id, bob.id));
    expect(a!.billingStatus).toBe('active');
    expect(b!.billingStatus).toBe('none');
  });

  it('marks past_due when an invoice payment fails', async () => {
    const user = await makeUser('cus_alice', 'active');
    const stripe = fakeStripe();
    stripe.setWebhookEvent({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_alice' } },
    });
    await service(stripe).handleWebhook('{}', 'sig');

    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after!.billingStatus).toBe('past_due');
  });

  it('rejects a forged signature', async () => {
    const stripe = fakeStripe();
    stripe.setWebhookEvent(subscriptionEvent('active'));
    await expect(service(stripe).handleWebhook('{}', 'bad')).rejects.toThrow(/signature/);
  });

  it('ignores event types it does not handle', async () => {
    const user = await makeUser('cus_alice', 'active');
    const stripe = fakeStripe();
    stripe.setWebhookEvent({ type: 'customer.created', data: { object: {} } });

    const type = await service(stripe).handleWebhook('{}', 'sig');

    expect(type).toBe('customer.created');
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after!.billingStatus).toBe('active'); // untouched
  });
});
