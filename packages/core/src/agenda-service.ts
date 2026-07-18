import { eq } from 'drizzle-orm';
import { users } from '@askhumantowork/db';
import {
  formatInTimezone,
  timezoneOffsetMinutes,
  type Agenda,
  type Briefing,
  type Todo,
} from '@askhumantowork/shared';
import type { AppContext } from './context.js';
import { TodoService, type TokenProjectScope } from './todo-service.js';

export class AgendaService {
  private todoSvc: TodoService;

  constructor(private ctx: AppContext) {
    this.todoSvc = new TodoService(ctx);
  }

  /** Today / overdue / next-7-days snapshot in the user's timezone. */
  async forUser(userId: string, scope?: TokenProjectScope | null): Promise<Agenda> {
    const user = await this.ctx.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new Error('user not found');
    const tz = user.timezone;

    const now = new Date();
    // End of "today" in the user's timezone.
    const offset = timezoneOffsetMinutes(tz, now);
    const local = new Date(now.getTime() + offset * 60_000);
    const endOfDayLocal = Date.UTC(
      local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59, 59,
    );
    const endOfToday = new Date(endOfDayLocal - offset * 60_000);
    const endOfWeek = new Date(endOfToday.getTime() + 7 * 24 * 3_600_000);

    const open = await this.todoSvc.list(
      userId,
      {
        status: 'open',
        limit: 200,
        offset: 0,
      },
      scope,
    );

    const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt) < now);
    const today = open.filter(
      (t) => t.dueAt && new Date(t.dueAt) >= now && new Date(t.dueAt) <= endOfToday,
    );
    const upcoming = open.filter(
      (t) => t.dueAt && new Date(t.dueAt) > endOfToday && new Date(t.dueAt) <= endOfWeek,
    );

    const parts: string[] = [];
    if (overdue.length) parts.push(`${overdue.length} overdue`);
    if (today.length) parts.push(`${today.length} due today`);
    if (upcoming.length) parts.push(`${upcoming.length} due in the next 7 days`);
    const summary = parts.length ? parts.join(', ') + '.' : 'Nothing due — all clear.';

    return {
      date: formatInTimezone(now, tz),
      timezone: tz,
      overdue,
      today,
      upcoming,
      summary,
    };
  }

  /**
   * Session-start diff for an agent: what the user completed and what was
   * added since `since` (typically the token's previous use), what's blocked
   * and why, what's overdue, and a ranked list of what to work on next.
   */
  async briefingForUser(
    userId: string,
    scope: TokenProjectScope | null | undefined,
    since: Date | null,
  ): Promise<Briefing> {
    const user = await this.ctx.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new Error('user not found');

    const all = await this.todoSvc.list(userId, { limit: 200, offset: 0 }, scope);
    const now = new Date();
    const actionable = all.filter((t) => t.status === 'open' || t.status === 'doing');

    const completedSinceLastSession = since
      ? all.filter(
          (t) => t.status === 'done' && t.completedAt && new Date(t.completedAt) > since,
        )
      : [];
    const addedSinceLastSession = since
      ? all.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && new Date(t.createdAt) > since)
      : [];
    const blocked = all.filter((t) => t.status === 'blocked');
    const overdue = actionable.filter((t) => t.dueAt && new Date(t.dueAt) < now);

    // Urgency ranking: overdue first (oldest due first), then by due date
    // (undated last), then by priority.
    const dueMs = (t: Todo) => (t.dueAt ? new Date(t.dueAt).getTime() : Number.POSITIVE_INFINITY);
    const nextSteps = [...actionable]
      .sort(
        (a, b) =>
          Number(dueMs(b) < now.getTime()) - Number(dueMs(a) < now.getTime()) ||
          dueMs(a) - dueMs(b) ||
          b.priority - a.priority,
      )
      .slice(0, 5);

    const parts: string[] = [];
    if (completedSinceLastSession.length)
      parts.push(`${completedSinceLastSession.length} completed since your last check-in`);
    if (addedSinceLastSession.length) parts.push(`${addedSinceLastSession.length} newly added`);
    if (blocked.length) parts.push(`${blocked.length} blocked`);
    if (overdue.length) parts.push(`${overdue.length} overdue`);
    const head = parts.length ? parts.join(', ') + '.' : 'No changes since your last check-in.';
    const next = nextSteps[0];
    const summary = next ? `${head} Suggested next: "${next.title}".` : `${head} Nothing open to work on.`;

    return {
      since: since?.toISOString() ?? null,
      timezone: user.timezone,
      summary,
      completedSinceLastSession,
      addedSinceLastSession,
      blocked,
      overdue,
      nextSteps,
    };
  }
}
