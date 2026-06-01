// Rules about the basmala (the opening line of a surah).
//
// In the Hafs numbering the basmala is a numbered ayah ONLY in Al-Fatihah
// (surah 1). For every other surah it is written at the start but is not
// ayah 1; and At-Tawbah (surah 9) has no basmala at all.
//
// So when we store ayah text we keep it as the pure numbered ayah (the
// basmala is not glued onto ayah 1), and when we DISPLAY the opening of a
// surah we show the basmala as a header. The user always sees the full
// basmala; it is just kept in its correct place.
//
// We never hard-code the basmala text here. The exact Uthmani bytes come
// from the seeded text (surah 1 ayah 1) and are passed in at display time,
// so what the bot shows can never drift from the verified source.

/**
 * True if a surah is shown with a basmala header. That is every surah except
 * Al-Fatihah (where the basmala is already ayah 1) and At-Tawbah (none).
 */
export function surahUsesBasmala(surahNumber: number): boolean {
  return surahNumber !== 1 && surahNumber !== 9;
}

/**
 * Whether a delivery shows the basmala as its opening header. The basmala
 * belongs above ayah 1, so it appears only when the rendered passage actually
 * starts at ayah 1 - that is, ayah 1 is on screen, whether it is today's ayah
 * or the first ayah the review reaches back to - AND the surah uses a basmala
 * header at all (so never At-Tawbah, and never Al-Fatihah whose ayah 1 IS the
 * basmala). Pass the lowest ayah number shown in the passage.
 */
export function showsOpeningBasmala(surahNumber: number, passageStartAyah: number): boolean {
  return passageStartAyah === 1 && surahUsesBasmala(surahNumber);
}

/**
 * Remove Arabic diacritics and Quranic marks so two spellings can be compared
 * by their letters alone. Arabic letters (including alef wasla U+0671) are
 * kept; only combining marks are removed.
 */
export function stripArabicMarks(text: string): string {
  // Arabic signs (0610-061A), harakat/tanwin/shadda/sukun (064B-065F),
  // superscript alef (0670), and Quranic annotation signs (06D6-06ED).
  return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
}

/**
 * Remove a leading basmala from an ayah's text, returning the pure ayah.
 *
 * Some Quran editions merge the basmala into the text of ayah 1. To get the
 * real numbered ayah we strip that prefix. The match ignores diacritics,
 * because a few surahs carry the basmala with a slightly different mark (an
 * extra shadda) that an exact byte match would miss. If the text does not
 * start with the basmala, it is returned unchanged.
 */
export function removeBasmalaPrefix(ayahText: string, basmala: string): string {
  const basmalaWordCount = basmala.split(/\s+/).length;
  const words = ayahText.split(/\s+/);
  const head = words.slice(0, basmalaWordCount).join(' ');
  if (stripArabicMarks(head) !== stripArabicMarks(basmala)) {
    return ayahText; // already clean, nothing to strip
  }
  return words.slice(basmalaWordCount).join(' ').trim();
}
