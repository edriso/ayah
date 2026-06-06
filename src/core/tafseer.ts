// Builds the tafseer message(s) that follow today's ayah. Pure string work so
// it is easy to test, exactly like format.ts.
//
// The tafseer is sent as a SEPARATE message after the ayah (the bot sends it
// silently, with no notification sound — see deliver.ts), so it stays a quiet
// companion to the ayah rather than competing with it for attention. The ayah
// is the thing to memorize and carries the one notification; the tafseer is
// optional context that arrives right below it.
//
// Like the ayah, this is PLAIN TEXT with no Telegram parse_mode: the tafseer
// contains Quran fragments and quotation marks that Markdown/HTML parsing would
// choke on. The header names the ayah and attributes the source (التفسير
// الميسر) so the reader always knows which tafseer they are reading.
//
// Al-Muyassar entries are short (the longest, Al-Baqarah 2:282, is ~1451
// chars — well under Telegram's limit), so a tafseer is normally one message.
// The split below is a defensive guard for any unusually long future entry.

import type { DisplaySurah } from './types';
import { ayahMarker, SAFE_LIMIT } from './format';

// Header naming the ayah and attributing the tafseer edition. The ayah number
// uses the same ornamented marker as the ayah lines for a consistent look.
const SOURCE_LABEL = 'التفسير الميسر';
// Header for any continuation message when a (rare) long tafseer is split.
const CONTINUED_HEADER = '📖 (تتمة التفسير)';

export interface TafseerMessageInput {
  surah: DisplaySurah;
  /** Today's ayah number within its surah, for the header. */
  numberInSurah: number;
  /** The tafseer text for today's ayah. */
  text: string;
}

/**
 * Build the ordered tafseer message(s) for today's ayah:
 *
 *   📖 تفسير الآية ﴿N﴾ — التفسير الميسر
 *
 *   <tafseer text>
 *
 * One message when it fits (the normal case); split at word boundaries across
 * several messages, each within Telegram's limit, only when a tafseer is longer
 * than the limit. Returns at least one message.
 */
export function formatTafseerMessages(input: TafseerMessageInput): string[] {
  const header = `📖 تفسير الآية ${ayahMarker(input.numberInSurah)} — ${SOURCE_LABEL}`;
  const text = input.text.trim();

  const combined = `${header}\n\n${text}`;
  if (combined.length <= SAFE_LIMIT) return [combined];

  // Too long (a guard for unusual data): split the prose at word boundaries.
  // The first piece carries the full header; later pieces the short one.
  const room = Math.max(1, SAFE_LIMIT - header.length - 2);
  const pieces = splitText(text, room);
  return pieces.map((piece, i) => `${i === 0 ? header : CONTINUED_HEADER}\n\n${piece}`);
}

/**
 * Split prose into chunks no longer than `max`, breaking at the last space
 * within the window so words stay whole; falls back to a hard cut when a single
 * run has no space. Only reached by the defensive guard above — a real
 * Al-Muyassar entry fits in one message.
 */
function splitText(text: string, max: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max; // no space in the window: hard cut
    pieces.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) pieces.push(rest);
  return pieces;
}
