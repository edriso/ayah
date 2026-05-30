// Download the verified Tanzil Uthmani Quran text, check it hard, and write
// it to a frozen JSON file the seed reads. Run once with: pnpm data:fetch
//
// Why a separate fetch step (instead of bundling the text in git from the
// start, or calling an API at send time):
//   - We never hand-type a single ayah. The text only ever comes from the
//     authoritative Tanzil source.
//   - We verify what we downloaded against an independent count table
//     (6236 ayat, exact count per surah). A truncated or wrong-edition file
//     fails loudly here, long before any user could see a bad ayah.
//   - The bot then reads the frozen local file, so a daily send never
//     depends on the network being up.
//
// The text is the Tanzil Uthmani edition (https://tanzil.net), used unchanged
// under the Tanzil terms of use. See the NOTICE file.

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AYAH_COUNTS, TOTAL_AYAT } from '../src/reference/ayah-counts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'prisma', 'data');
const OUT_JSON = join(DATA_DIR, 'quran-uthmani.json');

// Tanzil "Uthmani" text, output type "Text (with aya numbers)". Lines look
// like:  1|1|بِسْمِ ٱللَّهِ ...   (sura|aya|text). Override with the
// QURAN_SOURCE_URL env var if Tanzil changes this path.
const DEFAULT_SOURCE =
  'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true';

interface ParsedAyah {
  surah: number;
  ayah: number;
  text: string;
}

async function main() {
  const sourceUrl = process.env.QURAN_SOURCE_URL?.trim() || DEFAULT_SOURCE;
  console.log(`Downloading Quran text from:\n  ${sourceUrl}\n`);

  const raw = await download(sourceUrl);
  const ayat = parse(raw);
  verify(ayat);

  const surahs = groupBySurah(ayat);
  const text = ayat.map((a) => a.text).join('\n');
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');

  const payload = {
    meta: {
      source: 'Tanzil Uthmani (https://tanzil.net)',
      sourceUrl,
      totalAyat: ayat.length,
      sha256,
    },
    surahs,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  console.log(`Verified ${ayat.length} ayat across ${surahs.length} surahs.`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Wrote ${OUT_JSON}`);
  console.log('\nNext: pnpm db:seed');
}

async function download(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'ayah-bot/1.0 (+quran data fetch)' } });
  } catch (err) {
    throw new Error(
      `Could not reach the Quran source. Check your connection, or set ` +
        `QURAN_SOURCE_URL to a Tanzil "Text (with aya numbers)" Uthmani download.\n  ${String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Download failed with HTTP ${res.status}. The Tanzil URL may have changed; ` +
        `set QURAN_SOURCE_URL to a current Tanzil Uthmani "Text (with aya numbers)" link.`,
    );
  }
  return res.text();
}

/** Parse "sura|aya|text" lines, skipping blank lines and # comments. */
function parse(raw: string): ParsedAyah[] {
  const out: ParsedAyah[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const surah = Number(parts[0]);
    const ayah = Number(parts[1]);
    const text = parts.slice(2).join('|').trim();
    if (!Number.isInteger(surah) || !Number.isInteger(ayah) || text === '') continue;
    out.push({ surah, ayah, text });
  }
  return out;
}

/**
 * Fail loudly unless the parsed text matches the canonical structure: 6236
 * ayat total, surahs 1..114, and each surah's ayat numbered 1..count with
 * the exact count from the oracle table.
 */
function verify(ayat: ParsedAyah[]): void {
  if (ayat.length !== TOTAL_AYAT) {
    throw new Error(
      `Expected ${TOTAL_AYAT} ayat but parsed ${ayat.length}. The download is incomplete or in an unexpected format.`,
    );
  }

  const perSurah = new Map<number, number[]>();
  for (const a of ayat) {
    if (!perSurah.has(a.surah)) perSurah.set(a.surah, []);
    perSurah.get(a.surah)!.push(a.ayah);
  }

  if (perSurah.size !== 114) {
    throw new Error(`Expected 114 surahs but found ${perSurah.size}.`);
  }

  for (let surah = 1; surah <= 114; surah++) {
    const ayahs = perSurah.get(surah);
    const expected = AYAH_COUNTS[surah];
    if (!ayahs) throw new Error(`Surah ${surah} is missing from the download.`);
    if (ayahs.length !== expected) {
      throw new Error(
        `Surah ${surah} has ${ayahs.length} ayat but should have ${expected}. Wrong edition or corrupt file.`,
      );
    }
    for (let i = 0; i < expected; i++) {
      if (ayahs[i] !== i + 1) {
        throw new Error(
          `Surah ${surah} ayah numbering is off at position ${i + 1} (saw ${ayahs[i]}). Ayat must be 1..${expected} in order.`,
        );
      }
    }
  }
}

/** Reshape the flat list into [{ number, ayat: [text, ...] }] by surah. */
function groupBySurah(ayat: ParsedAyah[]): { number: number; ayat: string[] }[] {
  const surahs: { number: number; ayat: string[] }[] = [];
  for (let surah = 1; surah <= 114; surah++) {
    const texts = ayat.filter((a) => a.surah === surah).map((a) => a.text);
    surahs.push({ number: surah, ayat: texts });
  }
  return surahs;
}

main().catch((err) => {
  console.error('\nfetch-quran failed:\n', String(err));
  process.exit(1);
});
