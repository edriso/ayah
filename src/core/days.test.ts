import { describe, it, expect } from 'vitest';
import {
  ALL_DAYS,
  NO_DAYS,
  isDayActive,
  withDayOn,
  withDayOff,
  toggleDay,
  activeDaysList,
  maskFromDays,
} from './days';

describe('active days mask', () => {
  it('ALL_DAYS has every weekday on', () => {
    expect(ALL_DAYS).toBe(127);
    for (let d = 1; d <= 7; d++) expect(isDayActive(ALL_DAYS, d)).toBe(true);
  });

  it('NO_DAYS has every weekday off', () => {
    for (let d = 1; d <= 7; d++) expect(isDayActive(NO_DAYS, d)).toBe(false);
  });

  it('maps Monday to bit 0 and Sunday to bit 6', () => {
    expect(maskFromDays([1])).toBe(0b0000001);
    expect(maskFromDays([7])).toBe(0b1000000);
  });

  it('round-trips a list of days through a mask', () => {
    const days = [1, 3, 5, 7];
    expect(activeDaysList(maskFromDays(days))).toEqual(days);
  });

  it('withDayOn and withDayOff do not touch other days', () => {
    let mask = NO_DAYS;
    mask = withDayOn(mask, 3);
    expect(activeDaysList(mask)).toEqual([3]);
    mask = withDayOn(mask, 6);
    expect(activeDaysList(mask)).toEqual([3, 6]);
    mask = withDayOff(mask, 3);
    expect(activeDaysList(mask)).toEqual([6]);
  });

  it('toggleDay flips a single day each way', () => {
    expect(activeDaysList(toggleDay(NO_DAYS, 2))).toEqual([2]);
    expect(activeDaysList(toggleDay(ALL_DAYS, 2))).toEqual([1, 3, 4, 5, 6, 7]);
  });

  it('rejects weekdays outside 1..7', () => {
    expect(() => isDayActive(ALL_DAYS, 0)).toThrow();
    expect(() => isDayActive(ALL_DAYS, 8)).toThrow();
  });
});
