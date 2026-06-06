// Curriculum math:
//   1. reviewRange     - which PREVIOUS ayat make up the review block.
//   2. advancePosition - where the subscriber moves next in the track.
//   3. review-count clamping - keep a user's choice within sane bounds.

import type { ReviewRange } from './types';

/** Default number of previous ayat shown for review (on top of today's). */
export const DEFAULT_REVIEW_COUNT = 10;
/** Smallest review count: 0 means "just today's ayah, no review". */
export const MIN_REVIEW_COUNT = 0;
/**
 * Largest review count. Capped so a single day's review stays reasonable
 * (the bot still splits long reviews across messages, but an unbounded count
 * would mean many messages every day on long surahs).
 */
export const MAX_REVIEW_COUNT = 20;

/** Force any number into the allowed review-count range (0..20). */
export function clampReviewCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REVIEW_COUNT;
  const n = Math.trunc(value);
  if (n < MIN_REVIEW_COUNT) return MIN_REVIEW_COUNT;
  if (n > MAX_REVIEW_COUNT) return MAX_REVIEW_COUNT;
  return n;
}

/**
 * The inclusive range of PREVIOUS ayat to review, in the same surah, ending
 * just before today's ayah. Returns null when there is nothing to review:
 * today is ayah 1 (no earlier ayah in this surah), or the count is 0.
 *
 * The start is clamped to ayah 1 so the review never crosses into the
 * previous surah. Examples (count = 10):
 *
 *   today = 25  ->  { from: 15, to: 24 }   (the 10 ayat before today)
 *   today = 6   ->  { from: 1,  to: 5  }   (only 5 earlier ayat exist)
 *   today = 1   ->  null                   (nothing before ayah 1)
 *   count = 0   ->  null                   (review turned off)
 */
export function reviewRange(
  currentNumberInSurah: number,
  count = DEFAULT_REVIEW_COUNT,
): ReviewRange | null {
  if (!Number.isInteger(currentNumberInSurah) || currentNumberInSurah < 1) {
    throw new Error(`currentNumberInSurah must be >= 1, got ${currentNumberInSurah}`);
  }
  const c = clampReviewCount(count);
  if (c === 0) return null;
  const to = currentNumberInSurah - 1;
  if (to < 1) return null; // today is ayah 1: nothing earlier to review
  const from = Math.max(1, currentNumberInSurah - c);
  return { from, to };
}

/**
 * True when this ayah is the last one of its surah, i.e. delivering it
 * completes the surah. `surahAyahCount` is the surah's total number of ayat
 * (the oracle the data is seeded against). Pure so the boundary signal that
 * drives the "you finished a surah" message is unit-tested without a database.
 */
export function isSurahComplete(numberInSurah: number, surahAyahCount: number): boolean {
  if (!Number.isInteger(surahAyahCount) || surahAyahCount < 1) {
    throw new Error(`surahAyahCount must be >= 1, got ${surahAyahCount}`);
  }
  return numberInSurah >= surahAyahCount;
}

/**
 * Work out the next position in the track.
 *
 * Positions are 0-based and packed tight (0, 1, 2, ... total-1).
 *   - `current` null means "has not started yet" -> first entry (0).
 *   - otherwise step forward by one.
 *   - at the end: loop back to 0 if the track loops, else return null
 *     meaning "finished, nothing more to send".
 */
export function advancePosition(
  current: number | null,
  total: number,
  loops: boolean,
): number | null {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`total must be >= 1, got ${total}`);
  }
  if (current === null) return 0;
  const next = current + 1;
  if (next < total) return next;
  return loops ? 0 : null;
}
