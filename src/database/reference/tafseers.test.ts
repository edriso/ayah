import { describe, it, expect } from 'vitest';
import {
  TAFSEERS,
  DEFAULT_TAFSEER,
  tafseerByKey,
  tafseerOrDefault,
  isTafseerEdition,
} from './tafseers';

describe('tafseers reference data', () => {
  it('has unique, callback-safe keys and the fields each edition needs', () => {
    const keys = TAFSEERS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of TAFSEERS) {
      expect(t.key).toMatch(/^[a-z0-9-]+$/); // safe in callback data, fits VarChar(32)
      expect(t.key.length).toBeLessThanOrEqual(32);
      expect(t.nameAr.trim()).not.toBe('');
      expect(['inline', 'preview']).toContain(t.kind);
      expect(['alquran.cloud', 'quranenc', 'quran.foundation']).toContain(t.source.api);
      expect(t.source.ref.trim()).not.toBe('');
      expect(['quranenc', 'quran.com']).toContain(t.linkHost);
      expect(t.linkRef.trim()).not.toBe('');
    }
  });

  it('offers the four chosen editions, with exactly one long "preview" edition', () => {
    expect(TAFSEERS).toHaveLength(4);
    expect(TAFSEERS.filter((t) => t.kind === 'preview').map((t) => t.key)).toEqual(['ibnkathir']);
  });

  it('uses a real edition as the default (matches the schema default)', () => {
    expect(DEFAULT_TAFSEER).toBe('muyassar');
    expect(tafseerByKey(DEFAULT_TAFSEER)).toBeDefined();
    expect(TAFSEERS[0].key).toBe(DEFAULT_TAFSEER); // first in the picker
  });

  it('tafseerByKey resolves known keys and rejects unknown ones', () => {
    for (const t of TAFSEERS) expect(tafseerByKey(t.key)).toEqual(t);
    expect(tafseerByKey('nope')).toBeUndefined();
  });

  it('tafseerOrDefault falls back to the default for an unknown/dropped edition', () => {
    expect(tafseerOrDefault('saadi').key).toBe('saadi');
    expect(tafseerOrDefault('removed-someday').key).toBe(DEFAULT_TAFSEER);
  });

  it('isTafseerEdition accepts every edition and rejects anything else', () => {
    for (const t of TAFSEERS) expect(isTafseerEdition(t.key)).toBe(true);
    expect(isTafseerEdition('whatever')).toBe(false);
    expect(isTafseerEdition('')).toBe(false);
  });
});
