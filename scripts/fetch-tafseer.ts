// Download the verified tafseer editions, check each hard, and write one frozen
// JSON file per edition that the seed reads. Run with:
//   pnpm data:fetch:tafseer            # fetch every edition in the registry
//   pnpm data:fetch:tafseer saadi      # fetch only the named edition(s)
//
// Why a separate fetch step (the same reasoning as the Quran text fetch):
//   - We never hand-type a single word of tafseer. It only ever comes from an
//     authoritative source (see src/database/reference/tafseers.ts).
//   - We verify what we downloaded against the same independent count table
//     used for the Quran text (6236 ayat, exact count per surah, numbered
//     1..n with no gaps, every ayah non-empty). A truncated or wrong-edition
//     file fails loudly here, long before any user could see a bad tafseer.
//   - The bot then reads the frozen local files (seeded into the Tafseer
//     table), so a daily send never depends on the network being up.
//
// Sources, per edition (all authoritative):
//   - alquran.cloud  : a whole edition in one JSON response (plain text).
//   - quranenc       : the Noble Quran Encyclopedia (King Fahd Complex /
//                      Tafsir Center), one surah per request (plain text).
//   - quran.foundation: the data behind quran.com, one chapter per request.
//                      Its tafsir text is HTML, so we strip it to plain text.
//                      Long editions group several ayat under one entry; we
//                      forward-fill within the surah so every ayah has its
//                      commentary (the same text the group covers).
//
// A "preview" edition (e.g. Ibn Kathir) is huge — tens of thousands of
// characters per ayah. Like the recitation audio, we do not commit the whole
// thing: we store only a bounded one-message opening, and the bot adds a link
// to read the rest (see src/core/tafseer.ts). See the NOTICE file for the
// per-edition attribution.

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/core';
import { AYAH_COUNTS, TOTAL_AYAT } from '../src/database/reference/ayah-counts';
import { TAFSEERS, tafseerByKey, type Tafseer } from '../src/database/reference/tafseers';
import { htmlToText, previewOpening, fillSurah } from './lib/tafseer-clean';

loadEnv();

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'prisma', 'data');

// How many characters of a "preview" edition to store (a comfortable single
// Telegram message). The opening is cut at a sentence boundary near this size.
const PREVIEW_CHARS = 700;

// Be polite to the source APIs: a few surahs in flight at once, with retries.
const CONCURRENCY = 5;
const MAX_TRIES = 4;

/** One surah's tafseer: its number and the ayat texts in order (ayat[i] is
 *  ayah i+1), exactly the shape the seed expects. */
interface SurahTafseer {
  number: number;
  ayat: string[];
}

async function main() {
  const wanted = parseArgs();
  console.log(
    `Fetching ${wanted.length} tafseer edition(s): ${wanted.map((t) => t.key).join(', ')}\n`,
  );
  mkdirSync(DATA_DIR, { recursive: true });

  for (const tafseer of wanted) {
    console.log(`── ${tafseer.key} (${tafseer.nameAr}) from ${tafseer.source.api} ──`);
    const surahs = await fetchEdition(tafseer);
    verify(surahs, tafseer);
    writeEdition(tafseer, surahs);
    console.log('');
  }

  console.log('Next: pnpm db:seed');
}

/** Which editions to fetch: the keys passed on the command line, or all of
 *  them. An unknown key fails loudly rather than silently doing nothing. */
function parseArgs(): Tafseer[] {
  const keys = process.argv
    .slice(2)
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) return [...TAFSEERS];
  return keys.map((key) => {
    const t = tafseerByKey(key);
    if (!t) {
      throw new Error(
        `Unknown tafseer edition "${key}". Known: ${TAFSEERS.map((x) => x.key).join(', ')}.`,
      );
    }
    return t;
  });
}

// ─── Per-source fetchers ────────────────────────────────────────────

async function fetchEdition(tafseer: Tafseer): Promise<SurahTafseer[]> {
  switch (tafseer.source.api) {
    case 'alquran.cloud':
      return fetchFromAlQuranCloud(tafseer);
    case 'quranenc':
      return fetchFromQuranEnc(tafseer);
    case 'quran.foundation':
      return fetchFromQuranFoundation(tafseer);
  }
}

/** A whole edition in one response: { data: { surahs: [{ number, ayahs:
 *  [{ numberInSurah, text }] }] } }. Plain text. */
async function fetchFromAlQuranCloud(tafseer: Tafseer): Promise<SurahTafseer[]> {
  const url = `https://api.alquran.cloud/v1/quran/${tafseer.source.ref}`;
  const json = (await fetchJson(url)) as {
    data?: {
      surahs?: Array<{ number?: number; ayahs?: Array<{ numberInSurah?: number; text?: string }> }>;
    };
  };
  const raw = json.data?.surahs;
  if (!Array.isArray(raw)) throw new Error(`Unexpected shape from ${url}: missing data.surahs.`);

  const out: SurahTafseer[] = [];
  for (let surah = 1; surah <= 114; surah++) {
    const s = raw.find((x) => Number(x.number) === surah);
    const ayahs = s?.ayahs ?? [];
    const ayat = [...ayahs]
      .sort((a, b) => Number(a.numberInSurah) - Number(b.numberInSurah))
      .map((a) => clean(String(a.text ?? ''), tafseer));
    out.push({ number: surah, ayat });
  }
  return out;
}

/** The Noble Quran Encyclopedia, one surah per request:
 *  { result: [{ aya, translation }] }. Plain text. */
async function fetchFromQuranEnc(tafseer: Tafseer): Promise<SurahTafseer[]> {
  return fetchPerSurah(tafseer, async (surah) => {
    const url = `https://quranenc.com/api/v1/translation/sura/${tafseer.source.ref}/${surah}`;
    const json = (await fetchJson(url)) as {
      result?: Array<{ aya?: number; translation?: string }>;
    };
    const result = json.result;
    if (!Array.isArray(result)) throw new Error(`Unexpected shape from ${url}: missing result[].`);
    const byAyah = new Map<number, string>();
    for (const r of result) byAyah.set(Number(r.aya), clean(String(r.translation ?? ''), tafseer));
    return fillSurah(byAyah, AYAH_COUNTS[surah], `${tafseer.key} surah ${surah}`);
  });
}

/** The data behind quran.com, one chapter per request:
 *  { tafsirs: [{ verse_key, text }] }. HTML text, and long editions group
 *  ayat, so we forward-fill within the surah. */
async function fetchFromQuranFoundation(tafseer: Tafseer): Promise<SurahTafseer[]> {
  return fetchPerSurah(tafseer, async (surah) => {
    const url = `https://api.quran.com/api/v4/tafsirs/${tafseer.source.ref}/by_chapter/${surah}?per_page=300`;
    const json = (await fetchJson(url)) as {
      tafsirs?: Array<{ verse_key?: string; text?: string }>;
      pagination?: { total_pages?: number };
    };
    if (!Array.isArray(json.tafsirs))
      throw new Error(`Unexpected shape from ${url}: missing tafsirs[].`);
    // The largest surah (286 ayat) fits in one page of 300; guard anyway so a
    // future page-size change can never silently drop the tail of a surah.
    if ((json.pagination?.total_pages ?? 1) > 1) {
      throw new Error(`${url} returned multiple pages; raise per_page in fetch-tafseer.ts.`);
    }
    const byAyah = new Map<number, string>();
    for (const t of json.tafsirs) {
      const [s, a] = String(t.verse_key ?? '')
        .split(':')
        .map(Number);
      if (s === surah && Number.isInteger(a)) byAyah.set(a, clean(String(t.text ?? ''), tafseer));
    }
    return fillSurah(byAyah, AYAH_COUNTS[surah], `${tafseer.key} surah ${surah}`);
  });
}

/** Run an async per-surah fetcher for surahs 1..114 with a small concurrency
 *  cap, returning the surahs in order. */
async function fetchPerSurah(
  tafseer: Tafseer,
  fetchSurah: (surah: number) => Promise<string[]>,
): Promise<SurahTafseer[]> {
  const out = new Array<SurahTafseer>(114);
  let next = 1;
  let done = 0;
  async function worker() {
    for (;;) {
      const surah = next++;
      if (surah > 114) return;
      out[surah - 1] = { number: surah, ayat: await fetchSurah(surah) };
      done++;
      if (done % 20 === 0 || done === 114) console.log(`  ${tafseer.key}: ${done}/114 surahs`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

// ─── Text handling ──────────────────────────────────────────────────

/** Clean one ayah's tafseer: strip HTML when the source serves it, then, for a
 *  "preview" edition, cut it down to a single-message opening. The pure helpers
 *  live in ./lib/tafseer-clean.ts (unit-tested). */
function clean(text: string, tafseer: Tafseer): string {
  let t = tafseer.source.html ? htmlToText(text) : text.trim();
  if (tafseer.kind === 'preview') t = previewOpening(t, PREVIEW_CHARS);
  return t;
}

// ─── Verify + write ─────────────────────────────────────────────────

/** Fail loudly unless the edition matches the canonical structure: 114 surahs,
 *  each with the exact ayah count from the oracle, numbered 1..n, every entry
 *  non-empty — so it lines up one-to-one with the seeded ayat by (surah, ayah). */
function verify(surahs: SurahTafseer[], tafseer: Tafseer): void {
  if (surahs.length !== 114) {
    throw new Error(`${tafseer.key}: got ${surahs.length} surahs, expected 114.`);
  }
  let total = 0;
  for (let surah = 1; surah <= 114; surah++) {
    const s = surahs[surah - 1];
    const expected = AYAH_COUNTS[surah];
    if (!s || s.number !== surah)
      throw new Error(`${tafseer.key}: surah ${surah} missing/out of order.`);
    if (s.ayat.length !== expected) {
      throw new Error(
        `${tafseer.key}: surah ${surah} has ${s.ayat.length} entries, expected ${expected}.`,
      );
    }
    if (s.ayat.some((t) => !t || t.trim() === '')) {
      throw new Error(
        `${tafseer.key}: surah ${surah} has an empty entry. Wrong edition or corrupt source.`,
      );
    }
    total += expected;
  }
  if (total !== TOTAL_AYAT) {
    throw new Error(`${tafseer.key}: totals ${total} entries, expected ${TOTAL_AYAT}.`);
  }
  console.log(`  ✓ verified ${total} entries across 114 surahs`);
}

function writeEdition(tafseer: Tafseer, surahs: SurahTafseer[]): void {
  const text = surahs.flatMap((s) => s.ayat).join('\n');
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
  const payload = {
    meta: {
      key: tafseer.key,
      edition: tafseer.nameAr,
      kind: tafseer.kind,
      source: `${tafseer.source.api} (${tafseer.source.ref})`,
      totalAyat: TOTAL_AYAT,
      sha256,
    },
    surahs,
  };
  const out = join(DATA_DIR, `tafseer-${tafseer.key}.json`);
  writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`  wrote ${out}\n  sha256: ${sha256}`);
}

// ─── HTTP with retry ────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ayah-bot/1.0 (+tafseer data fetch)', Accept: 'application/json' },
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`); // transient: retry
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} (not retryable)`);
      const body = await res.text();
      try {
        return JSON.parse(body);
      } catch {
        throw new Error('response was not JSON (wrong URL or an error page?)');
      }
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_TRIES) await sleep(500 * attempt); // linear backoff
    }
  }
  throw new Error(`Failed to fetch ${url} after ${MAX_TRIES} tries: ${String(lastErr)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('\nfetch-tafseer failed:\n', String(err));
  process.exit(1);
});
