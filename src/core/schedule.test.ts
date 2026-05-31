import { describe, it, expect } from 'vitest';
import { getLocalContext, scheduledMinutes, dueLocalDate } from './schedule';
import { ALL_DAYS, maskFromDays } from './days';
import type { DeliverySchedule } from './types';

// A fixed reference instant: 2026-06-01 is a Monday.
// 04:00 UTC == 07:00 in Africa/Cairo (UTC+3 in summer / DST).
const MON_0400_UTC = new Date('2026-06-01T04:00:00Z');

describe('getLocalContext', () => {
  it('translates a UTC instant into Cairo local fields', () => {
    const ctx = getLocalContext('Africa/Cairo', MON_0400_UTC);
    expect(ctx.date).toBe('2026-06-01');
    expect(ctx.isoWeekday).toBe(1); // Monday
    expect(ctx.minutesSinceMidnight).toBe(7 * 60); // 07:00 local
  });

  it('can land on a different calendar day than UTC', () => {
    // 23:30 UTC is already the next day in Tokyo (UTC+9 -> 08:30).
    const ctx = getLocalContext('Asia/Tokyo', new Date('2026-06-01T23:30:00Z'));
    expect(ctx.date).toBe('2026-06-02');
    expect(ctx.isoWeekday).toBe(2); // Tuesday
    expect(ctx.minutesSinceMidnight).toBe(8 * 60 + 30);
  });
});

describe('scheduledMinutes', () => {
  it('combines hour and minute into minutes past midnight', () => {
    expect(scheduledMinutes(schedule({ deliveryHour: 7, deliveryMinute: 30 }))).toBe(450);
  });
});

describe('dueLocalDate', () => {
  it('is due once the local time reaches the send time on an active day', () => {
    const s = schedule({ deliveryHour: 7, deliveryMinute: 0 });
    expect(dueLocalDate(s, MON_0400_UTC)).toBe('2026-06-01');
  });

  it('is not due before the send time', () => {
    const s = schedule({ deliveryHour: 8, deliveryMinute: 0 }); // local is 07:00
    expect(dueLocalDate(s, MON_0400_UTC)).toBeNull();
  });

  it('stays due later the same day (catch-up after downtime)', () => {
    const s = schedule({ deliveryHour: 7, deliveryMinute: 0 });
    // Local 23:00 the same Monday, long after the 07:00 slot.
    const lateMonday = new Date('2026-06-01T20:00:00Z');
    expect(dueLocalDate(s, lateMonday)).toBe('2026-06-01');
  });

  it('is not due on a day the subscriber turned off', () => {
    // Only Fridays (ISO 5); the reference day is Monday.
    const s = schedule({ activeDays: maskFromDays([5]) });
    expect(dueLocalDate(s, MON_0400_UTC)).toBeNull();
  });

  it('returns the LOCAL date, which can differ from the UTC date', () => {
    const s = schedule({ timezone: 'Asia/Tokyo', deliveryHour: 8, deliveryMinute: 0 });
    expect(dueLocalDate(s, new Date('2026-06-01T23:30:00Z'))).toBe('2026-06-02');
  });
});

function schedule(overrides: Partial<DeliverySchedule> = {}): DeliverySchedule {
  return {
    timezone: 'Africa/Cairo',
    deliveryHour: 7,
    deliveryMinute: 0,
    activeDays: ALL_DAYS,
    ...overrides,
  };
}
