import { prisma } from '../client';

// The Telegram file_id cache for the per-ayah recitation audio. We never store
// the audio bytes (one reciter for the whole Quran is ~1 GB). The first time an
// ayah's audio goes out for a reciter, Telegram fetches it from the CDN and
// hands back a file_id; we store it keyed by (surah, ayah, reciter) and reuse
// it forever after. See AyahAudio in the schema and src/core/audio.ts.

/** The cached file_id for one ayah in one reciter's voice, or null if not
 *  cached yet (the first send will fetch from the CDN and populate it). */
export async function getCachedAyahAudioId(
  surahNumber: number,
  numberInSurah: number,
  reciter: string,
): Promise<string | null> {
  const row = await prisma.ayahAudio.findUnique({
    where: {
      surahNumber_numberInSurah_reciter: { surahNumber, numberInSurah, reciter },
    },
    select: { fileId: true },
  });
  return row?.fileId ?? null;
}

/**
 * Remember the file_id Telegram returned for an ayah's audio in a reciter's
 * voice. Upsert: the id can change if the source clip is replaced, and a
 * concurrent first-send for the same (ayah, reciter) must not error.
 */
export function cacheAyahAudioId(
  surahNumber: number,
  numberInSurah: number,
  reciter: string,
  fileId: string,
) {
  return prisma.ayahAudio.upsert({
    where: {
      surahNumber_numberInSurah_reciter: { surahNumber, numberInSurah, reciter },
    },
    update: { fileId },
    create: { surahNumber, numberInSurah, reciter, fileId },
  });
}
