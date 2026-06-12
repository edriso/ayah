import { InlineKeyboard } from 'grammy';

// Callback data for the tafseer edition picker. A pick carries the edition key:
// "ayah:taf:src:saadi". Keys are short, well under Telegram's 64-byte callback
// limit, and the whole keyboard (a handful of editions) is far under the
// 100-button cap, so it needs no pagination. (Turning the tafseer on/off and
// switching text/link are separate buttons on the tafseer card; see bot.ts.)
export const TAFSEER_PICK_PREFIX = 'ayah:taf:src:';

/** The minimum an edition needs to render a pick button. `note` is an optional
 *  short hint shown in parentheses (e.g. that a long edition is link-based). */
export interface TafseerButton {
  key: string;
  nameAr: string;
  note?: string;
}

/**
 * Build the tafseer edition picker: one button per edition, the current choice
 * marked with a check. The edition list is passed in (not imported) so this
 * stays a pure UI builder with no database dependency. One button per row keeps
 * the Arabic names readable.
 */
export function buildTafseerKeyboard(
  editions: readonly TafseerButton[],
  currentKey: string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const e of editions) {
    const base = e.note ? `${e.nameAr} (${e.note})` : e.nameAr;
    const label = e.key === currentKey ? `✅ ${base}` : base;
    kb.text(label, `${TAFSEER_PICK_PREFIX}${e.key}`).row();
  }
  return kb;
}
