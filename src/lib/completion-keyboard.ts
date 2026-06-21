// The keyboard shown under the surah-completion milestone message. It does not
// gate anything: confirming the last ayah of a surah already advances into the
// next surah AND reveals its first ayah right under the milestone, so these
// buttons only let the subscriber change course (pick a different surah, or
// repeat the one they just finished) without ever stalling the daily habit.
// There is no "continue" button — continuing already happened.
//
// Callback data is namespaced like the other pickers ("ayah:done:…") so it can
// never clash. "restart" carries the completed surah's number so the handler
// knows which surah to point back to. (COMPLETE_CONTINUE is kept only so the
// handler still answers taps on milestone messages sent before this change.)

import { InlineKeyboard } from 'grammy';
import { COPY } from './copy';

export const COMPLETE_CONTINUE = 'ayah:done:continue';
export const COMPLETE_PICK = 'ayah:done:pick';
export const COMPLETE_RESTART_PREFIX = 'ayah:done:restart:';

export function buildCompletionKeyboard(completedSurahNumber: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(COPY.completionPickBtn, COMPLETE_PICK)
    .row()
    .text(COPY.completionRestartBtn, `${COMPLETE_RESTART_PREFIX}${completedSurahNumber}`);
}
