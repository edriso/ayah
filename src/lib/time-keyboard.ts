import { InlineKeyboard } from 'grammy';
import { formatTimeAr } from './copy';

// Callback data prefix for the time picker, e.g. "ayah:time:0700".
export const TIME_PICK_PREFIX = 'ayah:time:';

// A few common send times. Typing a 24-hour time is error-prone for the
// audience, so most users just tap one of these; the free-text "/time HH:MM"
// path stays available for anything else.
const PRESET_TIMES: Array<{ hour: number; minute: number }> = [
  { hour: 5, minute: 0 },
  { hour: 6, minute: 0 },
  { hour: 7, minute: 0 },
  { hour: 8, minute: 0 },
  { hour: 9, minute: 0 },
  { hour: 17, minute: 0 },
  { hour: 20, minute: 0 },
  { hour: 21, minute: 0 },
];

/** Build the preset-times keyboard, three per row, labelled in Arabic digits. */
export function buildTimeKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  PRESET_TIMES.forEach((t, i) => {
    const hh = String(t.hour).padStart(2, '0');
    const mm = String(t.minute).padStart(2, '0');
    kb.text(formatTimeAr(t.hour, t.minute), `${TIME_PICK_PREFIX}${hh}${mm}`);
    if ((i + 1) % 3 === 0) kb.row();
  });
  return kb;
}
