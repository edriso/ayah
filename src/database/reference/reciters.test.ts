import { describe, it, expect } from 'vitest';
import { RECITERS, DEFAULT_RECITER, RECITER_NONE, reciterByKey, isReciterChoice } from './reciters';

describe('reciters reference data', () => {
  it('has unique, non-empty keys and folders', () => {
    const keys = RECITERS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of RECITERS) {
      expect(r.key).toMatch(/^[a-z0-9-]+$/); // safe in callback data
      expect(r.nameAr.trim()).not.toBe('');
      expect(r.folder.trim()).not.toBe('');
      expect(r.folder).not.toMatch(/\s/); // a CDN folder name has no spaces
    }
  });

  it('offers exactly the seven chosen reciters', () => {
    expect(RECITERS).toHaveLength(7);
  });

  it('uses a real reciter as the default (matches the schema default)', () => {
    expect(DEFAULT_RECITER).toBe('husary-muallim');
    expect(reciterByKey(DEFAULT_RECITER)).toBeDefined();
  });

  it('keeps the "none" sentinel distinct from every reciter key', () => {
    expect(RECITERS.some((r) => r.key === RECITER_NONE)).toBe(false);
    expect(reciterByKey(RECITER_NONE)).toBeUndefined();
  });

  it('reciterByKey resolves known keys and rejects unknown ones', () => {
    for (const r of RECITERS) expect(reciterByKey(r.key)).toEqual(r);
    expect(reciterByKey('nope')).toBeUndefined();
  });

  it('isReciterChoice accepts every reciter and "none", rejects anything else', () => {
    for (const r of RECITERS) expect(isReciterChoice(r.key)).toBe(true);
    expect(isReciterChoice(RECITER_NONE)).toBe(true);
    expect(isReciterChoice('whoever')).toBe(false);
    expect(isReciterChoice('')).toBe(false);
  });
});
