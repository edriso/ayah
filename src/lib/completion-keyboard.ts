// The keyboard shown under the surah-completion milestone message. It does not
// gate anything: the bot auto-continues to the next surah by default, so these
// buttons just let the subscriber change course (pick a different surah, or
// repeat the one they just finished) without ever stalling the daily habit.
//
// Callback data is namespaced like the other pickers ("ayah:done:…") so it can
// never clash. "restart" carries the completed surah's number so the handler
// knows which surah to point back to.

import { InlineKeyboard } from 'grammy';
import { COPY } from './copy';

export const COMPLETE_CONTINUE = 'ayah:done:continue';
export const COMPLETE_PICK = 'ayah:done:pick';
export const COMPLETE_RESTART_PREFIX = 'ayah:done:restart:';

export function buildCompletionKeyboard(completedSurahNumber: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(COPY.completionContinueBtn, COMPLETE_CONTINUE)
    .row()
    .text(COPY.completionPickBtn, COMPLETE_PICK)
    .row()
    .text(COPY.completionRestartBtn, `${COMPLETE_RESTART_PREFIX}${completedSurahNumber}`);
}
