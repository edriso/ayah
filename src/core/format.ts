// Builds the Arabic messages a subscriber receives. Pure string work so it
// is easy to test.
//
// We send plain text with NO Telegram parse_mode on purpose: Quran text
// contains characters that Markdown/HTML parsing would choke on (the send
// would fail with a 400). Plain text always renders correctly.
//
// A daily delivery can be MORE than one message: today's new ayah, then the
// review of the previous ayat. On long surahs the review itself is split
// across several messages so none ever exceeds Telegram's size limit. The
// longest single ayah is well under the limit, so today's ayah always fits.

import type { DisplayAyah, DisplaySurah } from './types';
import { toArabicDigits } from './arabic';

/** Telegram's hard limit on message length (characters). */
export const TELEGRAM_MAX = 4096;
// We pack messages up to a slightly smaller size to leave margin for the way
// Telegram counts emoji and any future small wording changes.
const SAFE_LIMIT = 4000;

/** Wrap an ayah number in the ornamented end-of-ayah brackets: ﴿٥﴾. */
export function ayahMarker(numberInSurah: number): string {
  return `﴿${toArabicDigits(numberInSurah)}﴾`;
}

/**
 * Arabic-correct phrase for "the last N ayat", following number-noun
 * agreement (singular for 1, dual for 2, plural آيات for 3-10, singular آية
 * for 11+). The count digit is shown only from 3 up, where it reads naturally.
 */
export function reviewCountPhrase(count: number): string {
  if (count === 1) return 'آخر آية';
  if (count === 2) return 'آخر آيتين';
  if (count <= 10) return `آخر ${toArabicDigits(count)} آيات`;
  return `آخر ${toArabicDigits(count)} آية`;
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
   * The previous ayat to review, in ascending order, NOT including today.
   * May be empty (review turned off, or today is ayah 1).
   */
  review: DisplayAyah[];
  /**
   * The basmala text to show as the surah opening, or undefined to show
   * none. The caller passes it only when this delivery covers the start of a
   * surah that uses a basmala. Passing the text in (instead of hard-coding
   * it) keeps what we display identical to the verified source.
   */
  basmala?: string;
}

/**
 * Build the ordered list of messages to send for one delivery:
 *   - message 1: today's new ayah (with the surah name, and the basmala when
 *     the surah opening is shown);
 *   - then the review of the previous ayat, as ONE message when it fits, or
 *     several messages split at ayah boundaries when it is too long.
 *
 * Returns at least one message.
 */
export function formatDailyMessages(input: DailyMessageInput): string[] {
  const { surah, today, review, basmala } = input;

  const opening = basmala ? `\n${basmala}` : '';
  const todayBlock = `🌿 آية اليوم\n\nسورة ${surah.nameAr}${opening}\n\n${formatAyahLine(today)}`;

  if (review.length === 0) return [todayBlock];

  const header = `📖 للمراجعة (${reviewCountPhrase(review.length)} من سورة ${surah.nameAr})`;
  const lines = review.map(formatAyahLine);

  // Happy path: everything fits in one message, keep it as one.
  const combined = `${todayBlock}\n\n———\n\n${header}\n\n${lines.join('\n')}`;
  if (combined.length <= SAFE_LIMIT) return [combined];

  // Too long: today's ayah on its own, then the review split into chunks.
  return [todayBlock, ...chunkReview(header, lines, SAFE_LIMIT)];
}

/**
 * Pack review lines into messages no longer than `limit`. The first message
 * carries the full header; later messages carry a short "continued" header.
 * A single ayah line always fits (the longest ayah is far under the limit),
 * so no line is ever split mid-ayah.
 */
function chunkReview(header: string, lines: string[], limit: number): string[] {
  const continued = '📖 (تابع المراجعة)';
  const messages: string[] = [];
  let head = header;
  let body: string[] = [];

  const flush = () => {
    messages.push(`${head}\n\n${body.join('\n')}`);
    head = continued;
    body = [];
  };

  for (const line of lines) {
    const trial = `${head}\n\n${[...body, line].join('\n')}`;
    if (body.length > 0 && trial.length > limit) flush();
    body.push(line);
  }
  if (body.length > 0) flush();
  return messages;
}
