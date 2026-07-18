import { and, eq, gte, sql } from 'drizzle-orm';
import { aiUsageEvents, users } from '@askhumantowork/db';
import type { UsageSummary } from '@askhumantowork/shared';
import type { AppContext } from './context.js';

/**
 * Money is tracked in **micro-USD** (1e-6 USD) everywhere in this module.
 * Integers avoid the float drift you'd get accumulating fractions of a cent
 * across thousands of small model calls, and they map straight onto the
 * `*_micros` integer columns.
 */
export const MICROS_PER_USD = 1_000_000;

/** Free AI spend per user per calendar month, before a card is required. */
export const FREE_ALLOWANCE_MICROS = 1 * MICROS_PER_USD; // $1.00

/**
 * Multiplier applied to our raw provider cost to get the user-facing price.
 * Covers provider cost variance plus Stripe's per-transaction cut.
 */
export const PRICE_MARKUP = 2;

/** Start of the current billing period — the 1st of the month, UTC. */
export function billingPeriodStart(at = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export function applyMarkup(costMicros: number): number {
  return Math.ceil(costMicros * PRICE_MARKUP);
}

/**
 * Split one charge against the remaining free allowance.
 *
 * The free tier is a spend allowance rather than a message count, so a long
 * conversation draws it down faster than a short one — but the split is exact:
 * a charge that straddles the boundary is part free, part billed.
 */
export function splitAgainstAllowance(
  priceMicros: number,
  usedBeforeMicros: number,
  allowanceMicros = FREE_ALLOWANCE_MICROS,
): { freeMicros: number; billedMicros: number } {
  const remainingFree = Math.max(0, allowanceMicros - usedBeforeMicros);
  const freeMicros = Math.min(priceMicros, remainingFree);
  return { freeMicros, billedMicros: priceMicros - freeMicros };
}

interface PeriodTotals {
  usedMicros: number;
  billedMicros: number;
  messageCount: number;
}

/** Sum this user's AI spend for the current billing period. */
export async function periodTotals(
  ctx: AppContext,
  userId: string,
  periodStart = billingPeriodStart(),
): Promise<PeriodTotals> {
  const [row] = await ctx.db
    .select({
      usedMicros: sql<number>`coalesce(sum(${aiUsageEvents.priceMicros}), 0)::int`,
      billedMicros: sql<number>`coalesce(sum(${aiUsageEvents.billedMicros}), 0)::int`,
      messageCount: sql<number>`count(*)::int`,
    })
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.ownerId, userId), gte(aiUsageEvents.createdAt, periodStart)));

  return {
    usedMicros: row?.usedMicros ?? 0,
    billedMicros: row?.billedMicros ?? 0,
    messageCount: row?.messageCount ?? 0,
  };
}

export async function usageSummary(ctx: AppContext, userId: string): Promise<UsageSummary> {
  const periodStart = billingPeriodStart();
  const totals = await periodTotals(ctx, userId, periodStart);
  const user = await ctx.db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { billingStatus: true },
  });
  const billingStatus = user?.billingStatus ?? 'none';

  return {
    periodStart: periodStart.toISOString(),
    billingStatus,
    freeAllowanceMicros: FREE_ALLOWANCE_MICROS,
    usedMicros: totals.usedMicros,
    remainingFreeMicros: Math.max(0, FREE_ALLOWANCE_MICROS - totals.usedMicros),
    billedMicros: totals.billedMicros,
    messageCount: totals.messageCount,
    exhausted: totals.usedMicros >= FREE_ALLOWANCE_MICROS && billingStatus !== 'active',
  };
}

/**
 * May this user send another AI message right now?
 *
 * Free allowance left → yes. Allowance gone → only with an active card.
 * `past_due` deliberately blocks: a failed invoice shouldn't keep accruing
 * overage we may never collect.
 */
export async function canSpend(
  ctx: AppContext,
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const summary = await usageSummary(ctx, userId);
  if (summary.remainingFreeMicros > 0) return { allowed: true };
  if (summary.billingStatus === 'active') return { allowed: true };
  if (summary.billingStatus === 'past_due') {
    return {
      allowed: false,
      reason: 'Your last payment failed. Update your card to keep using the assistant.',
    };
  }
  return {
    allowed: false,
    reason: "You've used this month's free AI allowance. Add a card to continue.",
  };
}
