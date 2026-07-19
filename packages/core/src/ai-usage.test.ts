/**
 * Pure-function tests for the AI billing math. No database — the money split
 * is the part that must never drift, so it's tested in isolation.
 */
import { describe, expect, it } from 'vitest';
import {
  FREE_ALLOWANCE_MICROS,
  MICROS_PER_USD,
  applyMarkup,
  billingPeriodStart,
  splitAgainstAllowance,
} from './ai-usage.js';

describe('applyMarkup', () => {
  it('marks raw provider cost up', () => {
    expect(applyMarkup(1_000)).toBe(2_000);
  });

  it('rounds up so sub-micro fractions are never billed as zero', () => {
    expect(applyMarkup(0.4)).toBe(1);
  });
});

describe('splitAgainstAllowance', () => {
  it('charges nothing while the allowance covers it', () => {
    expect(splitAgainstAllowance(5_000, 0)).toEqual({ freeMicros: 5_000, billedMicros: 0 });
  });

  it('splits a charge that straddles the allowance boundary', () => {
    // $0.999 already used, so only 1_000 micros of free room remain.
    const used = FREE_ALLOWANCE_MICROS - 1_000;
    expect(splitAgainstAllowance(3_000, used)).toEqual({ freeMicros: 1_000, billedMicros: 2_000 });
  });

  it('bills the whole charge once the allowance is gone', () => {
    expect(splitAgainstAllowance(3_000, FREE_ALLOWANCE_MICROS)).toEqual({
      freeMicros: 0,
      billedMicros: 3_000,
    });
  });

  it('never bills negative when usage somehow overshoots the allowance', () => {
    const { freeMicros, billedMicros } = splitAgainstAllowance(
      500,
      FREE_ALLOWANCE_MICROS + 10_000,
    );
    expect(freeMicros).toBe(0);
    expect(billedMicros).toBe(500);
  });

  it('conserves the total across the split', () => {
    for (const used of [0, 250_000, FREE_ALLOWANCE_MICROS - 1, FREE_ALLOWANCE_MICROS * 2]) {
      const { freeMicros, billedMicros } = splitAgainstAllowance(7_777, used);
      expect(freeMicros + billedMicros).toBe(7_777);
    }
  });
});

describe('billingPeriodStart', () => {
  it('snaps to the first of the month in UTC', () => {
    expect(billingPeriodStart(new Date('2026-07-18T21:33:00Z')).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('keeps a month-boundary instant inside that month', () => {
    expect(billingPeriodStart(new Date('2026-07-01T00:00:00Z')).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });
});

describe('constants', () => {
  it('expresses the free allowance in micro-USD', () => {
    // A whole number of micros, and small enough that open signup without
    // billing can't run up a meaningful bill on our provider account.
    expect(Number.isInteger(FREE_ALLOWANCE_MICROS)).toBe(true);
    expect(FREE_ALLOWANCE_MICROS / MICROS_PER_USD).toBeLessThanOrEqual(1);
  });
});
