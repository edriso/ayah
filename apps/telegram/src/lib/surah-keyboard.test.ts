import { describe, it, expect } from 'vitest';
import {
  buildSurahKeyboard,
  surahPageCount,
  clampSurahPage,
  SURAH_PICK_PREFIX,
  SURAH_PAGE_PREFIX,
  SURAH_NOOP,
  SURAH_PAGE_SIZE,
} from './surah-keyboard';

// A stand-in list of all 114 surahs (names do not matter for the layout).
const SURAHS = Array.from({ length: 114 }, (_, i) => ({ number: i + 1, nameAr: `س${i + 1}` }));

const callbacks = (page: number) =>
  buildSurahKeyboard(SURAHS, page)
    .inline_keyboard.flat()
    .map((b) => (b as { callback_data?: string }).callback_data ?? '');

describe('surahPageCount / clampSurahPage', () => {
  it('spans 114 surahs across ceil(114/size) pages', () => {
    expect(surahPageCount(114)).toBe(Math.ceil(114 / SURAH_PAGE_SIZE));
    expect(surahPageCount(0)).toBe(1); // never zero pages
  });

  it('clamps a page index into range', () => {
    expect(clampSurahPage(-3, 114)).toBe(0);
    expect(clampSurahPage(999, 114)).toBe(surahPageCount(114) - 1);
    expect(clampSurahPage(2, 114)).toBe(2);
  });
});

describe('buildSurahKeyboard', () => {
  it('shows SURAH_PAGE_SIZE pick buttons on a full page, each ayah:surah:<n>', () => {
    const picks = callbacks(0).filter((d) => d.startsWith(SURAH_PICK_PREFIX));
    expect(picks).toHaveLength(SURAH_PAGE_SIZE);
    expect(picks[0]).toBe(`${SURAH_PICK_PREFIX}1`);
    expect(picks).toContain(`${SURAH_PICK_PREFIX}${SURAH_PAGE_SIZE}`);
  });

  it('has no "previous" on the first page and a "next" page link', () => {
    const cbs = callbacks(0);
    expect(cbs).toContain(SURAH_NOOP); // the page indicator
    expect(cbs).toContain(`${SURAH_PAGE_PREFIX}1`); // next
    expect(cbs).not.toContain(`${SURAH_PAGE_PREFIX}0`); // no self/prev link on page 0
  });

  it('has no "next" on the last page and a "previous" page link', () => {
    const last = surahPageCount(114) - 1;
    const cbs = callbacks(last);
    expect(cbs).toContain(`${SURAH_PAGE_PREFIX}${last - 1}`); // previous
    expect(cbs).not.toContain(`${SURAH_PAGE_PREFIX}${last + 1}`); // nothing past the end
  });

  it('keeps every callback under the Telegram 64-byte limit', () => {
    for (const d of callbacks(0)) expect(Buffer.byteLength(d, 'utf8')).toBeLessThanOrEqual(64);
  });
});
