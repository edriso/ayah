// Small pure parsers for command arguments. Kept apart from bot.ts so they
// can be unit-tested without loading grammY or the database client.

import { toAsciiDigits, MAX_REVIEW_COUNT } from '../core';

/**
 * Parse "HH:MM" (24-hour) into hour/minute, or null if invalid. Arabic-Indic
 * and Persian digits are accepted (the bot shows times in Arabic-Indic, so
 * users naturally type them back).
 */
export function parseTime(raw: string): { hour: number; minute: number } | null {
  const m = toAsciiDigits(raw.trim()).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** True if a string is a timezone that Intl accepts. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Highest surah number; the ayah oracle is the source of truth for counts. */
const MAX_SURAH = 114;

/**
 * Parse the argument of "/surah" into a starting (surah, ayah), or null if it
 * is not a valid starting point. Accepted forms (Arabic-Indic digits too):
 *
 *   "67"     -> { surah: 67, ayah: 1 }   (a surah on its own starts at ayah 1)
 *   "67 5"   -> { surah: 67, ayah: 5 }   (surah then ayah, any whitespace)
 *
 * The surah must be 1..114 and the ayah must be within that surah. The ayah
 * bound is checked through `ayahCountFor` (injected, not imported) so this
 * stays a pure parser with no database dependency, matching parseTime.
 */
export function parseSurahArg(
  raw: string,
  ayahCountFor: (surah: number) => number,
): { surah: number; ayah: number } | null {
  const parts = toAsciiDigits(raw.trim()).split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;
  if (!parts.every((p) => /^\d{1,3}$/.test(p))) return null;

  const surah = Number(parts[0]);
  const ayah = parts.length === 2 ? Number(parts[1]) : 1;
  if (surah < 1 || surah > MAX_SURAH) return null;
  if (ayah < 1 || ayah > ayahCountFor(surah)) return null;
  return { surah, ayah };
}

/**
 * Parse the argument of the admin "/admin_preview" command: a starting point
 * plus an optional review window, for testing what the bot would send.
 *
 *   "2"        -> { surah: 2, ayah: 1, review: null }
 *   "2 255"    -> { surah: 2, ayah: 255, review: null }
 *   "2 255 3"  -> { surah: 2, ayah: 255, review: 3 }
 *
 * The surah/ayah part is validated exactly like "/surah" (so an out-of-range
 * ayah is rejected). The review, when given, must be 0..MAX_REVIEW_COUNT. A
 * null review means "not specified"; the caller picks its own default. Returns
 * null on anything malformed. Arabic-Indic digits are accepted.
 */
export function parseAyahPreview(
  raw: string,
  ayahCountFor: (surah: number) => number,
): { surah: number; ayah: number; review: number | null } | null {
  const parts = toAsciiDigits(raw.trim()).split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 3) return null;

  // A third part is the review count; the first one or two are surah[/ayah].
  const reviewPart = parts.length === 3 ? parts[2] : null;
  const surahAyah = parseSurahArg(
    parts.slice(0, Math.min(parts.length, 2)).join(' '),
    ayahCountFor,
  );
  if (!surahAyah) return null;

  let review: number | null = null;
  if (reviewPart !== null) {
    if (!/^\d{1,2}$/.test(reviewPart)) return null;
    const n = Number(reviewPart);
    if (n > MAX_REVIEW_COUNT) return null;
    review = n;
  }
  return { surah: surahAyah.surah, ayah: surahAyah.ayah, review };
}
