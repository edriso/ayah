// The /review card keyboard: two rows of quick-picks — the RECENT review (how
// many previous ayat of the current surah accompany today's new ayah) and the
// distant CONSOLIDATION review (التثبيت: how many previously-memorized ayat to
// revisit each day). Namespaced callback data so it never clashes with other
// pickers. The current value in each row is marked with a check.

import { InlineKeyboard } from 'grammy';
import { toArabicDigits } from '../core';

export const REVIEW_RECENT_PREFIX = 'ayah:rev:recent:';
export const REVIEW_OLD_PREFIX = 'ayah:rev:old:';

// Quick-pick options for each row (within the validated ranges 0..20 / 0..10).
const RECENT_OPTIONS = [0, 5, 10, 15, 20];
const OLD_OPTIONS = [0, 3, 5, 7, 10];

function label(n: number, current: number): string {
  const num = toArabicDigits(n);
  return n === current ? `✓ ${num}` : num;
}

/** Build the two-row review picker, marking the subscriber's current values. */
export function buildReviewKeyboard(recentCount: number, oldCount: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const n of RECENT_OPTIONS) kb.text(label(n, recentCount), `${REVIEW_RECENT_PREFIX}${n}`);
  kb.row();
  for (const n of OLD_OPTIONS) kb.text(label(n, oldCount), `${REVIEW_OLD_PREFIX}${n}`);
  return kb;
}
