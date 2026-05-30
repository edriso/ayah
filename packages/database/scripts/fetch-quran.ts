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
import { surahUsesBasmala, removeBasmalaPrefix, loadEnv } from '@ayah/core';
import { AYAH_COUNTS, TOTAL_AYAT } from '../src/reference/ayah-counts';

// Pick up QURAN_SOURCE_URL from the root .env if present.
loadEnv();

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
  const basmala = normalizeBasmala(ayat);

  const surahs = groupBySurah(ayat);
  const text = ayat.map((a) => a.text).join('\n');
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');

  const payload = {
    meta: {
      source: 'Tanzil Uthmani (https://tanzil.net)',
      sourceUrl,
      totalAyat: ayat.length,
      // The basmala kept verbatim from the source (surah 1 ayah 1). Stored
      // so the bot shows the exact source bytes as the surah opening.
      basmala,
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

/**
 * Separate the basmala from the first ayah of each surah, and return the
 * basmala text verbatim.
 *
 * This Tanzil Uthmani edition merges the basmala into the text of ayah 1 for
 * every surah except At-Tawbah (9). For correct ayah-by-ayah memorization we
 * store the pure numbered ayah, and the bot shows the basmala as the surah
 * opening instead (see packages/core/basmala.ts). The user still sees the
 * full basmala; it just lives in its proper place.
 *
 * The basmala bytes come from the source itself (surah 1 ayah 1), so we never
 * hand-type the text and what the bot shows is exactly what Tanzil shipped.
 * Al-Fatihah (1) is left untouched, because there the basmala is ayah 1.
 */
function normalizeBasmala(ayat: ParsedAyah[]): string {
  const fatihaOpening = ayat.find((a) => a.surah === 1 && a.ayah === 1);
  if (!fatihaOpening) throw new Error('Surah 1 ayah 1 not found; cannot read the basmala.');
  const basmala = fatihaOpening.text; // verbatim, for display

  for (const a of ayat) {
    if (a.ayah !== 1 || a.surah === 1) continue;
    if (!surahUsesBasmala(a.surah)) continue; // At-Tawbah has no basmala
    const cleaned = removeBasmalaPrefix(a.text, basmala);
    if (cleaned === a.text) {
      // A non-merged edition: ayah 1 is already clean. Nothing to strip.
      console.warn(`Note: surah ${a.surah} ayah 1 had no merged basmala (already clean).`);
      continue;
    }
    if (cleaned === '') {
      throw new Error(`Surah ${a.surah} ayah 1 became empty after removing the basmala.`);
    }
    a.text = cleaned;
  }
  return basmala;
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
