// The tafseer editions a subscriber can choose for the daily ayah. This is
// reference data, not code: a stable `key` stored in Subscriber.tafseerEdition
// (and as the `edition` of each Tafseer row), the Arabic display name, how the
// text is stored (`kind`), where the fetch downloads it from (`source`, used
// only by scripts/fetch-tafseer.ts), and where its "read in full" link points
// (`linkHost` + `linkRef`, used by src/core/tafseer.ts).
//
// The tafseer TEXT for the concise editions is committed and verified like the
// Quran text (one file per edition under prisma/data/, seeded into the Tafseer
// table). The one long edition (Ibn Kathir) is stored as a bounded opening
// only — its full text runs to tens of thousands of characters per ayah, so,
// like the recitation audio, we do not commit the whole thing; the bot sends
// the opening plus a link to read the rest. See the NOTICE file for the
// per-edition attribution.

import type { TafseerKind, TafseerLinkHost } from '../../core';

/** Where the fetch script downloads an edition from. Dev-time only. */
export interface TafseerSource {
  /** Which API serves this edition. */
  api: 'alquran.cloud' | 'quranenc' | 'quran.foundation';
  /** The edition's id/key/slug on that API. */
  ref: string;
  /** True when the API returns HTML that the fetch must strip to plain text. */
  html: boolean;
}

export interface Tafseer {
  /** Stable code stored in Subscriber.tafseerEdition and the Tafseer table. */
  key: string;
  /** Arabic display name, shown in the picker, settings, and the message header. */
  nameAr: string;
  /** 'inline' = the full text is stored; 'preview' = only a one-message opening
   *  is stored and the bot appends a "read in full" link (a long edition). */
  kind: TafseerKind;
  /** Where the fetch downloads it (scripts/fetch-tafseer.ts). */
  source: TafseerSource;
  /** The site the "read in full" link points at. */
  linkHost: TafseerLinkHost;
  /** The edition's id on its link host (a quranenc key or a quran.com slug). */
  linkRef: string;
}

// Order = display order in the picker. The default (التفسير الميسر) comes
// first, then the other concise editions, then the long classical one.
export const TAFSEERS: readonly Tafseer[] = [
  {
    key: 'muyassar',
    nameAr: 'التفسير الميسر',
    kind: 'inline',
    source: { api: 'alquran.cloud', ref: 'ar.muyassar', html: false },
    linkHost: 'quranenc',
    linkRef: 'arabic_moyassar',
  },
  {
    key: 'mukhtasar',
    nameAr: 'المختصر في التفسير',
    kind: 'inline',
    source: { api: 'quranenc', ref: 'arabic_mokhtasar', html: false },
    linkHost: 'quranenc',
    linkRef: 'arabic_mokhtasar',
  },
  {
    key: 'saadi',
    nameAr: 'تفسير السعدي',
    kind: 'inline',
    source: { api: 'quran.foundation', ref: '91', html: true },
    linkHost: 'quran.com',
    linkRef: 'ar-tafseer-al-saddi',
  },
  {
    key: 'ibnkathir',
    nameAr: 'تفسير ابن كثير',
    kind: 'preview',
    source: { api: 'quran.foundation', ref: '14', html: true },
    linkHost: 'quran.com',
    linkRef: 'ar-tafsir-ibn-kathir',
  },
] as const;

/** The edition a brand-new subscriber gets: التفسير الميسر (concise, the King
 *  Fahd Complex edition). Matches the schema default for Subscriber.tafseerEdition. */
export const DEFAULT_TAFSEER = 'muyassar';

const TAFSEER_BY_KEY = new Map(TAFSEERS.map((t) => [t.key, t]));

/** Look up a tafseer edition by key, or undefined for an unknown key. */
export function tafseerByKey(key: string): Tafseer | undefined {
  return TAFSEER_BY_KEY.get(key);
}

/** The edition a subscriber's value resolves to: their chosen one, or the
 *  default if it is missing/unknown (so a dropped edition never breaks a send). */
export function tafseerOrDefault(key: string): Tafseer {
  return TAFSEER_BY_KEY.get(key) ?? TAFSEER_BY_KEY.get(DEFAULT_TAFSEER)!;
}

/** True when `key` is a real edition — the set Subscriber.tafseerEdition is
 *  allowed to hold. */
export function isTafseerEdition(key: string): boolean {
  return TAFSEER_BY_KEY.has(key);
}
