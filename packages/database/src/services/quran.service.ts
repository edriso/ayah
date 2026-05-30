import { prisma } from '../client';
import { reviewRange, type DailyMessageInput } from '@ayah/core';
import { TOTAL_AYAT } from '../reference/ayah-counts';

/**
 * Make sure the holy text is fully seeded before the bot serves anyone.
 * Called once at startup. If the count is wrong we refuse to start, so a
 * half-seeded or empty database can never send a broken ayah to a user.
 */
export async function assertQuranSeeded(): Promise<void> {
  const [surahs, ayat] = await Promise.all([prisma.surah.count(), prisma.ayah.count()]);
  if (surahs !== 114 || ayat !== TOTAL_AYAT) {
    throw new Error(
      `Quran data looks wrong: found ${surahs} surahs and ${ayat} ayat, ` +
        `expected 114 and ${TOTAL_AYAT}. Run "pnpm data:fetch" then "pnpm db:seed".`,
    );
  }
}

/** Load a track by its stable key (e.g. "kids-hifz"). */
export async function getTrackByKey(key: string) {
  const track = await prisma.track.findUnique({ where: { key } });
  if (!track) throw new Error(`Track "${key}" not found. Did you run the seed?`);
  return track;
}

/** How many entries (ayat) a track has in total. */
export function countTrackEntries(trackId: number): Promise<number> {
  return prisma.trackEntry.count({ where: { trackId } });
}

// An entry joined with its ayah and surah — everything we need to build a
// message and to know where the subscriber is in the track.
const entryInclude = {
  ayah: { include: { surah: true } },
} as const;

/** The track entry at a given 0-based position, or null if out of range. */
export function getEntryAtPosition(trackId: number, position: number) {
  return prisma.trackEntry.findUnique({
    where: { trackId_position: { trackId, position } },
    include: entryInclude,
  });
}

/** A track entry by its id, or null if it does not exist. */
export function getEntryById(entryId: number) {
  return prisma.trackEntry.findUnique({
    where: { id: entryId },
    include: entryInclude,
  });
}

/** The review window ayat (ascending) for the same surah, inclusive. */
export function getReviewAyat(surahNumber: number, from: number, to: number) {
  return prisma.ayah.findMany({
    where: { surahNumber, numberInSurah: { gte: from, lte: to } },
    orderBy: { numberInSurah: 'asc' },
    select: { numberInSurah: true, text: true },
  });
}

export type EntryWithAyah = NonNullable<Awaited<ReturnType<typeof getEntryById>>>;

/**
 * Build the full daily content (today's ayah + the review window) for a
 * given entry. Pure data in, ready-to-format data out.
 */
export async function buildDailyContent(entry: EntryWithAyah): Promise<DailyMessageInput> {
  const { ayah } = entry;
  const { from, to } = reviewRange(ayah.numberInSurah);
  const review = await getReviewAyat(ayah.surahNumber, from, to);
  return {
    surah: { number: ayah.surah.number, nameAr: ayah.surah.nameAr },
    today: { numberInSurah: ayah.numberInSurah, text: ayah.text },
    review,
  };
}
