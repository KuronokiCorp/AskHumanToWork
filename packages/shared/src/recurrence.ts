/**
 * Lightweight recurrence rules (RRULE-lite). Stored as JSONB on todos.
 * When a recurring todo is completed, the server spawns the next occurrence.
 */

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** every N units, default 1 */
  interval: number;
  /** 0=Sun … 6=Sat; only for weekly */
  byWeekday?: number[];
  /** original human phrase, for display ("every monday") */
  display: string;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/**
 * Parse phrases like:
 *   "every day" / "daily" · "every 2 days"
 *   "every week" / "weekly" · "every monday" · "every mon, wed and fri"
 *   "every 2 weeks" · "every month" / "monthly" · "every 3 months"
 *   "every year" / "yearly" / "annually"
 * Returns null if not recognized.
 */
export function parseRecurrence(text: string): Recurrence | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  const display = text.trim();

  if (/^(daily|every ?day)$/.test(t)) return { freq: 'daily', interval: 1, display };
  if (/^(weekly|every week)$/.test(t)) return { freq: 'weekly', interval: 1, display };
  if (/^(monthly|every month)$/.test(t)) return { freq: 'monthly', interval: 1, display };
  if (/^(yearly|annually|every year)$/.test(t)) return { freq: 'yearly', interval: 1, display };
  if (/^every (week ?day|work ?day)s?$/.test(t))
    return { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5], display };
  if (/^every weekend$/.test(t)) return { freq: 'weekly', interval: 1, byWeekday: [6, 0], display };

  const interval = t.match(/^every (\d+) (day|week|month|year)s?$/);
  if (interval) {
    const n = Number(interval[1]);
    if (n >= 1 && n <= 365) {
      const freq = (interval[2] + 'ly').replace('dayly', 'daily') as Recurrence['freq'];
      return { freq, interval: n, display };
    }
  }

  // "every monday", "every mon and thu", "every tue, thu"
  const daysMatch = t.match(/^every ((?:[a-z]+)(?:(?:,| and | & |, and )\s*[a-z]+)*)$/);
  if (daysMatch?.[1]) {
    const parts = daysMatch[1].split(/,| and | & /).map((s) => s.trim()).filter(Boolean);
    const days = parts.map((p) => WEEKDAYS[p]).filter((d): d is number => d !== undefined);
    if (days.length && days.length === parts.length) {
      return { freq: 'weekly', interval: 1, byWeekday: [...new Set(days)].sort(), display };
    }
  }

  return null;
}

/**
 * Next occurrence strictly after `after`, preserving `from`'s time-of-day.
 * `from` is the previous occurrence's due date.
 */
export function nextOccurrence(rule: Recurrence, from: Date, after: Date = new Date()): Date {
  const step = (d: Date): Date => {
    const n = new Date(d);
    switch (rule.freq) {
      case 'daily':
        n.setUTCDate(n.getUTCDate() + rule.interval);
        break;
      case 'weekly':
        if (rule.byWeekday?.length) {
          // advance one day at a time to the next allowed weekday (local-ish: UTC day used consistently)
          do {
            n.setUTCDate(n.getUTCDate() + 1);
          } while (!rule.byWeekday.includes(n.getUTCDay()));
        } else {
          n.setUTCDate(n.getUTCDate() + 7 * rule.interval);
        }
        break;
      case 'monthly':
        n.setUTCMonth(n.getUTCMonth() + rule.interval);
        break;
      case 'yearly':
        n.setUTCFullYear(n.getUTCFullYear() + rule.interval);
        break;
    }
    return n;
  };

  let next = step(from);
  // catch up if the previous due was long ago (bounded)
  for (let i = 0; i < 1000 && next <= after; i++) next = step(next);
  return next;
}
