import { prisma } from '../client';

// Reads from the Tafseer table (seeded once from the verified data files, never
// written to by the bot). One row per (edition, surah, ayah); the subscriber's
// chosen edition decides which row to read. See src/database/reference/
// tafseers.ts for the editions and src/core/tafseer.ts for the formatting.

/**
 * The committed tafseer text for one ayah in one edition, or null when nothing
 * is seeded for it (an edition whose data file has not been fetched/seeded yet,
 * or a gap). A null simply makes the bot omit the tafseer message — the same
 * graceful behaviour the single-edition tafseer had before.
 */
export async function getTafseerText(
  edition: string,
  surahNumber: number,
  numberInSurah: number,
): Promise<string | null> {
  const row = await prisma.tafseer.findUnique({
    where: { edition_surahNumber_numberInSurah: { edition, surahNumber, numberInSurah } },
    select: { text: true },
  });
  return row?.text ?? null;
}
