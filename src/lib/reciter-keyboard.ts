import { InlineKeyboard } from 'grammy';

// Callback data for the reciter picker. A pick carries the reciter key (or the
// "none" sentinel): "ayah:reciter:husary-muallim", "ayah:reciter:none". Keys
// are short, well under Telegram's 64-byte callback limit, and the whole
// keyboard (7 reciters + none) is far under the 100-button cap, so it needs no
// pagination.
export const RECITER_PICK_PREFIX = 'ayah:reciter:';

/** The minimum a reciter needs to render a pick button. */
export interface ReciterButton {
  key: string;
  nameAr: string;
}

/**
 * Build the reciter picker: one button per reciter (current choice marked with
 * a check), then a "no recitation" button. The reciter list, the "none" key and
 * its label are passed in (not imported) so this stays a pure UI builder with no
 * database dependency. One button per row keeps the Arabic names readable.
 */
export function buildReciterKeyboard(
  reciters: readonly ReciterButton[],
  currentKey: string,
  noneKey: string,
  noneLabel: string,
): InlineKeyboard {
  const label = (key: string, text: string) => (key === currentKey ? `✅ ${text}` : text);
  const kb = new InlineKeyboard();
  for (const r of reciters) {
    kb.text(label(r.key, r.nameAr), `${RECITER_PICK_PREFIX}${r.key}`).row();
  }
  kb.text(label(noneKey, noneLabel), `${RECITER_PICK_PREFIX}${noneKey}`);
  return kb;
}
