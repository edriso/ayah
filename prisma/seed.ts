// Seed the database from the frozen Quran data file.
//
// Order of operations:
//   1. pnpm data:fetch   -> downloads + verifies + writes the JSON file
//   2. pnpm db:push      -> creates the tables
//   3. pnpm db:seed      -> this script: fills Surah, Ayah, Track, TrackEntry
//
// This script re-checks the data (6236 ayat, right count per surah) before
// writing anything, and is safe to run twice: if the text is already seeded
// it just stops.

import { loadEnv } from '../src/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/database/client';
import { SURAHS } from '../src/database/reference/surahs';
import { AYAH_COUNTS, TOTAL_AYAT } from '../src/database/reference/ayah-counts';
import {
  KIDS_TRACK,
  MUSHAF_TRACK,
  buildKidsOrder,
  buildMushafOrder,
  type CurriculumStep,
} from '../src/database/reference/curriculum';

loadEnv();

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(HERE, 'data', 'quran-uthmani.json');
const TAFSEER_FILE = join(HERE, 'data', 'tafseer-muyassar.json');

interface QuranData {
  meta: { source: string; sourceUrl: string; totalAyat: number; sha256: string };
  surahs: { number: number; ayat: string[] }[];
}

// The frozen tafseer (التفسير الميسر), aligned with the text by (surah, ayah):
// surahs[surah-1].ayat[ayah-1] is the tafseer for that ayah. Produced by
// "pnpm data:fetch:tafseer".
interface TafseerData {
  meta: { source: string; edition: string; sourceUrl: string; totalAyat: number; sha256: string };
  surahs: { number: number; ayat: string[] }[];
}

// The tracks to seed, each with the function that builds its ayah order.
// Adding a new order later is just one more line here plus its builder.
const TRACKS = [
  { def: KIDS_TRACK, build: buildKidsOrder },
  { def: MUSHAF_TRACK, build: buildMushafOrder },
] as const;

async function main() {
  const data = loadData();
  verify(data);

  // The tafseer is optional: if its data file is missing the bot still works
  // (the daily send just omits the tafseer message). If it IS present we verify
  // it against the same oracle so a corrupt/wrong-edition file fails loudly.
  const tafseer = loadTafseer();
  if (tafseer) verifyTafseer(tafseer);

  // Step 1: the holy text. Seed it once; skip if it is already fully in
  // place, but DO NOT return early. Tracks are seeded below, and a track may
  // be new even when the text is not (e.g. adding the Mushaf track to an
  // existing deployment). A partial text is a hard error.
  const existingAyat = await prisma.ayah.count();
  if (existingAyat === TOTAL_AYAT) {
    console.log('Quran text already seeded (6236 ayat). Skipping text.');
  } else if (existingAyat > 0) {
    throw new Error(
      `Found ${existingAyat} ayat (expected 0 or ${TOTAL_AYAT}). The database is half-seeded. ` +
        `Run "pnpm db:reset" to wipe and reseed.`,
    );
  } else {
    await seedText(data, tafseer);
  }

  // Step 1b: the tafseer. Inserted inline above on a fresh seed; here we
  // backfill any ayat still missing it (an existing deployment seeded before
  // tafseer shipped, or a freshly fetched tafseer file). Idempotent and a
  // no-op once every ayah has its tafseer.
  if (tafseer) await ensureTafseer(tafseer);

  // Step 2: the ayah lookup, used to turn each (surah, ayah) step into an id.
  console.log('Building the ayah lookup...');
  const ayahIdByKey = new Map<string, number>();
  const allAyat = await prisma.ayah.findMany({
    select: { id: true, surahNumber: true, numberInSurah: true },
  });
  for (const a of allAyat) ayahIdByKey.set(`${a.surahNumber}:${a.numberInSurah}`, a.id);

  // Step 3: each track. Per-track idempotent: the track row is upserted and
  // its entries are created only when they are missing, so this is safe to
  // run repeatedly and adds a brand-new track to an already-seeded database.
  const ayahCountFor = (surah: number) => data.surahs[surah - 1].ayat.length;
  for (const { def, build } of TRACKS) {
    await ensureTrack(def, build(ayahCountFor), ayahIdByKey);
  }

  console.log('\nDone. All tracks seeded.');
}

/** Insert the 114 surah rows and all 6236 ayah rows from the verified data.
 *  When the tafseer data is available it is inserted alongside each ayah. */
async function seedText(data: QuranData, tafseer: TafseerData | null): Promise<void> {
  console.log('Seeding surahs...');
  for (const meta of SURAHS) {
    const ayahCount = data.surahs[meta.number - 1].ayat.length;
    await prisma.surah.create({
      data: {
        number: meta.number,
        nameAr: meta.nameAr,
        nameEn: meta.nameEn,
        revelation: meta.revelation,
        ayahCount,
      },
    });
  }

  console.log(tafseer ? 'Seeding ayat (with tafseer)...' : 'Seeding ayat...');
  const ayahRows = data.surahs.flatMap((s) =>
    s.ayat.map((text, i) => ({
      surahNumber: s.number,
      numberInSurah: i + 1,
      text,
      // Aligned by index: ayat[i] is ayah i+1 in both files (verified above).
      tafseer: tafseer?.surahs[s.number - 1]?.ayat[i] ?? null,
    })),
  );
  await createManyChunked('ayat', ayahRows, (chunk) => prisma.ayah.createMany({ data: chunk }));
}

/**
 * Fill in the tafseer for any ayah still missing it. Runs after the text step
 * so it covers both a database seeded before tafseer shipped and a re-run with
 * a freshly fetched tafseer file. A no-op (and cheap single COUNT) once every
 * ayah already has its tafseer.
 */
async function ensureTafseer(tafseer: TafseerData): Promise<void> {
  const missing = await prisma.ayah.count({ where: { tafseer: null } });
  if (missing === 0) {
    console.log('Tafseer already in place for all ayat. Skipping.');
    return;
  }
  console.log(`Backfilling tafseer for ${missing} ayat...`);
  const rows = await prisma.ayah.findMany({
    where: { tafseer: null },
    select: { id: true, surahNumber: true, numberInSurah: true },
  });
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await prisma.$transaction(
      chunk.map((a) => {
        const text = tafseer.surahs[a.surahNumber - 1]?.ayat[a.numberInSurah - 1];
        if (!text) throw new Error(`No tafseer for ${a.surahNumber}:${a.numberInSurah}`);
        return prisma.ayah.update({ where: { id: a.id }, data: { tafseer: text } });
      }),
    );
    done += chunk.length;
    console.log(`  tafseer: ${done}/${rows.length}`);
  }
}

/**
 * Make sure one track exists with all its entries. Upserts the Track row,
 * then, only if its entries are not already complete, creates them from the
 * given order. Idempotent: a fully-seeded track is left untouched.
 */
async function ensureTrack(
  def: { key: string; name: string; loops: boolean },
  order: CurriculumStep[],
  ayahIdByKey: Map<string, number>,
): Promise<void> {
  const track = await prisma.track.upsert({
    where: { key: def.key },
    update: { name: def.name, loops: def.loops },
    create: { key: def.key, name: def.name, loops: def.loops },
  });

  const have = await prisma.trackEntry.count({ where: { trackId: track.id } });
  if (have === order.length) {
    console.log(`Track "${def.key}" already has all ${have} entries. Skipping.`);
    return;
  }
  if (have > 0) {
    throw new Error(
      `Track "${def.key}" has ${have} entries (expected 0 or ${order.length}). ` +
        `It is half-seeded; clear track_entries for this track and reseed.`,
    );
  }

  console.log(`Seeding entries for track "${def.key}"...`);
  const entryRows = order.map((step, position) => {
    const ayahId = ayahIdByKey.get(`${step.surahNumber}:${step.numberInSurah}`);
    if (!ayahId) throw new Error(`No ayah row for ${step.surahNumber}:${step.numberInSurah}`);
    return { trackId: track.id, position, ayahId };
  });
  await createManyChunked(`${def.key} entries`, entryRows, (chunk) =>
    prisma.trackEntry.createMany({ data: chunk }),
  );
}

function loadData(): QuranData {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8')) as QuranData;
  } catch {
    throw new Error(
      `Could not read ${DATA_FILE}. Run "pnpm data:fetch" first to download the Quran text.`,
    );
  }
}

/** Read the frozen tafseer file, or null if it has not been fetched yet. */
function loadTafseer(): TafseerData | null {
  try {
    return JSON.parse(readFileSync(TAFSEER_FILE, 'utf8')) as TafseerData;
  } catch {
    console.warn(
      `No tafseer data file at ${TAFSEER_FILE}. Seeding without tafseer ` +
        `(the bot will simply omit the tafseer message). Run "pnpm data:fetch:tafseer" to add it.`,
    );
    return null;
  }
}

/** Re-check the tafseer file against the same oracle as the text: 114 surahs,
 *  the right count per surah, every entry non-empty, so it lines up one-to-one
 *  with the ayat by (surah, ayah). */
function verifyTafseer(tafseer: TafseerData): void {
  if (tafseer.surahs.length !== 114) {
    throw new Error(
      `Tafseer file has ${tafseer.surahs.length} surahs, expected 114. Re-run data:fetch:tafseer.`,
    );
  }
  let total = 0;
  for (let surah = 1; surah <= 114; surah++) {
    const ayat = tafseer.surahs[surah - 1]?.ayat;
    const got = ayat?.length ?? -1;
    if (got !== AYAH_COUNTS[surah]) {
      throw new Error(
        `Tafseer file: surah ${surah} has ${got} entries, expected ${AYAH_COUNTS[surah]}. Re-run data:fetch:tafseer.`,
      );
    }
    if (ayat!.some((t) => !t || t.trim() === '')) {
      throw new Error(
        `Tafseer file: surah ${surah} has an empty entry. Re-run data:fetch:tafseer.`,
      );
    }
    total += got;
  }
  if (total !== TOTAL_AYAT) {
    throw new Error(
      `Tafseer file totals ${total} entries, expected ${TOTAL_AYAT}. Re-run data:fetch:tafseer.`,
    );
  }
}

/** Re-check the file against the oracle before trusting it. */
function verify(data: QuranData): void {
  if (data.surahs.length !== 114) {
    throw new Error(`Data file has ${data.surahs.length} surahs, expected 114. Re-run data:fetch.`);
  }
  let total = 0;
  for (let surah = 1; surah <= 114; surah++) {
    const got = data.surahs[surah - 1]?.ayat.length ?? -1;
    if (got !== AYAH_COUNTS[surah]) {
      throw new Error(
        `Data file: surah ${surah} has ${got} ayat, expected ${AYAH_COUNTS[surah]}. Re-run data:fetch.`,
      );
    }
    total += got;
  }
  if (total !== TOTAL_AYAT) {
    throw new Error(`Data file totals ${total} ayat, expected ${TOTAL_AYAT}. Re-run data:fetch.`);
  }
}

/** Insert rows in chunks so one giant INSERT never blows the packet size. */
async function createManyChunked<T>(
  label: string,
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
  chunkSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await insert(chunk);
    console.log(`  ${label}: ${Math.min(i + chunkSize, rows.length)}/${rows.length}`);
  }
}

main()
  .catch((err) => {
    console.error('\nSeed failed:\n', String(err));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
