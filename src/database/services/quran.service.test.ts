import { describe, it, expect, beforeEach, vi } from 'vitest';

// Only the Prisma client is stubbed; the boundary math (isSurahComplete,
// advancePosition) is the real core logic.
const h = vi.hoisted(() => ({ findUnique: vi.fn(), count: vi.fn() }));
vi.mock('../client', () => ({
  prisma: {
    trackEntry: { findUnique: h.findUnique },
    deliveryLog: { count: h.count },
  },
}));

import { surahCompletionFor } from './quran.service';

const TOTAL = 6236;
const SUB = 1;

// An entry whose ayah is the last of a 30-ayah surah (Al-Mulk, ayah 30).
function lastAyahEntry(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    trackId: 1,
    position: 100,
    ayah: {
      numberInSurah: 30,
      text: '…',
      surah: { number: 67, nameAr: 'الملك', ayahCount: 30 },
    },
    ...over,
  } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('surahCompletionFor', () => {
  it('returns null when the ayah is not the last of its surah', async () => {
    const entry = lastAyahEntry({
      ayah: { numberInSurah: 5, text: '…', surah: { number: 67, nameAr: 'الملك', ayahCount: 30 } },
    });
    expect(await surahCompletionFor(entry, TOTAL, true, SUB)).toBeNull();
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.count).not.toHaveBeenCalled();
  });

  it('names the completed and the next surah on a mid-track boundary', async () => {
    h.findUnique.mockResolvedValue({ ayah: { surah: { number: 66, nameAr: 'التحريم' } } });
    const result = await surahCompletionFor(lastAyahEntry(), TOTAL, true, SUB);
    expect(result).toEqual({
      completedSurahNumber: 67,
      completedSurahNameAr: 'الملك',
      nextSurahNameAr: 'التحريم',
      isQuranComplete: false,
    });
    // Not at the track end, so the (expensive) delivered-count is never read.
    expect(h.count).not.toHaveBeenCalled();
  });

  it('flags the whole Quran complete on the final entry once a full pass is delivered', async () => {
    // Final entry wraps to position 0 — the track restarts at its first surah.
    h.findUnique.mockResolvedValue({ ayah: { surah: { number: 114, nameAr: 'الناس' } } });
    h.count.mockResolvedValue(TOTAL); // a full track's worth of ayat delivered
    const result = await surahCompletionFor(
      lastAyahEntry({ position: TOTAL - 1 }),
      TOTAL,
      true,
      SUB,
    );
    expect(result?.isQuranComplete).toBe(true);
    expect(result?.nextSurahNameAr).toBe('الناس');
  });

  it('does NOT flag a whole-Quran khatma for someone who started near the track end', async () => {
    // Reaching the last position is not enough: a subscriber who picked a late
    // starting surah has only a few deliveries, so it is an ordinary surah
    // completion, not a false khatma.
    h.findUnique.mockResolvedValue({ ayah: { surah: { number: 114, nameAr: 'الناس' } } });
    h.count.mockResolvedValue(7);
    const result = await surahCompletionFor(
      lastAyahEntry({ position: TOTAL - 1 }),
      TOTAL,
      true,
      SUB,
    );
    expect(result?.isQuranComplete).toBe(false);
    expect(result?.nextSurahNameAr).toBe('الناس'); // still continues
  });

  it('has no next surah when a non-looping track ends', async () => {
    h.count.mockResolvedValue(TOTAL);
    const result = await surahCompletionFor(
      lastAyahEntry({ position: TOTAL - 1 }),
      TOTAL,
      false,
      SUB,
    );
    expect(result?.isQuranComplete).toBe(true);
    expect(result?.nextSurahNameAr).toBe('');
    expect(h.findUnique).not.toHaveBeenCalled(); // advancePosition returned null
  });
});
