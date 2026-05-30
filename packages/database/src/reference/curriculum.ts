// The kids' memorization track, defined as reviewable data.
//
// The recommended children's order starts with Juz Amma (the short surahs
// at the end) and works backward, then Juz Tabarak, then the rest of the
// Quran toward the beginning. Because Juz Amma is surahs 78-114 and Juz
// Tabarak is 67-77, "start at the end and go backward" is exactly the same
// as walking the surahs from 114 down to 1. Within each surah you memorize
// ayah 1, 2, 3 ... in order.
//
// So the whole track is: surah 114 (An-Nas) first, then 113, 112, ... down
// to surah 1 (Al-Fatihah); and inside each surah, ayat in ascending order.
// Keeping this as a small pure function (instead of a hand-written list of
// 6236 rows) means it is easy to read, test, and adjust later.

export const KIDS_TRACK = {
  key: 'kids-hifz',
  name: 'حفظ الأطفال (من الناس إلى الفاتحة)',
  loops: true,
} as const;

export interface CurriculumStep {
  surahNumber: number;
  numberInSurah: number;
}

/**
 * Build the ordered list of (surah, ayah) steps for the kids' track.
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
