import { describe, it, expect } from 'vitest';
import { parseTime, isValidTimezone, parseSurahArg, parseAyahPreview } from './parse';

describe('parseTime', () => {
  it('parses a normal 24-hour time', () => {
    expect(parseTime('07:00')).toEqual({ hour: 7, minute: 0 });
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('accepts a single-digit hour', () => {
    expect(parseTime('7:05')).toEqual({ hour: 7, minute: 5 });
  });

  it('accepts Arabic-Indic digits (what the Arabic keyboard types)', () => {
    expect(parseTime('٠٧:٠٠')).toEqual({ hour: 7, minute: 0 });
    expect(parseTime('٢٣:٥٩')).toEqual({ hour: 23, minute: 59 });
  });

  it('rejects out-of-range and malformed input', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('07:60')).toBeNull();
    expect(parseTime('7')).toBeNull();
    expect(parseTime('07-00')).toBeNull();
    expect(parseTime('abc')).toBeNull();
  });
});

describe('parseSurahArg', () => {
  // Tiny oracle standing in for the real ayah-counts table.
  const counts: Record<number, number> = { 1: 7, 2: 286, 67: 30, 114: 6 };
  const ayahCountFor = (s: number) => counts[s] ?? 10;

  it('takes a surah on its own and defaults the ayah to 1', () => {
    expect(parseSurahArg('67', ayahCountFor)).toEqual({ surah: 67, ayah: 1 });
    expect(parseSurahArg('  114 ', ayahCountFor)).toEqual({ surah: 114, ayah: 1 });
  });

  it('takes a surah and an ayah, separated by any whitespace', () => {
    expect(parseSurahArg('67 5', ayahCountFor)).toEqual({ surah: 67, ayah: 5 });
    expect(parseSurahArg('2\t286', ayahCountFor)).toEqual({ surah: 2, ayah: 286 });
  });

  it('accepts Arabic-Indic digits', () => {
    expect(parseSurahArg('٦٧ ٥', ayahCountFor)).toEqual({ surah: 67, ayah: 5 });
  });

  it('rejects an out-of-range surah', () => {
    expect(parseSurahArg('0', ayahCountFor)).toBeNull();
    expect(parseSurahArg('115', ayahCountFor)).toBeNull();
  });

  it('rejects an ayah beyond the surah length', () => {
    expect(parseSurahArg('114 7', ayahCountFor)).toBeNull(); // An-Nas has 6
    expect(parseSurahArg('1 0', ayahCountFor)).toBeNull();
  });

  it('rejects junk and extra parts', () => {
    expect(parseSurahArg('abc', ayahCountFor)).toBeNull();
    expect(parseSurahArg('', ayahCountFor)).toBeNull();
    expect(parseSurahArg('67 5 9', ayahCountFor)).toBeNull();
  });
});

describe('parseAyahPreview', () => {
  const counts: Record<number, number> = { 1: 7, 2: 286, 67: 30, 114: 6 };
  const ayahCountFor = (s: number) => counts[s] ?? 10;

  it('takes a surah on its own (ayah 1, no review)', () => {
    expect(parseAyahPreview('2', ayahCountFor)).toEqual({ surah: 2, ayah: 1, review: null });
  });

  it('takes a surah and ayah, no review', () => {
    expect(parseAyahPreview('2 255', ayahCountFor)).toEqual({ surah: 2, ayah: 255, review: null });
  });

  it('takes a surah, ayah, and review window', () => {
    expect(parseAyahPreview('2 255 3', ayahCountFor)).toEqual({ surah: 2, ayah: 255, review: 3 });
    expect(parseAyahPreview('2 255 0', ayahCountFor)).toEqual({ surah: 2, ayah: 255, review: 0 });
  });

  it('accepts Arabic-Indic digits throughout', () => {
    expect(parseAyahPreview('٢ ٢٥٥ ٣', ayahCountFor)).toEqual({ surah: 2, ayah: 255, review: 3 });
  });

  it('rejects a bad surah/ayah the same way /surah does', () => {
    expect(parseAyahPreview('115', ayahCountFor)).toBeNull();
    expect(parseAyahPreview('114 7', ayahCountFor)).toBeNull(); // An-Nas has 6
  });

  it('rejects a review beyond the max, junk, or too many parts', () => {
    expect(parseAyahPreview('2 255 21', ayahCountFor)).toBeNull(); // MAX_REVIEW_COUNT is 20
    expect(parseAyahPreview('2 255 x', ayahCountFor)).toBeNull();
    expect(parseAyahPreview('2 255 3 9', ayahCountFor)).toBeNull();
    expect(parseAyahPreview('', ayahCountFor)).toBeNull();
  });
});

describe('isValidTimezone', () => {
  it('accepts real IANA names', () => {
    expect(isValidTimezone('Africa/Cairo')).toBe(true);
    expect(isValidTimezone('Europe/London')).toBe(true);
  });

  it('rejects nonsense', () => {
    expect(isValidTimezone('Africa/Carro')).toBe(false);
    expect(isValidTimezone('not-a-zone')).toBe(false);
  });
});
