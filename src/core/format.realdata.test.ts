// These tests run the message formatter against the REAL seeded Quran text
// (the same file the seed loads), not fabricated long strings. They lock in the
// length guarantees the bot relies on: the longest single ayah always fits one
// Telegram message, and the heaviest realistic review block splits cleanly with
// no ayah ever cut in half.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formatDailyMessages, ayahMarker, TELEGRAM_MAX } from './format';
import type { DisplayAyah } from './types';

const here = dirname(fileURLToPath(import.meta.url));
const quran: { surahs: { number: number; ayat: string[] }[] } = JSON.parse(
  readFileSync(join(here, '../../prisma/data/quran-uthmani.json'), 'utf8'),
);

const surahAyat = (num: number) => quran.surahs.find((s) => s.number === num)!.ayat;
const ayah = (surah: number, n: number): DisplayAyah => ({
  numberInSurah: n,
  text: surahAyat(surah)[n - 1],
});
const block = (surah: number, from: number, to: number): DisplayAyah[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ayah(surah, from + i));

// The display surah does not affect length math; Al-Baqarah is where the
// longest ayat live, so we name it to keep the fixtures honest.
const baqarah = { number: 2, nameAr: 'البقرة' };

describe('formatDailyMessages on real Quran text', () => {
  it('the longest ayah in the Quran (Al-Baqarah 2:282) fits in ONE message', () => {
    // Sanity-check that 2:282 really is the longest single ayah, so this test
    // keeps guarding the true worst case if the data ever changes.
    let longest = { surah: 0, n: 0, len: 0 };
    for (const s of quran.surahs) {
      s.ayat.forEach((t, i) => {
        if (t.length > longest.len) longest = { surah: s.number, n: i + 1, len: t.length };
      });
    }
    expect({ surah: longest.surah, n: longest.n }).toEqual({ surah: 2, n: 282 });

    const msgs = formatDailyMessages({ surah: baqarah, today: ayah(2, 282), review: [] });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].length).toBeLessThanOrEqual(TELEGRAM_MAX);
    // The whole ayah is present, intact (never split mid-text).
    expect(msgs[0]).toContain(surahAyat(2)[281]);
  });

  it('keeps the longest ayah intact when it sits in the review block', () => {
    // Today is 2:283; the review window reaches back over 2:282 (the longest).
    const msgs = formatDailyMessages({
      surah: baqarah,
      today: ayah(2, 283),
      review: block(2, 278, 282),
    });
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(TELEGRAM_MAX);
    // 2:282's full text appears contiguously in exactly one message.
    const carrying = msgs.filter((m) => m.includes(surahAyat(2)[281]));
    expect(carrying).toHaveLength(1);
  });

  it('splits the heaviest realistic passage (2:266, review 20) without dropping an ayah', () => {
    // today = 2:266 with the 20 ayat before it is the longest passage any
    // subscriber can receive (reviewCount maxes at 20). It exceeds one message.
    const today = ayah(2, 266);
    const review = block(2, 246, 265); // the 20 previous ayat
    const msgs = formatDailyMessages({ surah: baqarah, today, review });

    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(TELEGRAM_MAX);

    // Every ayah 246..266 appears exactly once and its full text is intact.
    const all = msgs.join('\n');
    for (let n = 246; n <= 266; n++) {
      expect(all.split(ayahMarker(n)).length - 1).toBe(1);
      const carrying = msgs.filter((m) => m.includes(surahAyat(2)[n - 1]));
      expect(carrying).toHaveLength(1);
    }
    // Today's ayah lands last, marked.
    expect(msgs[msgs.length - 1]).toContain(`${ayahMarker(266)} 👉`);
  });
});
