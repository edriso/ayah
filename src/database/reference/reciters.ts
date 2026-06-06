// The reciters (qaris) a subscriber can choose for the daily ayah's recitation
// audio. This is reference data, not code: a stable `key` stored on the
// subscriber, the Arabic display name, and the source `folder` on the audio
// CDN. The full per-ayah URL is built from the configured audio base + folder
// + the zero-padded surah/ayah (see src/core/audio.ts and config.audioBaseUrl).
//
// The audio itself is NOT stored in this repo (one reciter for the whole Quran
// is ~1 GB). It is fetched from the CDN the first time an ayah is sent, and the
// Telegram file_id is cached so later sends reuse it (see AyahAudio + the audio
// service). The recitations are the standard, widely used Mushaf Murattal
// recordings; see the NOTICE file for attribution.

export interface Reciter {
  /** Stable code stored in Subscriber.reciter and the audio cache. */
  key: string;
  /** Arabic display name, shown in the picker and settings. */
  nameAr: string;
  /** The reciter's folder on the audio CDN (everyayah.com naming). */
  folder: string;
}

// Order = display order in the picker. The default (the kids teacher style)
// comes first, then the classic teaching and beloved voices, then the modern.
export const RECITERS: readonly Reciter[] = [
  { key: 'husary-muallim', nameAr: 'الحصري (المعلِّم)', folder: 'Husary_Muallim_128kbps' },
  { key: 'husary', nameAr: 'محمود خليل الحصري', folder: 'Husary_128kbps' },
  { key: 'minshawi', nameAr: 'محمد صديق المنشاوي', folder: 'Minshawy_Murattal_128kbps' },
  { key: 'abdulbasit', nameAr: 'عبد الباسط عبد الصمد', folder: 'Abdul_Basit_Murattal_192kbps' },
  { key: 'alafasy', nameAr: 'مشاري العفاسي', folder: 'Alafasy_128kbps' },
  { key: 'maher', nameAr: 'ماهر المعيقلي', folder: 'Maher_AlMuaiqly_64kbps' },
  { key: 'ghamdi', nameAr: 'سعد الغامدي', folder: 'Ghamadi_40kbps' },
] as const;

/** The reciter a brand-new subscriber gets: الحصري المعلِّم (the repeat-after-me
 *  teaching style), the most fitting for memorization. Audio is on by default;
 *  a subscriber turns it off by choosing "none" (see RECITER_NONE). */
export const DEFAULT_RECITER = 'husary-muallim';

/** Sentinel value of Subscriber.reciter meaning "no recitation audio". */
export const RECITER_NONE = 'none';

const RECITER_BY_KEY = new Map(RECITERS.map((r) => [r.key, r]));

/** Look up a reciter by key, or undefined for an unknown key or "none". */
export function reciterByKey(key: string): Reciter | undefined {
  return RECITER_BY_KEY.get(key);
}

/** True when `key` is a real reciter or the explicit "none" choice — the set of
 *  values Subscriber.reciter is allowed to hold. */
export function isReciterChoice(key: string): boolean {
  return key === RECITER_NONE || RECITER_BY_KEY.has(key);
}
