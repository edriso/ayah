import { describe, it, expect } from 'vitest';
import { ayahAudioUrl } from './audio';

const BASE = 'https://everyayah.com/data';

describe('ayahAudioUrl', () => {
  it('builds the zero-padded surah+ayah file URL', () => {
    expect(ayahAudioUrl(BASE, 'Husary_128kbps', 2, 27)).toBe(
      'https://everyayah.com/data/Husary_128kbps/002027.mp3',
    );
    expect(ayahAudioUrl(BASE, 'Alafasy_128kbps', 114, 6)).toBe(
      'https://everyayah.com/data/Alafasy_128kbps/114006.mp3',
    );
    expect(ayahAudioUrl(BASE, 'Husary_128kbps', 1, 1)).toBe(
      'https://everyayah.com/data/Husary_128kbps/001001.mp3',
    );
  });

  it('ignores a trailing slash on the base and stray slashes on the folder', () => {
    expect(ayahAudioUrl('https://x/data/', '/Husary_128kbps/', 1, 1)).toBe(
      'https://x/data/Husary_128kbps/001001.mp3',
    );
  });

  it('rejects an out-of-range surah or ayah', () => {
    expect(() => ayahAudioUrl(BASE, 'f', 0, 1)).toThrow();
    expect(() => ayahAudioUrl(BASE, 'f', 115, 1)).toThrow();
    expect(() => ayahAudioUrl(BASE, 'f', 1, 0)).toThrow();
  });

  it('rejects an empty base or folder', () => {
    expect(() => ayahAudioUrl('', 'f', 1, 1)).toThrow();
    expect(() => ayahAudioUrl(BASE, '', 1, 1)).toThrow();
  });
});
