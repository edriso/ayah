// Pure text helpers for the tafseer fetch (scripts/fetch-tafseer.ts). Kept in
// their own module so they can be unit-tested without any network or database.
// None of these touch env, fs, or fetch.

/**
 * Turn the quran.com tafsir HTML into clean plain text the bot can send with no
 * parse_mode: drop footnote markers, turn block tags into spaces, strip the
 * rest of the tags, decode the few HTML entities that appear, and collapse
 * whitespace. The { … } braces around quoted Quran fragments are plain text and
 * are kept (they mark which words are the ayah, not commentary).
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<sup[^>]*>.*?<\/sup>/gis, '') // footnote reference markers
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '') // any remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, '’')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cut text down to a single-message opening for a "preview" edition: prefer the
 * last sentence end (Arabic full stop, question mark, or a period/newline)
 * before the limit, fall back to the last space, then a hard cut. Returns the
 * whole text unchanged when it is already short. No ellipsis — the bot's
 * formatter marks it as an opening and adds the "read in full" link.
 */
export function previewOpening(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const window = text.slice(0, maxChars);
  const sentenceEnd = Math.max(
    window.lastIndexOf('۔'),
    window.lastIndexOf('؟'),
    window.lastIndexOf('!'),
    window.lastIndexOf('.'),
    window.lastIndexOf('\n'),
  );
  if (sentenceEnd >= maxChars * 0.5) return window.slice(0, sentenceEnd + 1).trim();
  const space = window.lastIndexOf(' ');
  return (space > 0 ? window.slice(0, space) : window).trim();
}

/**
 * Build a surah's ayat array (length `count`, ayat[i] is ayah i+1) from a
 * (ayahNumber -> text) map, forward-filling any ayah without its own entry from
 * the most recent earlier one in the same surah. Long classical editions
 * comment on ranges of ayat under one entry anchored at the range's first ayah,
 * so the absent ayat belong to that group and share its text. Ayah 1 must
 * always be present (every surah's first ayah anchors a group), so a gap there
 * is a real fault and throws (using `label` to name the edition).
 */
export function fillSurah(byAyah: Map<number, string>, count: number, label: string): string[] {
  const ayat: string[] = [];
  let last = '';
  for (let a = 1; a <= count; a++) {
    const own = byAyah.get(a);
    if (own && own.trim() !== '') last = own.trim();
    else if (a === 1) {
      throw new Error(`${label}: ayah 1 has no tafseer entry (cannot forward-fill).`);
    }
    ayat.push(last);
  }
  return ayat;
}
