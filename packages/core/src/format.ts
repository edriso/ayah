// Builds the Arabic message a subscriber receives. Pure string work so it
// is easy to snapshot in tests.
//
// We send plain text with NO Telegram parse_mode on purpose: Quran text
// contains characters that Markdown/HTML parsing would choke on (the send
// would fail with a 400). Plain text always renders correctly. This is the
// same lesson the zaaduna bot learned.

import type { DisplayAyah, DisplaySurah } from './types';
import { toArabicDigits } from './arabic';

/** Wrap an ayah number in the ornamented end-of-ayah brackets: ﴿٥﴾. */
export function ayahMarker(numberInSurah: number): string {
  return `﴿${toArabicDigits(numberInSurah)}﴾`;
}

/** Render one ayah line: the text followed by its numbered marker. */
export function formatAyahLine(ayah: DisplayAyah): string {
  return `${ayah.text} ${ayahMarker(ayah.numberInSurah)}`;
}

export interface DailyMessageInput {
  surah: DisplaySurah;
  /** The ayah for today (the subscriber's current position). */
  today: DisplayAyah;
  /**
   * The review window for the same surah, in ascending order, ending with
   * today's ayah. When this has only one entry (today is ayah 1, or the
   * surah is brand new) the review section is left out to avoid repeating
   * the very same ayah twice.
   */
  review: DisplayAyah[];
  /**
   * The basmala text to show as the surah opening, or undefined/empty to
   * show none. The caller passes the seeded basmala string only when this
   * message covers the start of a surah that uses a basmala (see
   * surahUsesBasmala). Passing the text in (instead of hard-coding it) keeps
   * what we display identical to the verified source.
   */
  basmala?: string;
}

/**
 * Build the full daily message: a prominent "ayah of the day" block, then
 * the "last ten ayat" review block for the same surah.
 */
export function formatDailyMessage(input: DailyMessageInput): string {
  const { surah, today, review, basmala } = input;

  const blocks: string[] = [];

  // Block 1: today's ayah, with the surah name above it, and the basmala as
  // the surah opening when this message covers the start of the surah.
  const opening = basmala ? `\n${basmala}` : '';
  blocks.push(`🌿 آية اليوم\n\nسورة ${surah.nameAr}${opening}\n\n${formatAyahLine(today)}`);

  // Block 2: the review window. Skip it when it would only repeat today.
  const meaningfulReview = review.filter((a) => a.numberInSurah !== today.numberInSurah);
  if (meaningfulReview.length > 0) {
    const count = toArabicDigits(review.length);
    const lines = review.map(formatAyahLine).join('\n');
    blocks.push(`📖 للمراجعة (آخر ${count} آيات من سورة ${surah.nameAr})\n\n${lines}`);
  }

  // A thin divider keeps the two blocks visually apart in the chat.
  return blocks.join('\n\n———\n\n');
}
