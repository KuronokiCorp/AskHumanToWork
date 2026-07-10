import { eq } from 'drizzle-orm';
import { users } from '@askhumantowork/db';
import type { AppContext } from './context.js';

/**
 * Feature entitlements per plan. Third-party sync (Microsoft To Do,
 * Google Tasks, future adapters) is a paid feature; everything else —
 * MCP, reminders, web/mobile — is free.
 */
export const PLAN_FEATURES = {
  free: { integrations: false },
  pro: { integrations: true },
} as const;

export type Plan = keyof typeof PLAN_FEATURES;

export async function getUserPlan(ctx: AppContext, userId: string): Promise<Plan> {
  const user = await ctx.db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { plan: true },
  });
  return (user?.plan ?? 'free') as Plan;
}

export async function canUseIntegrations(ctx: AppContext, userId: string): Promise<boolean> {
  return PLAN_FEATURES[await getUserPlan(ctx, userId)].integrations;
}
