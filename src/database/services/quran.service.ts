import { prisma } from '../client';
import { reviewRange, surahUsesBasmala, type DailyMessageInput } from '../../core';
import { TOTAL_AYAT } from '../reference/ayah-counts';
import { ORDERS } from '../reference/curriculum';

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

/**
 * Make sure every order the bot offers is fully seeded as a track with all
 * 6236 entries. Called once at startup so a deploy that forgot to reseed
 * (e.g. after adding the Mushaf track) fails loudly at boot instead of when a
 * user first picks that order. Run "pnpm db:seed" to fix it.
 */
export async function assertTracksSeeded(): Promise<void> {
  for (const order of ORDERS) {
    const track = await prisma.track.findUnique({ where: { key: order.key } });
    const entries = track ? await prisma.trackEntry.count({ where: { trackId: track.id } }) : 0;
    if (!track || entries !== TOTAL_AYAT) {
      throw new Error(
        `Track "${order.key}" is not fully seeded (found ${entries} of ${TOTAL_AYAT} entries). ` +
          `Run "pnpm db:seed".`,
      );
    }
  }
}

/** Load a track by its stable key (e.g. "kids-hifz"). */
export async function getTrackByKey(key: string) {
  const track = await prisma.track.findUnique({ where: { key } });
  if (!track) throw new Error(`Track "${key}" not found. Did you run the seed?`);
  return track;
}

/** Load a track by its numeric id, or null if it does not exist. */
export function getTrackById(id: number) {
  return prisma.track.findUnique({ where: { id } });
}

/** How many entries (ayat) a track has in total. */
export function countTrackEntries(trackId: number): Promise<number> {
  return prisma.trackEntry.count({ where: { trackId } });
}

// An entry joined with its ayah and surah: everything we need to build a
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

/**
 * The track entry for a given (surah, ayah) within a track, or null if that
 * ayah does not exist. Used to reposition a subscriber to a chosen starting
 * point, and to map their current ayah onto another track when switching
 * order. Goes ayah -> entry via the unique (trackId, ayahId) index.
 */
export async function getEntryForAyah(trackId: number, surahNumber: number, numberInSurah: number) {
  const ayah = await prisma.ayah.findUnique({
    where: { surahNumber_numberInSurah: { surahNumber, numberInSurah } },
    select: { id: true },
  });
  if (!ayah) return null;
  return prisma.trackEntry.findUnique({
    where: { trackId_ayahId: { trackId, ayahId: ayah.id } },
    include: entryInclude,
  });
}

// The basmala is just surah 1 ayah 1 in the seeded text. We read it once and
// cache it, so the bot shows the exact verified bytes as the surah opening.
let basmalaCache: string | null = null;
export async function getBasmala(): Promise<string> {
  if (basmalaCache !== null) return basmalaCache;
  const opening = await prisma.ayah.findUnique({
    where: { surahNumber_numberInSurah: { surahNumber: 1, numberInSurah: 1 } },
    select: { text: true },
  });
  if (!opening) throw new Error('Basmala (surah 1 ayah 1) not found. Is the Quran text seeded?');
  basmalaCache = opening.text;
  return basmalaCache;
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
export async function buildDailyContent(
  entry: EntryWithAyah,
  reviewCount: number,
): Promise<DailyMessageInput> {
  const { ayah } = entry;
  const range = reviewRange(ayah.numberInSurah, reviewCount);
  const review = range ? await getReviewAyat(ayah.surahNumber, range.from, range.to) : [];

  // Show the basmala as the surah opening only when this delivery's passage
  // actually STARTS at ayah 1 - either today is ayah 1, or the review window
  // reaches back to ayah 1. The message renders the passage in order, so the
  // basmala sits exactly where it belongs (above ayah 1) and never floats
  // above a mid-surah ayah.
  const passageStart = review.length > 0 ? review[0].numberInSurah : ayah.numberInSurah;
  const showBasmala = passageStart === 1 && surahUsesBasmala(ayah.surahNumber);

  return {
    surah: { number: ayah.surah.number, nameAr: ayah.surah.nameAr },
    today: { numberInSurah: ayah.numberInSurah, text: ayah.text },
    review,
    basmala: showBasmala ? await getBasmala() : undefined,
  };
}
