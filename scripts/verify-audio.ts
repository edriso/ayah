// Verify the recitation audio source: for every offered reciter, check that a
// spread of ayat are actually served as real MP3s from the configured CDN.
// Run with: pnpm verify:audio
//
// Unlike the Quran text and tafseer, the audio is NOT committed to this repo
// (one reciter for the whole Quran is ~1 GB). The bot fetches each ayah's audio
// from the CDN on first send and then reuses Telegram's file_id. This script is
// the "trusted resource is healthy" check that takes the place of a committed,
// hashed data file: it confirms each reciter's folder exists and returns valid
// audio for a representative sample (first ayah, the longest ayah, a surah with
// no basmala, the last ayah), so a wrong folder name or a dead source fails
// loudly here instead of silently dropping audio for users.

import { loadEnv, ayahAudioUrl } from '../src/core';
import { RECITERS } from '../src/database/reference/reciters';

loadEnv();

const BASE = process.env.AUDIO_BASE_URL?.trim().replace(/\/+$/, '') || 'https://everyayah.com/data';

// A representative spread of ayat. Each must be served by every reciter.
const SAMPLE: ReadonlyArray<[surah: number, ayah: number]> = [
  [1, 1], // first ayah of the Quran (basmala in Al-Fatihah)
  [2, 255], // Ayat al-Kursi
  [2, 282], // the longest ayah
  [9, 1], // first ayah of the only surah without a basmala
  [114, 6], // the last ayah of the Quran
];

const MIN_BYTES = 1024; // smaller than this is an error page, not audio

/** True if the first bytes look like an MP3 (ID3 tag or an MPEG frame sync). */
function looksLikeMp3(head: Uint8Array): boolean {
  if (head.length < 2) return false;
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true; // "ID3"
  return head[0] === 0xff && (head[1] & 0xe0) === 0xe0; // 11-bit frame sync
}

interface Probe {
  ok: boolean;
  detail: string;
}

async function probe(url: string): Promise<Probe> {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-8', 'User-Agent': 'ayah-bot/1.0 (audio verify)' },
    });
    if (res.status !== 200 && res.status !== 206)
      return { ok: false, detail: `HTTP ${res.status}` };
    const type = res.headers.get('content-type') ?? '';
    if (!/audio|octet-stream|mpeg/i.test(type)) return { ok: false, detail: `type ${type}` };
    const head = new Uint8Array(await res.arrayBuffer());
    if (!looksLikeMp3(head)) return { ok: false, detail: 'not an MP3 (error page?)' };
    // Confirm a real, non-trivial file via the range total when present.
    const total = Number((res.headers.get('content-range') ?? '').split('/')[1]);
    if (Number.isFinite(total) && total > 0 && total < MIN_BYTES) {
      return { ok: false, detail: `too small (${total} bytes)` };
    }
    return { ok: true, detail: 'ok' };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}

async function main() {
  console.log(`Verifying recitation audio for ${RECITERS.length} reciters from:\n  ${BASE}\n`);
  let failures = 0;

  for (const reciter of RECITERS) {
    const results = await Promise.all(
      SAMPLE.map(([s, a]) => probe(ayahAudioUrl(BASE, reciter.folder, s, a))),
    );
    const bad = results
      .map((r, i) => ({ r, ref: SAMPLE[i] }))
      .filter((x) => !x.r.ok)
      .map((x) => `${x.ref[0]}:${x.ref[1]} (${x.r.detail})`);
    if (bad.length === 0) {
      console.log(`  ✓ ${reciter.key.padEnd(15)} ${reciter.folder}`);
    } else {
      failures++;
      console.error(
        `  ✗ ${reciter.key.padEnd(15)} ${reciter.folder}\n      ${bad.join('\n      ')}`,
      );
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} reciter(s) failed. Check the folder names or the CDN.`);
    process.exit(1);
  }
  console.log(`\nAll ${RECITERS.length} reciters serve valid audio for the sampled ayat.`);
}

main().catch((err) => {
  console.error('\nverify-audio failed:\n', String(err));
  process.exit(1);
});
