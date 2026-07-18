import Stripe from 'stripe';
import { and, asc, eq, gt, gte, inArray } from 'drizzle-orm';
import { aiUsageEvents, users } from '@askhumantowork/db';
import type { BillingStatus } from '@askhumantowork/shared';
import type { AppContext } from './context.js';
import { UserFacingError } from './todo-service.js';

/**
 * Stripe usage-based billing for AI overage.
 *
 * Uses **Billing Meters**, not the legacy usage-records API — `UsageRecord` and
 * friends were removed in Stripe's 2025-03-31 API version, so metered prices
 * must now be attached to a meter and usage reported as meter events.
 * https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api
 *
 * We meter **micro-USD of billable spend**, not tokens: a single meter sums one
 * value, and input/output tokens are priced differently, so converting to money
 * on our side keeps it to one meter and one price. The Stripe price is
 * therefore $0.0001 per unit (`unit_amount_decimal: '0.0001'` cents), which
 * makes 1,000,000 units exactly $1.00.
 */

/** Meter events older than this are rejected by Stripe (35 days). */
const MAX_EVENT_AGE_MS = 34 * 24 * 3_600_000; // one day of margin

export interface StripeConfig {
  secretKey: string;
  /** `event_name` of the Billing Meter that aggregates AI spend. */
  meterEventName: string;
  /** Recurring metered price tied to that meter. */
  priceId: string;
  webhookSecret: string;
}

export function stripeConfigFromEnv(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_AI_PRICE_ID;
  if (!secretKey || !priceId) return null; // billing simply stays off
  return {
    secretKey,
    priceId,
    meterEventName: process.env.STRIPE_AI_METER_EVENT ?? 'ai_usage_micros',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  };
}

export class StripeBillingService {
  private stripe: Stripe;

  constructor(
    private ctx: AppContext,
    private config: StripeConfig,
  ) {
    this.stripe = new Stripe(config.secretKey);
  }

  /** Get or create this user's Stripe customer, memoized on the user row. */
  async ensureCustomer(userId: string): Promise<string> {
    const user = await this.ctx.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new UserFacingError('user not found');
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });
    await this.ctx.db
      .update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, userId));
    return customer.id;
  }

  /** Checkout session that puts a card on file and starts the metered subscription. */
  async createCheckoutSession(userId: string, returnUrl: string): Promise<string> {
    const customerId = await this.ensureCustomer(userId);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: this.config.priceId }],
      success_url: `${returnUrl}?billing=ok`,
      cancel_url: `${returnUrl}?billing=cancelled`,
      metadata: { userId },
    });
    if (!session.url) throw new UserFacingError('could not start checkout');
    return session.url;
  }

  /** Billing portal, for updating the card or cancelling. */
  async createPortalSession(userId: string, returnUrl: string): Promise<string> {
    const customerId = await this.ensureCustomer(userId);
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  /**
   * Push un-reported overage to Stripe.
   *
   * Runs on a schedule rather than inline with the chat request: Stripe
   * processes meter events asynchronously anyway, and an outage on their side
   * must never fail a user's message.
   *
   * Stripe allows only **one concurrent meter-event call per meter+customer
   * pair**, so events are grouped by customer and sent sequentially within each
   * group. The usage row's UUID is the `identifier`, which makes retries
   * idempotent within Stripe's ~24h dedup window.
   */
  async reportPendingUsage(limit = 500): Promise<{ reported: number; skipped: number }> {
    const pending = await this.ctx.db
      .select({
        id: aiUsageEvents.id,
        ownerId: aiUsageEvents.ownerId,
        billedMicros: aiUsageEvents.billedMicros,
        createdAt: aiUsageEvents.createdAt,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(aiUsageEvents)
      .innerJoin(users, eq(users.id, aiUsageEvents.ownerId))
      .where(
        and(
          eq(aiUsageEvents.reportedToStripe, false),
          gt(aiUsageEvents.billedMicros, 0),
          gte(aiUsageEvents.createdAt, new Date(Date.now() - MAX_EVENT_AGE_MS)),
        ),
      )
      .orderBy(asc(aiUsageEvents.createdAt))
      .limit(limit);

    const byCustomer = new Map<string, typeof pending>();
    const skippedIds: string[] = [];
    for (const row of pending) {
      // No customer means they never added a card — nothing to bill against.
      if (!row.stripeCustomerId) {
        skippedIds.push(row.id);
        continue;
      }
      const group = byCustomer.get(row.stripeCustomerId) ?? [];
      group.push(row);
      byCustomer.set(row.stripeCustomerId, group);
    }

    let reported = 0;
    // Customers in parallel, events within a customer strictly sequential.
    await Promise.all(
      [...byCustomer.entries()].map(async ([customerId, rows]) => {
        for (const row of rows) {
          try {
            await this.stripe.billing.meterEvents.create({
              event_name: this.config.meterEventName,
              identifier: row.id,
              timestamp: Math.floor(row.createdAt.getTime() / 1000),
              payload: {
                stripe_customer_id: customerId,
                value: String(row.billedMicros),
              },
            });
            await this.ctx.db
              .update(aiUsageEvents)
              .set({ reportedToStripe: true })
              .where(eq(aiUsageEvents.id, row.id));
            reported++;
          } catch (err) {
            // Leave it unreported so the next run retries; `identifier` keeps
            // that safe if the event actually landed.
            console.error('[stripe] meter event failed', row.id, err);
            break; // stop this customer; keep ordering for the rest
          }
        }
      }),
    );

    if (skippedIds.length) {
      await this.ctx.db
        .update(aiUsageEvents)
        .set({ reportedToStripe: true })
        .where(inArray(aiUsageEvents.id, skippedIds));
    }

    return { reported, skipped: skippedIds.length };
  }

  /** Verify and apply a Stripe webhook. Returns the event type handled. */
  async handleWebhook(rawBody: Buffer | string, signature: string): Promise<string> {
    if (!this.config.webhookSecret) throw new UserFacingError('webhook secret not configured');
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.config.webhookSecret,
    );

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await this.applySubscription(sub);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await this.setStatusByCustomer(invoice.customer, 'past_due');
        break;
      }
      default:
        break;
    }
    return event.type;
  }

  private async applySubscription(sub: Stripe.Subscription): Promise<void> {
    const status: BillingStatus =
      sub.status === 'active' || sub.status === 'trialing'
        ? 'active'
        : sub.status === 'past_due' || sub.status === 'unpaid'
          ? 'past_due'
          : 'none';

    // The metered item is what usage is billed against; remember it so we can
    // show the user what they're subscribed to.
    const item = sub.items.data.find((i) => i.price.id === this.config.priceId);
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

    await this.ctx.db
      .update(users)
      .set({
        billingStatus: status,
        stripeSubscriptionItemId: status === 'none' ? null : (item?.id ?? null),
      })
      .where(eq(users.stripeCustomerId, customerId));
  }

  private async setStatusByCustomer(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
    status: BillingStatus,
  ): Promise<void> {
    if (!customer) return;
    const customerId = typeof customer === 'string' ? customer : customer.id;
    await this.ctx.db
      .update(users)
      .set({ billingStatus: status })
      .where(eq(users.stripeCustomerId, customerId));
  }
}
