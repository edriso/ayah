// The memorization tracks, defined as reviewable data.
//
// A track is just an ordered list of every ayah; a subscriber walks it one
// ayah a day. Within EITHER track the ayat of a surah are always ascending
// (1, 2, 3 ...). The two tracks differ only in the order they visit surahs:
//
//   - kids-hifz (reverse): surah 114 (An-Nas) first, then 113 ... down to 1
//     (Al-Fatihah). This is the recommended children's order: start with Juz
//     Amma (the short surahs at the end) and work backward through Juz
//     Tabarak and on toward the beginning. Because Juz Amma is 78-114 and Juz
//     Tabarak is 67-77, "start at the end and go backward" is exactly walking
//     the surahs from 114 down to 1. This is the default for new subscribers.
//
//   - mushaf (forward): surah 1 (Al-Fatihah) first, then 2, 3 ... up to 114
//     (An-Nas). The normal Mushaf reading order, for people who prefer it.
//
// Keeping these as small pure functions (instead of hand-written lists of
// 6236 rows) means they are easy to read, test, and adjust later. The seed
// turns each into TrackEntry rows; the app moves a subscriber between tracks
// to change their order (see setOrder in subscriber.service).

export const KIDS_TRACK = {
  key: 'kids-hifz',
  name: 'حفظ الأطفال (من الناس إلى الفاتحة)',
  loops: true,
} as const;

export const MUSHAF_TRACK = {
  key: 'mushaf',
  name: 'ترتيب المصحف (من الفاتحة إلى الناس)',
  loops: true,
} as const;

/**
 * The orders a subscriber can choose between. The app reads this so it never
 * hard-codes the set of track keys (the order picker is built from it, and
 * the startup check seeds every key in it). The Arabic labels live in the
 * telegram app's copy.ts, where all user-facing wording is kept.
 */
export const ORDERS = [{ key: KIDS_TRACK.key }, { key: MUSHAF_TRACK.key }] as const;

export interface CurriculumStep {
  surahNumber: number;
  numberInSurah: number;
}

/**
 * Build the ordered list of (surah, ayah) steps for the kids' (reverse)
 * track: surahs 114 down to 1, ayat ascending within each.
 *
 * @param ayahCountFor returns how many ayat a surah has. Passing this in
 *   (instead of importing the table) lets the seed use the real counts from
 *   the database and lets tests use tiny made-up surahs.
 */
export function buildKidsOrder(ayahCountFor: (surahNumber: number) => number): CurriculumStep[] {
  const steps: CurriculumStep[] = [];
  for (let surahNumber = 114; surahNumber >= 1; surahNumber--) {
    const count = ayahCountFor(surahNumber);
    for (let numberInSurah = 1; numberInSurah <= count; numberInSurah++) {
      steps.push({ surahNumber, numberInSurah });
    }
  }
  return steps;
}

/**
 * Build the ordered list of (surah, ayah) steps for the Mushaf (forward)
 * track: surahs 1 up to 114, ayat ascending within each. Same shape as
 * buildKidsOrder, only the surah direction is flipped.
 */
export function buildMushafOrder(ayahCountFor: (surahNumber: number) => number): CurriculumStep[] {
  const steps: CurriculumStep[] = [];
  for (let surahNumber = 1; surahNumber <= 114; surahNumber++) {
    const count = ayahCountFor(surahNumber);
    for (let numberInSurah = 1; numberInSurah <= count; numberInSurah++) {
      steps.push({ surahNumber, numberInSurah });
    }
  }
  return steps;
}
