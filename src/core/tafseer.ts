// Builds the tafseer message(s) that follow today's ayah, and the link to read
// a tafseer in full on the web. Pure string work so it is easy to test, exactly
// like format.ts.
//
// The tafseer is sent as a SEPARATE message after the ayah (the bot sends it
// silently, with no notification sound — see deliver.ts), so it stays a quiet
// companion to the ayah rather than competing with it for attention. The ayah
// is the thing to memorize and carries the one notification; the tafseer is
// optional context that arrives right below it.
//
// Like the ayah, the message text is PLAIN TEXT with no Telegram parse_mode:
// the tafseer contains Quran fragments and quotation marks that Markdown/HTML
// parsing would choke on. The header names the ayah and the edition (e.g.
// التفسير الميسر) so the reader always knows which tafseer they are reading.
//
// A subscriber picks WHICH edition (see reference/tafseers.ts) and HOW to get
// it:
//   - "text"  : the commentary inline. A concise edition is normally one
//               message; a long edition is split across several (the defensive
//               splitter below).
//   - "link"  : just a short pointer to read it in full on a trusted site, no
//               committed text needed.
// A long edition flagged `preview` is the exception in "text" mode: it sends a
// one-message opening followed by the "read in full" link, so it never floods
// the chat with a dozen messages for one ayah.
//
// When a message points to the web, the URL is returned as `readMoreUrl` (NOT
// baked into the text) so the send layer can attach a single tappable button
// instead of a bare link. See tafseerReplyMarkup in deliver.ts.

import { ayahMarker, SAFE_LIMIT } from './format';

/** How much of an edition is stored: the full text, or a bounded opening that
 *  the bot follows with a "read in full" link. */
export type TafseerKind = 'inline' | 'preview';

/** How a subscriber receives the tafseer: the commentary inline, or a link. */
export type TafseerFormat = 'text' | 'link';

/** The site a tafseer's "read in full" link points at. */
export type TafseerLinkHost = 'quranenc' | 'quran.com';

/** One tafseer message to send: plain text, optionally with a "read the full
 *  tafseer" URL the send layer turns into a tappable button. */
export interface TafseerMessage {
  text: string;
  /** When set, the message carries a single "read in full" button to this URL
   *  (link format, and a preview edition's "read the rest"). */
  readMoreUrl?: string;
}

/** The two delivery formats, for validating a stored/chosen value. */
export const TAFSEER_FORMATS: readonly TafseerFormat[] = ['text', 'link'];

/** True when `value` is a real delivery format (the set Subscriber.tafseerFormat
 *  is allowed to hold). */
export function isTafseerFormat(value: string): value is TafseerFormat {
  return (TAFSEER_FORMATS as readonly string[]).includes(value);
}

// Header for any continuation message when a (rare) long tafseer is split.
const CONTINUED_HEADER = '📖 (تتمة التفسير)';
// Line shown above the "read in full" button in link format (the 👇 points at
// the button the send layer attaches below the message).
const LINK_PROMPT = 'اقرأ هذا التفسير كاملًا على الموقع 👇';
// Marks a preview edition's inline opening as just the beginning, before the
// "read the rest" button.
const PREVIEW_NOTE = '… (هذه بداية التفسير، والبقية على الموقع 👇)';

/**
 * The web address to read the full tafseer of one ayah, in a given edition, on
 * the site that publishes it. Deterministic per (host, edition, surah, ayah) —
 * the bot stores no link, it builds this each time, and `pnpm verify:tafseer`
 * checks the pattern still resolves.
 */
export function tafseerLink(
  host: TafseerLinkHost,
  ref: string,
  surahNumber: number,
  numberInSurah: number,
): string {
  return host === 'quranenc'
    ? `https://quranenc.com/ar/browse/${ref}/${surahNumber}/${numberInSurah}`
    : `https://quran.com/${surahNumber}:${numberInSurah}/tafsirs/${ref}`;
}

export interface TafseerMessageInput {
  /** Today's ayah number within its surah, for the header. */
  numberInSurah: number;
  /** The edition's Arabic name, shown in the header so the reader knows which
   *  tafseer this is (e.g. "التفسير الميسر", "تفسير السعدي"). */
  editionLabel: string;
  /** Whether the stored text is the full tafseer ('inline') or a bounded
   *  opening to be followed by a link ('preview'). */
  kind: TafseerKind;
  /** Whether the subscriber wants the tafseer inline ('text') or as a link. */
  format: TafseerFormat;
  /** The committed tafseer text: the full commentary for an 'inline' edition,
   *  a one-message opening for a 'preview' edition. Unused (and not read) for
   *  the 'link' format. Empty/null means nothing was seeded for this edition
   *  and ayah, so no message is produced. */
  text?: string | null;
  /** Where to read the full tafseer for this ayah (from tafseerLink). Required
   *  for the 'link' format and for a 'preview' edition's "read in full"
   *  button; unused for an 'inline' edition in 'text' format. */
  link?: string;
}

/**
 * Build the ordered tafseer message(s) for today's ayah. Each message is plain
 * text within Telegram's limit, headed by:
 *
 *   📖 تفسير الآية ﴿N﴾ — <edition name>
 *
 * Returns:
 *   - 'link' format: one short message + a readMoreUrl (the button target).
 *   - 'text' + 'inline': the full commentary below the header, normally one
 *     message; split at word boundaries across several only when it is longer
 *     than the limit.
 *   - 'text' + 'preview': one message with the opening below the header, plus a
 *     readMoreUrl to read the rest.
 *   - []: when there is nothing to send (no seeded text in text mode, or a link
 *     was needed but not supplied).
 */
export function formatTafseerMessages(input: TafseerMessageInput): TafseerMessage[] {
  const header = `📖 تفسير الآية ${ayahMarker(input.numberInSurah)} — ${input.editionLabel}`;

  // Link format: a short pointer + the button target. One message, no committed
  // text required.
  if (input.format === 'link') {
    if (!input.link) return [];
    return [{ text: `${header}\n\n${LINK_PROMPT}`, readMoreUrl: input.link }];
  }

  const text = (input.text ?? '').trim();
  if (text === '') return []; // nothing seeded for this edition/ayah: omit silently

  // Preview edition in text mode: a one-message opening, then a button to the
  // rest. The stored text is already bounded to one message; the room check is
  // a defensive guard so the header + note + opening never exceed the limit.
  if (input.kind === 'preview') {
    const note = input.link ? `\n\n${PREVIEW_NOTE}` : '';
    const room = Math.max(1, SAFE_LIMIT - header.length - note.length - 4);
    const opening = text.length <= room ? text : `${text.slice(0, room - 1).trimEnd()}…`;
    const message: TafseerMessage = { text: `${header}\n\n${opening}${note}` };
    if (input.link) message.readMoreUrl = input.link;
    return [message];
  }

  // Inline edition in text mode: the full commentary. One message when it fits
  // (the normal case for a concise edition); split at word boundaries only when
  // it is longer than the limit. The first piece carries the full header, later
  // pieces the short continuation one.
  const combined = `${header}\n\n${text}`;
  if (combined.length <= SAFE_LIMIT) return [{ text: combined }];

  const room = Math.max(1, SAFE_LIMIT - header.length - 2);
  const pieces = splitText(text, room);
  return pieces.map((piece, i) => ({ text: `${i === 0 ? header : CONTINUED_HEADER}\n\n${piece}` }));
}

/**
 * Split prose into chunks no longer than `max`, breaking at the last space
 * within the window so words stay whole; falls back to a hard cut when a single
 * run has no space. Used for an unusually long inline tafseer.
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
