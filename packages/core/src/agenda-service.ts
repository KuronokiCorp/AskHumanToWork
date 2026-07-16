import { eq } from 'drizzle-orm';
import { users } from '@askhumantowork/db';
import { formatInTimezone, timezoneOffsetMinutes, type Agenda } from '@askhumantowork/shared';
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
}
