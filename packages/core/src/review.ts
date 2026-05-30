// Two small pieces of curriculum math:
//   1. reviewRange  - which ayat make up the "last 10" review block.
//   2. advancePosition - where the subscriber moves next in the track.

import type { ReviewRange } from './types';

/** How many ayat the daily review block shows (today's ayah + 9 before). */
export const REVIEW_WINDOW = 10;

/**
 * Work out the inclusive ayah-number range for the review block.
 *
 * The block is the current ayah plus the few before it IN THE SAME SURAH.
 * It must never cross into the previous surah, so the start is clamped to
 * ayah 1. Examples (window = 10):
 *
 *   current = 25  ->  { from: 16, to: 25 }   (a full 10-ayah window)
 *   current = 5   ->  { from: 1,  to: 5  }   (surah only has 5 so far)
 *   current = 1   ->  { from: 1,  to: 1  }   (first ayah, no bleed back)
 *
 * `window` defaults to REVIEW_WINDOW but is a parameter so tests (and any
 * future per-track setting) can use a different size.
 */
export function reviewRange(currentNumberInSurah: number, window = REVIEW_WINDOW): ReviewRange {
  if (!Number.isInteger(currentNumberInSurah) || currentNumberInSurah < 1) {
    throw new Error(`currentNumberInSurah must be >= 1, got ${currentNumberInSurah}`);
  }
  if (!Number.isInteger(window) || window < 1) {
    throw new Error(`window must be >= 1, got ${window}`);
  }
  const from = Math.max(1, currentNumberInSurah - (window - 1));
  return { from, to: currentNumberInSurah };
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
