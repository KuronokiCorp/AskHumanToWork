import { describe, expect, it } from 'vitest';
import { resolveNaturalDate, timezoneOffsetMinutes } from './dates.js';

// Fixed reference: 2026-07-10T01:00:00Z = 10:00 JST on Friday Jul 10
const ref = new Date('2026-07-10T01:00:00Z');

describe('timezoneOffsetMinutes', () => {
  it('computes JST (+540) and New York DST (-240)', () => {
    expect(timezoneOffsetMinutes('Asia/Tokyo', ref)).toBe(540);
    expect(timezoneOffsetMinutes('America/New_York', ref)).toBe(-240);
    expect(timezoneOffsetMinutes('UTC', ref)).toBe(0);
  });
});

describe('resolveNaturalDate', () => {
  it('resolves "tomorrow 3pm" in the user timezone', () => {
    const d = resolveNaturalDate('tomorrow 3pm', 'Asia/Tokyo', ref)!;
    // 2026-07-11 15:00 JST = 06:00 UTC
    expect(d.toISOString()).toBe('2026-07-11T06:00:00.000Z');
  });

  it('resolves "in 3 days" preserving time-of-day', () => {
    const d = resolveNaturalDate('in 3 days', 'Asia/Tokyo', ref)!;
    expect(d.toISOString()).toBe('2026-07-13T01:00:00.000Z');
  });

  it('defaults bare dates to 09:00 local', () => {
    const d = resolveNaturalDate('next tuesday', 'Asia/Tokyo', ref)!;
    // next Tuesday = Jul 14, 09:00 JST = 00:00 UTC
    expect(d.toISOString()).toBe('2026-07-14T00:00:00.000Z');
  });

  it('rolls forward: "friday 5pm" on a Friday morning is the same day', () => {
    const d = resolveNaturalDate('friday 5pm', 'Asia/Tokyo', ref)!;
    expect(d.toISOString()).toBe('2026-07-10T08:00:00.000Z'); // 17:00 JST
  });

  it('respects a different timezone for the same phrase', () => {
    // At the reference instant it is Fri Jul 10 in Tokyo but still Thu Jul 9 in New York,
    // so "tomorrow" lands on different calendar days.
    const tokyo = resolveNaturalDate('tomorrow 9am', 'Asia/Tokyo', ref)!;
    const ny = resolveNaturalDate('tomorrow 9am', 'America/New_York', ref)!;
    expect(tokyo.toISOString()).toBe('2026-07-11T00:00:00.000Z'); // Jul 11 09:00 JST
    expect(ny.toISOString()).toBe('2026-07-10T13:00:00.000Z'); // Jul 10 09:00 EDT
  });

  it('returns null for garbage', () => {
    expect(resolveNaturalDate('blorp qux', 'UTC', ref)).toBeNull();
  });
});
