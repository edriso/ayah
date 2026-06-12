import { describe, it, expect } from 'vitest';
import { buildTafseerKeyboard, TAFSEER_PICK_PREFIX } from './tafseer-keyboard';

const EDITIONS = [
  { key: 'muyassar', nameAr: 'التفسير الميسر' },
  { key: 'saadi', nameAr: 'تفسير السعدي' },
  { key: 'ibnkathir', nameAr: 'تفسير ابن كثير', note: 'مطوّل — بداية ورابط' },
];

/** Flatten grammY's inline keyboard to plain { text, data } buttons. */
function buttons(kb: { inline_keyboard: { text: string; callback_data?: string }[][] }) {
  return kb.inline_keyboard.flat().map((b) => ({ text: b.text, data: b.callback_data }));
}

describe('buildTafseerKeyboard', () => {
  it('renders one pick button per edition, each carrying the pick prefix + key', () => {
    const btns = buttons(buildTafseerKeyboard(EDITIONS, 'muyassar'));
    expect(btns).toHaveLength(EDITIONS.length);
    for (const e of EDITIONS) {
      expect(btns.some((b) => b.data === `${TAFSEER_PICK_PREFIX}${e.key}`)).toBe(true);
    }
  });

  it('marks the current edition with a check and no other', () => {
    const btns = buttons(buildTafseerKeyboard(EDITIONS, 'saadi'));
    const checked = btns.filter((b) => b.text.startsWith('✅'));
    expect(checked).toHaveLength(1);
    expect(checked[0].text).toContain('تفسير السعدي');
  });

  it('appends the note in parentheses for an edition that has one', () => {
    const btns = buttons(buildTafseerKeyboard(EDITIONS, 'muyassar'));
    const ibnKathir = btns.find((b) => b.data === `${TAFSEER_PICK_PREFIX}ibnkathir`);
    expect(ibnKathir!.text).toContain('(مطوّل — بداية ورابط)');
  });

  it('keeps callback data within Telegram’s 64-byte limit', () => {
    for (const b of buttons(buildTafseerKeyboard(EDITIONS, 'muyassar'))) {
      expect(Buffer.byteLength(b.data!, 'utf8')).toBeLessThanOrEqual(64);
    }
  });
});
