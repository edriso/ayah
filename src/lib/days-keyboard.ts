import { InlineKeyboard } from 'grammy';
import { isDayActive } from '../core';
import { dayNameAr, WEEKDAY_DISPLAY_ORDER } from './copy';

// Callback data prefixes. Keep them short and namespaced so they never
// clash with anything else the bot might add later.
export const DAY_TOGGLE_PREFIX = 'ayah:day:';
export const DAYS_DONE = 'ayah:days:done';

/**
 * Build the day-picker keyboard. Each day shows a check when it is on. Days
 * are laid out two per row in the order Arabic speakers expect (Saturday
 * first, Friday last; see WEEKDAY_DISPLAY_ORDER), with a "done" button last.
 * On a right-to-left screen the first button in a row sits on the right, so
 * Saturday lands top-right and the week reads naturally from there.
 */
export function buildDaysKeyboard(mask: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  WEEKDAY_DISPLAY_ORDER.forEach((iso, i) => {
    const mark = isDayActive(mask, iso) ? '✅ ' : '⬜️ ';
    kb.text(`${mark}${dayNameAr(iso)}`, `${DAY_TOGGLE_PREFIX}${iso}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  // Plain "تم" so the screen does not show two different check glyphs (the ✅
  // already means "this day is selected").
  kb.row().text('تم', DAYS_DONE);
  return kb;
}
