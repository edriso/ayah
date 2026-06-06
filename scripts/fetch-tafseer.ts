// Download a verified tafseer (ayah-by-ayah commentary), check it hard, and
// write it to a frozen JSON file the seed reads. Run once with:
//   pnpm data:fetch:tafseer
//
// Why a separate fetch step (the same reasoning as the Quran text fetch):
//   - We never hand-type a single word of tafseer. It only ever comes from an
//     authoritative source.
//   - We verify what we downloaded against the same independent count table
//     used for the Quran text (6236 ayat, exact count per surah, numbered
//     1..n with no gaps, every ayah non-empty). A truncated or wrong-edition
//     file fails loudly here, long before any user could see a bad tafseer.
//   - The bot then reads the frozen local file (seeded into the Ayah table),
//     so a daily send never depends on the network being up.
//
// The tafseer is التفسير الميسر (Al-Muyassar), the concise tafseer issued by
// the King Fahd Complex for the Printing of the Holy Quran. We fetch it from
// the AlQuran.cloud API (edition "ar.muyassar"), which serves that exact text.
// The committed text was cross-checked against quranenc.com (Tafsir Center's
// Noble Quran Encyclopedia, edition "arabic_moyassar") and matched verbatim.
// See the NOTICE file for attribution.

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/core';
import { AYAH_COUNTS, TOTAL_AYAT } from '../src/database/reference/ayah-counts';

// Pick up TAFSEER_SOURCE_URL from the root .env if present.
loadEnv();

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'prisma', 'data');
const OUT_JSON = join(DATA_DIR, 'tafseer-muyassar.json');

// AlQuran.cloud serves a whole edition (all 6236 ayat) in one JSON response.
// The "ar.muyassar" edition is Al-Muyassar (King Fahd Complex). Override with
// the TAFSEER_SOURCE_URL env var if the host ever changes this path, as long
// as the replacement returns the same { data: { surahs: [{ number, ayahs:
// [{ numberInSurah, text }] }] } } shape.
const DEFAULT_SOURCE = 'https://api.alquran.cloud/v1/quran/ar.muyassar';

const EDITION = 'التفسير الميسر (Al-Muyassar) — King Fahd Complex';

interface ParsedTafseer {
  surah: number;
  ayah: number;
  text: string;
}

async function main() {
  const sourceUrl = process.env.TAFSEER_SOURCE_URL?.trim() || DEFAULT_SOURCE;
  console.log(`Downloading tafseer (Al-Muyassar) from:\n  ${sourceUrl}\n`);

  const raw = await download(sourceUrl);
  const ayat = parse(raw);
  verify(ayat);

  const surahs = groupBySurah(ayat);
  const text = ayat.map((a) => a.text).join('\n');
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');

  const payload = {
    meta: {
      source: 'AlQuran.cloud edition "ar.muyassar" (https://alquran.cloud)',
      edition: EDITION,
      sourceUrl,
      totalAyat: ayat.length,
      sha256,
    },
    surahs,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  console.log(`Verified ${ayat.length} tafseer entries across ${surahs.length} surahs.`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Wrote ${OUT_JSON}`);
  console.log('\nNext: pnpm db:seed');
}

async function download(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'ayah-bot/1.0 (+tafseer data fetch)' } });
  } catch (err) {
    throw new Error(
      `Could not reach the tafseer source. Check your connection, or set ` +
        `TAFSEER_SOURCE_URL to an AlQuran.cloud "ar.muyassar" edition download.\n  ${String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Download failed with HTTP ${res.status}. The source URL may have changed; ` +
        `set TAFSEER_SOURCE_URL to a current AlQuran.cloud "ar.muyassar" edition link.`,
    );
  }
  return res.text();
}

/**
 * Parse the AlQuran.cloud edition JSON into a flat list of (surah, ayah, text).
 * The shape is { data: { surahs: [{ number, ayahs: [{ numberInSurah, text }] }] } }.
 * Anything else (an HTML error page, a changed schema) fails here.
 */
function parse(raw: string): ParsedTafseer[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      'The download was not JSON. The source URL may be wrong or returned an error page.',
    );
  }
  const surahs = (json as { data?: { surahs?: unknown } })?.data?.surahs;
  if (!Array.isArray(surahs)) {
    throw new Error('Unexpected JSON shape: missing data.surahs array. Wrong source URL?');
  }

  const out: ParsedTafseer[] = [];
  for (const s of surahs as Array<{ number?: number; ayahs?: unknown }>) {
    const surah = Number(s.number);
    if (!Array.isArray(s.ayahs)) continue;
    for (const a of s.ayahs as Array<{ numberInSurah?: number; text?: string }>) {
      const ayah = Number(a.numberInSurah);
      const text = String(a.text ?? '').trim();
      if (!Number.isInteger(surah) || !Number.isInteger(ayah) || text === '') continue;
      out.push({ surah, ayah, text });
    }
  }
  return out;
}

/**
 * Fail loudly unless the parsed tafseer matches the canonical Quran structure:
 * 6236 entries total, surahs 1..114, and each surah's ayat numbered 1..count
 * with the exact count from the oracle table — so the tafseer lines up
 * one-to-one with the seeded ayat (same (surah, ayah) keys).
 */
function verify(ayat: ParsedTafseer[]): void {
  if (ayat.length !== TOTAL_AYAT) {
    throw new Error(
      `Expected ${TOTAL_AYAT} tafseer entries but parsed ${ayat.length}. The download is incomplete or in an unexpected format.`,
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
        `Surah ${surah} has ${ayahs.length} tafseer entries but should have ${expected}. Wrong edition or corrupt file.`,
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
function groupBySurah(ayat: ParsedTafseer[]): { number: number; ayat: string[] }[] {
  const surahs: { number: number; ayat: string[] }[] = [];
  for (let surah = 1; surah <= 114; surah++) {
    const texts = ayat
      .filter((a) => a.surah === surah)
      .sort((x, y) => x.ayah - y.ayah)
      .map((a) => a.text);
    surahs.push({ number: surah, ayat: texts });
  }
  return surahs;
}

main().catch((err) => {
  console.error('\nfetch-tafseer failed:\n', String(err));
  process.exit(1);
});
