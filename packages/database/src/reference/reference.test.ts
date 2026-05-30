import { describe, it, expect } from 'vitest';
import { SURAHS } from './surahs';
import { AYAH_COUNTS, TOTAL_AYAT, ayahCountFor } from './ayah-counts';
import { buildKidsOrder } from './curriculum';

describe('surah reference table', () => {
  it('has all 114 surahs', () => {
    expect(SURAHS).toHaveLength(114);
  });

  it('numbers them 1..114 with no gaps or duplicates', () => {
    const numbers = SURAHS.map((s) => s.number);
    expect(numbers).toEqual(Array.from({ length: 114 }, (_, i) => i + 1));
  });

  it('gives every surah a name and a valid revelation place', () => {
    for (const s of SURAHS) {
      expect(s.nameAr.length).toBeGreaterThan(0);
      expect(s.nameEn.length).toBeGreaterThan(0);
      expect(['meccan', 'medinan']).toContain(s.revelation);
    }
  });
});

describe('ayah counts oracle', () => {
  it('covers surahs 1..114', () => {
    // Index 0 is the unused placeholder, so length is 115.
    expect(AYAH_COUNTS).toHaveLength(115);
  });

  it('sums to exactly 6236 ayat', () => {
    const sum = AYAH_COUNTS.reduce((a, b) => a + b, 0);
    expect(sum).toBe(TOTAL_AYAT);
    expect(sum).toBe(6236);
  });

  it('matches well-known anchor counts', () => {
    expect(ayahCountFor(1)).toBe(7); // Al-Fatihah
    expect(ayahCountFor(2)).toBe(286); // Al-Baqarah (longest)
    expect(ayahCountFor(9)).toBe(129); // At-Tawbah
    expect(ayahCountFor(108)).toBe(3); // Al-Kawthar (shortest)
    expect(ayahCountFor(112)).toBe(4); // Al-Ikhlas
    expect(ayahCountFor(114)).toBe(6); // An-Nas
  });
});

describe('kids curriculum order', () => {
  const order = buildKidsOrder(ayahCountFor);

  it('has one step per ayah in the whole Quran', () => {
    expect(order).toHaveLength(6236);
  });

  it('starts at An-Nas (114:1) and ends at Al-Fatihah (1:7)', () => {
    expect(order[0]).toEqual({ surahNumber: 114, numberInSurah: 1 });
    expect(order[order.length - 1]).toEqual({ surahNumber: 1, numberInSurah: 7 });
  });

  it('walks surahs from 114 down to 1, ayat ascending inside each', () => {
    // An-Nas has 6 ayat, so steps 0..5 are 114:1..114:6, then 113:1.
    expect(order[5]).toEqual({ surahNumber: 114, numberInSurah: 6 });
    expect(order[6]).toEqual({ surahNumber: 113, numberInSurah: 1 });
  });
});
