import { InlineKeyboard } from 'grammy';
import { toArabicDigits } from '../core';

// Callback data prefixes for the surah picker. A pick carries the surah
// number ("ayah:surah:67"); a page button carries the target page index
// ("ayah:spage:2"). Both stay tiny, well under Telegram's 64-byte limit, and
// the whole keyboard is far under the 100-button cap.
export const SURAH_PICK_PREFIX = 'ayah:surah:';
export const SURAH_PAGE_PREFIX = 'ayah:spage:';
// The page indicator does nothing when tapped; a dedicated callback lets the
// bot just answer it, instead of re-rendering the same page (which Telegram
// rejects with a "message is not modified" 400).
export const SURAH_NOOP = 'ayah:snoop';

// Surahs per page: 3 columns × 4 rows. 114 surahs span 10 pages. A modest
// page keeps the buttons readable on a phone and the message short.
export const SURAH_PAGE_SIZE = 12;

/** The minimum a surah row needs to render a pick button. */
export interface SurahButton {
  number: number;
  nameAr: string;
}

/** Total pages needed to show `count` surahs, at least one. */
export function surahPageCount(count: number): number {
  return Math.max(1, Math.ceil(count / SURAH_PAGE_SIZE));
}

/** Force a page index into 0..lastPage so a stale/old button can never throw. */
export function clampSurahPage(page: number, count: number): number {
  const last = surahPageCount(count) - 1;
  if (!Number.isFinite(page) || page < 0) return 0;
  return page > last ? last : page;
}

/**
 * Build the paginated surah picker. Each button shows "٦٧. الملك" and, when
 * tapped, starts the subscriber at that surah (ayah 1). A nav row carries
 * "previous"/"next" (only when there is somewhere to go) around a non-acting
 * page indicator. The surah list is passed in (not imported) so this stays a
 * pure UI builder with no database dependency.
 */
export function buildSurahKeyboard(surahs: readonly SurahButton[], page = 0): InlineKeyboard {
  const safePage = clampSurahPage(page, surahs.length);
  const start = safePage * SURAH_PAGE_SIZE;
  const slice = surahs.slice(start, start + SURAH_PAGE_SIZE);

  const kb = new InlineKeyboard();
  slice.forEach((s, i) => {
    kb.text(`${toArabicDigits(s.number)}. ${s.nameAr}`, `${SURAH_PICK_PREFIX}${s.number}`);
    if ((i + 1) % 3 === 0) kb.row();
  });

  // Navigation row. The indicator re-renders the same page (a harmless noop)
  // because every Telegram button needs callback data.
  const last = surahPageCount(surahs.length) - 1;
  kb.row();
  if (safePage > 0) kb.text('« السابق', `${SURAH_PAGE_PREFIX}${safePage - 1}`);
  kb.text(`${toArabicDigits(safePage + 1)}/${toArabicDigits(last + 1)}`, SURAH_NOOP);
  if (safePage < last) kb.text('التالي »', `${SURAH_PAGE_PREFIX}${safePage + 1}`);
  return kb;
}
