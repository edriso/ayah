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
