// Seed the database from the frozen data files.
//
// Order of operations:
//   1. pnpm data:fetch          -> downloads + verifies + writes the Quran text
//   2. pnpm data:fetch:tafseer  -> downloads + verifies the tafseer editions
//   3. pnpm db:push (or deploy) -> creates the tables
//   4. pnpm db:seed             -> this script: fills Surah, Ayah, Tafseer,
//                                  Track, TrackEntry
//
// This script re-checks the data (6236 ayat, right count per surah) before
// writing anything, and is safe to run twice: a fully-seeded table is left
// untouched.

import { loadEnv } from '../src/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/database/client';
import { SURAHS } from '../src/database/reference/surahs';
import { AYAH_COUNTS, TOTAL_AYAT } from '../src/database/reference/ayah-counts';
import { TAFSEERS } from '../src/database/reference/tafseers';
import {
  KIDS_TRACK,
  MUSHAF_TRACK,
  buildKidsOrder,
  buildMushafOrder,
  type CurriculumStep,
} from '../src/database/reference/curriculum';

loadEnv();

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, 'data');
const DATA_FILE = join(DATA_DIR, 'quran-uthmani.json');

interface QuranData {
  meta: { source: string; sourceUrl: string; totalAyat: number; sha256: string };
  surahs: { number: number; ayat: string[] }[];
}

// One frozen tafseer edition, aligned with the text by (surah, ayah):
// surahs[surah-1].ayat[ayah-1] is the tafseer for that ayah. One file per
// edition (tafseer-<key>.json), produced by "pnpm data:fetch:tafseer".
interface TafseerData {
  surahs: { number: number; ayat: string[] }[];
}

/** A loaded tafseer edition: its registry key plus the file's data. */
interface LoadedTafseer {
  key: string;
  data: TafseerData;
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

  // The tafseer is optional: an edition whose data file is missing is simply
  // skipped (a subscriber on it gets the ayah with no tafseer message). Each
  // file present is verified against the same oracle so a corrupt/wrong-edition
  // file fails loudly before any user sees it.
  const editions = loadTafseerEditions();
  for (const e of editions) verifyTafseerFile(e.key, e.data);

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
    await seedText(data);
  }

  // Step 1b: the tafseer table, one edition at a time. Per-edition idempotent:
  // a fully-seeded edition is skipped, so this is safe to re-run and adds a
  // newly fetched edition to an already-seeded database.
  for (const e of editions) await seedTafseerEdition(e.key, e.data);

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

/** Insert the 114 surah rows and all 6236 ayah rows from the verified data. */
async function seedText(data: QuranData): Promise<void> {
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

  console.log('Seeding ayat...');
  const ayahRows = data.surahs.flatMap((s) =>
    s.ayat.map((text, i) => ({ surahNumber: s.number, numberInSurah: i + 1, text })),
  );
  await createManyChunked('ayat', ayahRows, (chunk) => prisma.ayah.createMany({ data: chunk }));
}

/**
 * Seed the Tafseer table for one edition from its verified file. Per-edition
 * idempotent: a fully-seeded edition (6236 rows) is skipped, an empty one is
 * inserted, a half-seeded one is a hard error (clear it and reseed). The file
 * is aligned by index — surahs[surah-1].ayat[ayah-1] is the (edition, surah,
 * ayah) text — so no ayah-id lookup is needed.
 */
async function seedTafseerEdition(edition: string, tafseer: TafseerData): Promise<void> {
  const have = await prisma.tafseer.count({ where: { edition } });
  if (have === TOTAL_AYAT) {
    console.log(`Tafseer "${edition}" already seeded (${TOTAL_AYAT} rows). Skipping.`);
    return;
  }
  if (have > 0) {
    throw new Error(
      `Tafseer "${edition}" has ${have} rows (expected 0 or ${TOTAL_AYAT}). It is half-seeded; ` +
        `clear it (DELETE FROM tafseer WHERE edition='${edition}') and reseed.`,
    );
  }
  console.log(`Seeding tafseer "${edition}"...`);
  const rows = tafseer.surahs.flatMap((s) =>
    s.ayat.map((text, i) => ({ edition, surahNumber: s.number, numberInSurah: i + 1, text })),
  );
  await createManyChunked(`tafseer ${edition}`, rows, (chunk) =>
    prisma.tafseer.createMany({ data: chunk }),
  );
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

/** Read every tafseer edition whose data file has been fetched. A missing file
 *  is fine (that edition is just skipped); the bot omits the tafseer for a
 *  subscriber on an unseeded edition. */
function loadTafseerEditions(): LoadedTafseer[] {
  const loaded: LoadedTafseer[] = [];
  for (const t of TAFSEERS) {
    const file = join(DATA_DIR, `tafseer-${t.key}.json`);
    try {
      loaded.push({ key: t.key, data: JSON.parse(readFileSync(file, 'utf8')) as TafseerData });
    } catch {
      console.warn(
        `No tafseer data file for "${t.key}" at ${file}. Skipping it ` +
          `(run "pnpm data:fetch:tafseer ${t.key}" to add it).`,
      );
    }
  }
  return loaded;
}

/** Re-check one tafseer file against the same oracle as the text: 114 surahs,
 *  the right count per surah, every entry non-empty, so it lines up one-to-one
 *  with the ayat by (surah, ayah). */
function verifyTafseerFile(edition: string, tafseer: TafseerData): void {
  if (tafseer.surahs?.length !== 114) {
    throw new Error(
      `Tafseer "${edition}" has ${tafseer.surahs?.length} surahs, expected 114. Re-run data:fetch:tafseer ${edition}.`,
    );
  }
  let total = 0;
  for (let surah = 1; surah <= 114; surah++) {
    const ayat = tafseer.surahs[surah - 1]?.ayat;
    const got = ayat?.length ?? -1;
    if (got !== AYAH_COUNTS[surah]) {
      throw new Error(
        `Tafseer "${edition}": surah ${surah} has ${got} entries, expected ${AYAH_COUNTS[surah]}. Re-run data:fetch:tafseer ${edition}.`,
      );
    }
    if (ayat!.some((t) => !t || t.trim() === '')) {
      throw new Error(
        `Tafseer "${edition}": surah ${surah} has an empty entry. Re-run data:fetch:tafseer ${edition}.`,
      );
    }
    total += got;
  }
  if (total !== TOTAL_AYAT) {
    throw new Error(
      `Tafseer "${edition}" totals ${total} entries, expected ${TOTAL_AYAT}. Re-run data:fetch:tafseer ${edition}.`,
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
