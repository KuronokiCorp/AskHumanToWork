import { describe, expect, it } from 'vitest';
import { nextOccurrence, parseRecurrence } from './recurrence.js';

describe('parseRecurrence', () => {
  it('parses simple frequencies', () => {
    expect(parseRecurrence('every day')).toMatchObject({ freq: 'daily', interval: 1 });
    expect(parseRecurrence('daily')).toMatchObject({ freq: 'daily', interval: 1 });
    expect(parseRecurrence('weekly')).toMatchObject({ freq: 'weekly', interval: 1 });
    expect(parseRecurrence('every month')).toMatchObject({ freq: 'monthly', interval: 1 });
    expect(parseRecurrence('annually')).toMatchObject({ freq: 'yearly', interval: 1 });
  });

  it('parses intervals', () => {
    expect(parseRecurrence('every 2 weeks')).toMatchObject({ freq: 'weekly', interval: 2 });
    expect(parseRecurrence('every 3 months')).toMatchObject({ freq: 'monthly', interval: 3 });
    expect(parseRecurrence('every 10 days')).toMatchObject({ freq: 'daily', interval: 10 });
  });

  it('parses weekdays', () => {
    expect(parseRecurrence('every monday')).toMatchObject({ freq: 'weekly', byWeekday: [1] });
    expect(parseRecurrence('every mon and thu')).toMatchObject({ byWeekday: [1, 4] });
    expect(parseRecurrence('every tue, thu and sat')).toMatchObject({ byWeekday: [2, 4, 6] });
    expect(parseRecurrence('every weekday')).toMatchObject({ byWeekday: [1, 2, 3, 4, 5] });
  });

  it('rejects garbage', () => {
    expect(parseRecurrence('sometimes')).toBeNull();
    expect(parseRecurrence('every blorp')).toBeNull();
    expect(parseRecurrence('')).toBeNull();
  });
});

describe('nextOccurrence', () => {
  const mon = new Date('2026-07-13T09:00:00Z'); // Monday

  it('daily advances one day, preserving time', () => {
    const next = nextOccurrence({ freq: 'daily', interval: 1, display: 'daily' }, mon, mon);
    expect(next.toISOString()).toBe('2026-07-14T09:00:00.000Z');
  });

  it('weekly byWeekday jumps to the next allowed day', () => {
    const rule = { freq: 'weekly' as const, interval: 1, byWeekday: [1, 4], display: 'every mon and thu' };
    const next = nextOccurrence(rule, mon, mon);
    expect(next.toISOString()).toBe('2026-07-16T09:00:00.000Z'); // Thursday
    const afterThu = nextOccurrence(rule, next, next);
    expect(afterThu.toISOString()).toBe('2026-07-20T09:00:00.000Z'); // next Monday
  });

  it('monthly advances a month', () => {
    const next = nextOccurrence({ freq: 'monthly', interval: 1, display: 'monthly' }, mon, mon);
    expect(next.toISOString()).toBe('2026-08-13T09:00:00.000Z');
  });

  it('catches up when the previous due is far in the past', () => {
    const oldDue = new Date('2026-01-05T09:00:00Z');
    const now = new Date('2026-07-10T00:00:00Z');
    const next = nextOccurrence({ freq: 'weekly', interval: 1, byWeekday: [1], display: 'every monday' }, oldDue, now);
    expect(next.toISOString()).toBe('2026-07-13T09:00:00.000Z'); // first Monday after `now`
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });
});
