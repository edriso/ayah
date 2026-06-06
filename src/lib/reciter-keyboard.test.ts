import { describe, it, expect } from 'vitest';
import { buildReciterKeyboard, RECITER_PICK_PREFIX } from './reciter-keyboard';

const RECITERS = [
  { key: 'husary-muallim', nameAr: 'الحصري (المعلِّم)' },
  { key: 'husary', nameAr: 'محمود خليل الحصري' },
];

function buttons(kb: ReturnType<typeof buildReciterKeyboard>) {
  return kb.inline_keyboard.flat();
}

describe('buildReciterKeyboard', () => {
  it('renders one button per reciter plus a "none" button, all with the pick prefix', () => {
    const kb = buildReciterKeyboard(RECITERS, 'husary', 'none', 'بدون تلاوة 🔇');
    const btns = buttons(kb);
    expect(btns).toHaveLength(RECITERS.length + 1);
    for (const b of btns) {
      expect('callback_data' in b && b.callback_data.startsWith(RECITER_PICK_PREFIX)).toBe(true);
    }
    // The none button carries the none key.
    expect(btns.at(-1)).toMatchObject({ callback_data: `${RECITER_PICK_PREFIX}none` });
  });

  it('marks the current choice with a check and leaves the others unmarked', () => {
    const kb = buildReciterKeyboard(RECITERS, 'husary', 'none', 'بدون تلاوة 🔇');
    const btns = buttons(kb);
    const current = btns.find((b) => 'callback_data' in b && b.callback_data.endsWith(':husary'));
    const other = btns.find(
      (b) => 'callback_data' in b && b.callback_data.endsWith(':husary-muallim'),
    );
    expect(current!.text.startsWith('✅')).toBe(true);
    expect(other!.text.startsWith('✅')).toBe(false);
  });

  it('marks the none button when recitation is off', () => {
    const kb = buildReciterKeyboard(RECITERS, 'none', 'none', 'بدون تلاوة 🔇');
    const none = buttons(kb).at(-1)!;
    expect(none.text.startsWith('✅')).toBe(true);
  });

  it('keeps every callback_data within Telegram’s 64-byte limit', () => {
    const kb = buildReciterKeyboard(RECITERS, 'husary', 'none', 'بدون تلاوة 🔇');
    for (const b of buttons(kb)) {
      if ('callback_data' in b) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
    }
  });
});
