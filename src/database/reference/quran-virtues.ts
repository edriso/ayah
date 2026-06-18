// Gentle encouragement shown when a subscriber's ayah has gone unconfirmed for
// a day or more and is repeated: a short ayah on the virtue of the Qur'an and
// the merit of reciting/learning it. REFERENCE data only — each entry NAMES an
// ayah by (surah, ayah); the verified text is read from the database
// (getAyahText) at send time, never typed here. The optional `note` is an
// authored one-liner and must contain NO Quran text (reference.test.ts enforces
// the ﴿ ﴾ guard). The list rotates by the number of missed days.

export interface QuranVirtue {
  /** Surah number (1..114). */
  surah: number;
  /** Ayah number within the surah (1..count). */
  ayah: number;
  /** Optional authored one-line theme. NEVER Quran text. */
  note?: string;
}

export const QURAN_VIRTUES: readonly QuranVirtue[] = [
  { surah: 54, ayah: 17, note: 'تيسير القرآن للذكر والحفظ.' },
  { surah: 17, ayah: 9, note: 'القرآن يهدي لأقوم الطرق.' },
  { surah: 35, ayah: 29, note: 'فضل تلاوة كتاب الله.' },
  { surah: 38, ayah: 29, note: 'دعوة إلى تدبر آياته.' },
  { surah: 10, ayah: 57, note: 'القرآن شفاء ورحمة.' },
  { surah: 73, ayah: 4, note: 'الأمر بترتيل القرآن.' },
  { surah: 2, ayah: 121, note: 'حق التلاوة.' },
  { surah: 47, ayah: 24, note: 'الحث على تدبر القرآن.' },
  { surah: 39, ayah: 23, note: 'القرآن أحسن الحديث.' },
  { surah: 7, ayah: 204, note: 'الإنصات عند القراءة.' },
];

export const QURAN_VIRTUE_COUNT = QURAN_VIRTUES.length;

/**
 * Pick an encouragement for a subscriber who has missed `missedDays` days
 * (>= 1), rotating so a longer gap surfaces a different ayah each day.
 * Deterministic (no randomness): testable and stable across a restart catch-up.
 */
export function pickQuranVirtue(missedDays: number): QuranVirtue {
  const i = (Math.max(1, missedDays) - 1) % QURAN_VIRTUE_COUNT;
  return QURAN_VIRTUES[i]!;
}
