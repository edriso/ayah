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

import { loadEnv } from '@ayah/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/client';
import { SURAHS } from '../src/reference/surahs';
import { AYAH_COUNTS, TOTAL_AYAT } from '../src/reference/ayah-counts';
import { KIDS_TRACK, buildKidsOrder } from '../src/reference/curriculum';

loadEnv();

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(HERE, 'data', 'quran-uthmani.json');

interface QuranData {
  meta: { source: string; sourceUrl: string; totalAyat: number; sha256: string };
  surahs: { number: number; ayat: string[] }[];
}

async function main() {
  const data = loadData();
  verify(data);

  // Idempotency guard: if the text is already in place, do nothing.
  const existingAyat = await prisma.ayah.count();
  if (existingAyat === TOTAL_AYAT) {
    console.log('Quran text already seeded (6236 ayat). Nothing to do.');
    return;
  }
  if (existingAyat > 0) {
    throw new Error(
      `Found ${existingAyat} ayat (expected 0 or ${TOTAL_AYAT}). The database is half-seeded. ` +
        `Run "pnpm db:reset" to wipe and reseed.`,
    );
  }

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
    s.ayat.map((text, i) => ({
      surahNumber: s.number,
      numberInSurah: i + 1,
      text,
    })),
  );
  await createManyChunked('ayat', ayahRows, (chunk) => prisma.ayah.createMany({ data: chunk }));

  console.log('Building the ayah lookup...');
  const ayahIdByKey = new Map<string, number>();
  const allAyat = await prisma.ayah.findMany({
    select: { id: true, surahNumber: true, numberInSurah: true },
  });
  for (const a of allAyat) ayahIdByKey.set(`${a.surahNumber}:${a.numberInSurah}`, a.id);

  console.log('Creating the kids track...');
  const track = await prisma.track.upsert({
    where: { key: KIDS_TRACK.key },
    update: { name: KIDS_TRACK.name, loops: KIDS_TRACK.loops },
    create: { key: KIDS_TRACK.key, name: KIDS_TRACK.name, loops: KIDS_TRACK.loops },
  });

  console.log('Seeding track entries (the memorization order)...');
  const order = buildKidsOrder((surah) => data.surahs[surah - 1].ayat.length);
  const entryRows = order.map((step, position) => {
    const ayahId = ayahIdByKey.get(`${step.surahNumber}:${step.numberInSurah}`);
    if (!ayahId) {
      throw new Error(`No ayah row for ${step.surahNumber}:${step.numberInSurah}`);
    }
    return { trackId: track.id, position, ayahId };
  });
  await createManyChunked('track_entries', entryRows, (chunk) =>
    prisma.trackEntry.createMany({ data: chunk }),
  );

  console.log(
    `\nDone. Seeded ${ayahRows.length} ayat and ${entryRows.length} track entries ` +
      `for track "${KIDS_TRACK.key}".`,
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
