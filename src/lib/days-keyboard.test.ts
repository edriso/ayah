import { describe, it, expect } from 'vitest';
import { ALL_DAYS, NO_DAYS, maskFromDays } from '../core';
import { buildDaysKeyboard, DAY_TOGGLE_PREFIX, DAYS_DONE } from './days-keyboard';

// The ISO weekday each toggle button carries, in the order they appear.
const toggleOrder = (mask: number) =>
  buildDaysKeyboard(mask)
    .inline_keyboard.flat()
    .map((b) => (b as { callback_data?: string }).callback_data ?? '')
    .filter((d) => d.startsWith(DAY_TOGGLE_PREFIX))
    .map((d) => Number(d.slice(DAY_TOGGLE_PREFIX.length)));

describe('buildDaysKeyboard', () => {
  it('orders the day toggles Saturday first, Friday last', () => {
    // ISO: Sat=6, Sun=7, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5.
    expect(toggleOrder(NO_DAYS)).toEqual([6, 7, 1, 2, 3, 4, 5]);
  });

  it('has a toggle for all seven days plus a done button', () => {
    const data = buildDaysKeyboard(ALL_DAYS)
      .inline_keyboard.flat()
      .map((b) => (b as { callback_data?: string }).callback_data ?? '');
    expect(data.filter((d) => d.startsWith(DAY_TOGGLE_PREFIX))).toHaveLength(7);
    expect(data).toContain(DAYS_DONE);
  });

  it('marks active days with a check and inactive ones with a box', () => {
    // Only Saturday (6) on: the first button (Saturday) is checked.
    const rows = buildDaysKeyboard(maskFromDays([6])).inline_keyboard;
    const firstLabel = (rows[0][0] as { text: string }).text;
    expect(firstLabel).toContain('✅');
    expect(firstLabel).toContain('السبت');
  });
});
