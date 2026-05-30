import { describe, it, expect } from 'vitest';
import { reviewRange, advancePosition, REVIEW_WINDOW } from './review';

describe('reviewRange', () => {
  it('returns a full window in the middle of a surah', () => {
    expect(reviewRange(25)).toEqual({ from: 16, to: 25 });
  });

  it('clamps the start so a short surah does not go below ayah 1', () => {
    expect(reviewRange(5)).toEqual({ from: 1, to: 5 });
  });

  it('returns just the one ayah for ayah 1 (no bleed into the previous surah)', () => {
    expect(reviewRange(1)).toEqual({ from: 1, to: 1 });
  });

  it('uses a window of exactly 10 by default', () => {
    expect(REVIEW_WINDOW).toBe(10);
    const { from, to } = reviewRange(100);
    expect(to - from + 1).toBe(10);
  });

  it('honours a custom window size', () => {
    expect(reviewRange(100, 3)).toEqual({ from: 98, to: 100 });
  });

  it('rejects bad input', () => {
    expect(() => reviewRange(0)).toThrow();
    expect(() => reviewRange(5, 0)).toThrow();
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
