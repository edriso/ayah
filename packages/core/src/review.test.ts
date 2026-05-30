import { describe, it, expect } from 'vitest';
import {
  reviewRange,
  advancePosition,
  clampReviewCount,
  DEFAULT_REVIEW_COUNT,
  MAX_REVIEW_COUNT,
} from './review';

describe('reviewRange (previous ayat, excludes today)', () => {
  it('returns the count ayat before today in the middle of a surah', () => {
    expect(reviewRange(25, 10)).toEqual({ from: 15, to: 24 });
  });

  it('clamps the start so it never crosses into the previous surah', () => {
    expect(reviewRange(6, 10)).toEqual({ from: 1, to: 5 });
  });

  it('returns null for ayah 1 (nothing earlier in the surah)', () => {
    expect(reviewRange(1, 10)).toBeNull();
  });

  it('returns null when the count is 0 (review turned off)', () => {
    expect(reviewRange(25, 0)).toBeNull();
  });

  it('defaults to 10 previous ayat', () => {
    expect(DEFAULT_REVIEW_COUNT).toBe(10);
    const r = reviewRange(100)!;
    expect(r.to - r.from + 1).toBe(10);
  });

  it('honours a custom count', () => {
    expect(reviewRange(100, 3)).toEqual({ from: 97, to: 99 });
  });

  it('clamps an over-large count down to the max', () => {
    // count 999 -> clamped to 20 -> the 20 ayat before today
    expect(reviewRange(100, 999)).toEqual({ from: 80, to: 99 });
  });

  it('rejects a bad ayah number', () => {
    expect(() => reviewRange(0, 10)).toThrow();
  });
});

describe('clampReviewCount', () => {
  it('keeps in-range values', () => {
    expect(clampReviewCount(0)).toBe(0);
    expect(clampReviewCount(10)).toBe(10);
    expect(clampReviewCount(20)).toBe(20);
  });

  it('clamps out-of-range and bad values', () => {
    expect(clampReviewCount(-5)).toBe(0);
    expect(clampReviewCount(999)).toBe(MAX_REVIEW_COUNT);
    expect(clampReviewCount(7.9)).toBe(7);
    expect(clampReviewCount(NaN)).toBe(DEFAULT_REVIEW_COUNT);
  });
});

describe('advancePosition', () => {
  it('starts a brand-new subscriber at position 0', () => {
    expect(advancePosition(null, 100, true)).toBe(0);
  });

  it('steps forward by one in the middle', () => {
    expect(advancePosition(10, 100, true)).toBe(11);
  });

  it('loops back to 0 at the end when the track loops', () => {
    expect(advancePosition(99, 100, true)).toBe(0);
  });

  it('returns null at the end when the track does not loop', () => {
    expect(advancePosition(99, 100, false)).toBeNull();
  });

  it('handles a single-entry track', () => {
    expect(advancePosition(null, 1, true)).toBe(0);
    expect(advancePosition(0, 1, true)).toBe(0);
    expect(advancePosition(0, 1, false)).toBeNull();
  });

  it('rejects a non-positive total', () => {
    expect(() => advancePosition(0, 0, true)).toThrow();
  });
});
