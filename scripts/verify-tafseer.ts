// Verify the tafseer "read in full" links: for every offered edition, check
// that a spread of ayat actually resolve on the site the bot links to. Run with:
//   pnpm verify:tafseer
//
// The committed tafseer TEXT is already verified at fetch time (6236 entries,
// right count per surah, non-empty) and frozen in prisma/data, so a daily send
// never depends on the network. What this script guards is the OTHER half: the
// per-ayah link the bot builds for the "link" format and for a preview edition's
// "read the rest" pointer (see tafseerLink in src/core/tafseer.ts). If a site
// changes its URL shape, that link rots silently for users — this catches it,
// the same way verify:audio catches a dead CDN folder.

import { loadEnv, tafseerLink } from '../src/core';
import { TAFSEERS } from '../src/database/reference/tafseers';

loadEnv();

// A representative spread of ayat each edition's link must resolve.
const SAMPLE: ReadonlyArray<[surah: number, ayah: number]> = [
  [1, 1], // first ayah of the Quran
  [2, 255], // Ayat al-Kursi
  [2, 282], // the longest ayah
  [112, 1], // a short late surah
  [114, 6], // the last ayah of the Quran
];

interface Probe {
  ok: boolean;
  detail: string;
}

async function probe(url: string): Promise<Probe> {
  try {
    // A normal browser GET: these are HTML pages, not an API. We only care that
    // the page exists (2xx), not its body.
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'ayah-bot/1.0 (tafseer link verify)' },
    });
    if (res.status !== 200) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true, detail: 'ok' };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}

async function main() {
  console.log(`Verifying tafseer links for ${TAFSEERS.length} editions\n`);
  let failures = 0;

  for (const t of TAFSEERS) {
    const results = await Promise.all(
      SAMPLE.map(([s, a]) => probe(tafseerLink(t.linkHost, t.linkRef, s, a))),
    );
    const bad = results
      .map((r, i) => ({ r, ref: SAMPLE[i] }))
      .filter((x) => !x.r.ok)
      .map((x) => `${x.ref[0]}:${x.ref[1]} (${x.r.detail})`);
    if (bad.length === 0) {
      console.log(`  ✓ ${t.key.padEnd(12)} ${t.linkHost}/${t.linkRef}`);
    } else {
      failures++;
      console.error(
        `  ✗ ${t.key.padEnd(12)} ${t.linkHost}/${t.linkRef}\n      ${bad.join('\n      ')}`,
      );
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} edition(s) failed. Check the linkHost/linkRef in tafseers.ts.`);
    process.exit(1);
  }
  console.log(`\nAll ${TAFSEERS.length} editions resolve for the sampled ayat.`);
}

main().catch((err) => {
  console.error('\nverify-tafseer failed:\n', String(err));
  process.exit(1);
});
