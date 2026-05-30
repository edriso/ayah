import { InlineKeyboard } from 'grammy';
import { isDayActive } from '@ayah/core';
import { dayNameAr } from './copy';

// Callback data prefixes. Keep them short and namespaced so they never
// clash with anything else the bot might add later.
export const DAY_TOGGLE_PREFIX = 'ayah:day:';
export const DAYS_DONE = 'ayah:days:done';

/**
 * Build the day-picker keyboard. Each day shows a check when it is on.
 * Days are laid out two per row, Monday first, with a "done" button last.
 */
export function buildDaysKeyboard(mask: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let iso = 1; iso <= 7; iso++) {
    const mark = isDayActive(mask, iso) ? '✅ ' : '⬜️ ';
    kb.text(`${mark}${dayNameAr(iso)}`, `${DAY_TOGGLE_PREFIX}${iso}`);
    if (iso % 2 === 0) kb.row();
  }
  // Plain "تم" so the screen does not show two different check glyphs (the ✅
  // already means "this day is selected").
  kb.row().text('تم', DAYS_DONE);
  return kb;
}
