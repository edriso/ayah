// Builds the Arabic messages a subscriber receives. Pure string work so it
// is easy to test.
//
// We send plain text with NO Telegram parse_mode on purpose: Quran text
// contains characters that Markdown/HTML parsing would choke on (the send
// would fail with a 400). Plain text always renders correctly.
//
// Reading order matters for hifz. A delivery is ONE passage read in mushaf
// order: the previous ayat (ascending) leading INTO today's new ayah, which
// sits last and is marked so the eye lands on it. The title names today's
// ayah up front (so the notification preview and the top of the message both
// show what is new), then the passage reads top to bottom up to it. This is
// the connecting recitation (الربط) hifaz is built on: you never read the new
// ayah in isolation above its context, you read up to it.
//
// On long surahs the passage is split across several messages, always at ayah
// boundaries so no ayah is ever cut in half. The longest single ayah is well
// under Telegram's limit, so a line never needs splitting.

import type { DisplayAyah, DisplaySurah } from './types';
import { toArabicDigits } from './arabic';

/** Telegram's hard limit on message length (characters). */
export const TELEGRAM_MAX = 4096;
// We pack messages up to a slightly smaller size to leave margin for the way
// Telegram counts emoji and any future small wording changes.
const SAFE_LIMIT = 4000;

// Marker appended to today's new ayah, the last line of the passage, so the
// eye lands on it as the newest ayah after reading up to it.
const TODAY_MARKER = '👈';
// Header for any continuation message when the passage is split.
const CONTINUED_HEADER = '📖 (تابع القراءة)';

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
   * The previous ayat to review, in ascending order, NOT including today.
   * May be empty (review turned off, or today is ayah 1).
   */
  review: DisplayAyah[];
  /**
   * The basmala text to show as the surah opening, or undefined to show
   * none. The caller passes it only when this delivery's passage actually
   * starts at ayah 1 of a surah that uses a basmala. Passing the text in
   * (instead of hard-coding it) keeps what we display identical to the
   * verified source.
   */
  basmala?: string;
}

/**
 * Build the ordered list of messages to send for one delivery. The whole
 * delivery is a single passage in reading order:
 *
 *   🌿 آية اليوم — سورة … ، آية N      ← names today's new ayah
 *   📖 اقرأ بالترتيب حتى آية اليوم:     ← only when there are previous ayat
 *   (basmala, when the passage starts at ayah 1)
 *   previous ayah, previous ayah, …    ← ascending
 *   today's ayah 👈                     ← last, marked
 *
 * Returned as ONE message when it fits, or several split at ayah boundaries
 * when it is too long (each within Telegram's limit). With review off, or on
 * the surah's first ayah, the passage is just today's ayah on its own.
 * Returns at least one message.
 */
export function formatDailyMessages(input: DailyMessageInput): string[] {
  const { surah, today, review, basmala } = input;

  const hasReview = review.length > 0;
  const title = `🌿 آية اليوم — سورة ${surah.nameAr}، آية ${toArabicDigits(today.numberInSurah)}`;
  // The reading instruction only makes sense when there is something to read
  // up to today; on a lone ayah we drop it (and the 👈, which would point at
  // the only line).
  const header = hasReview ? `${title}\n\n📖 اقرأ بالترتيب حتى آية اليوم:` : title;

  // The passage body, top to bottom: the surah opening (only when this passage
  // truly starts at ayah 1), the previous ayat ascending, then today's ayah
  // marked.
  const lines: string[] = [];
  if (basmala) lines.push(basmala);
  for (const ayah of review) lines.push(formatAyahLine(ayah));
  lines.push(hasReview ? `${formatAyahLine(today)} ${TODAY_MARKER}` : formatAyahLine(today));

  // Happy path: the whole passage fits in one message.
  const combined = `${header}\n\n${lines.join('\n')}`;
  if (combined.length <= SAFE_LIMIT) return [combined];

  // Too long: split at ayah boundaries. The first message keeps the full
  // header; later messages carry the short continuation header. Today's ayah,
  // being last, lands in the final message — the title already named it.
  return chunkPassage(header, lines, SAFE_LIMIT);
}

/**
 * Pack passage lines into messages no longer than `limit`. The first message
 * carries `firstHeader`; later messages carry the continuation header. A
 * single line always fits (the longest ayah is far under the limit), so a line
 * is never split mid-ayah.
 */
function chunkPassage(firstHeader: string, lines: string[], limit: number): string[] {
  const messages: string[] = [];
  let head = firstHeader;
  let body: string[] = [];

  const flush = () => {
    messages.push(`${head}\n\n${body.join('\n')}`);
    head = CONTINUED_HEADER;
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
