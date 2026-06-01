import { describe, it, expect } from 'vitest';
import {
  surahUsesBasmala,
  showsOpeningBasmala,
  stripArabicMarks,
  removeBasmalaPrefix,
} from './basmala';

// The Uthmani basmala, used as the prefix to strip from a merged ayah 1.
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

describe('surahUsesBasmala', () => {
  it('is false for Al-Fatihah (1) and At-Tawbah (9)', () => {
    expect(surahUsesBasmala(1)).toBe(false);
    expect(surahUsesBasmala(9)).toBe(false);
  });

  it('is true for every other surah', () => {
    expect(surahUsesBasmala(2)).toBe(true);
    expect(surahUsesBasmala(112)).toBe(true);
    expect(surahUsesBasmala(114)).toBe(true);
  });
});

describe('showsOpeningBasmala', () => {
  it('shows it whenever ayah 1 is in the passage, today or via review', () => {
    // Today is ayah 1.
    expect(showsOpeningBasmala(55, 1)).toBe(true);
    // Today is mid-surah but the review reaches back to ayah 1.
    expect(showsOpeningBasmala(2, 1)).toBe(true);
  });

  it('hides it when the passage starts past ayah 1', () => {
    expect(showsOpeningBasmala(55, 2)).toBe(false);
    expect(showsOpeningBasmala(2, 10)).toBe(false);
  });

  it('never shows it for At-Tawbah (9), even on ayah 1', () => {
    expect(showsOpeningBasmala(9, 1)).toBe(false);
  });

  it('never shows it for Al-Fatihah (1), whose ayah 1 is the basmala itself', () => {
    expect(showsOpeningBasmala(1, 1)).toBe(false);
  });
});

describe('stripArabicMarks', () => {
  it('removes harakat but keeps the letters', () => {
    // ba + kasra + seen + sukun + meem + kasra -> bare "بسم"
    expect(stripArabicMarks('بِسْمِ')).toBe('بسم');
  });
});

describe('removeBasmalaPrefix', () => {
  it('removes a basmala merged into ayah 1', () => {
    expect(removeBasmalaPrefix(`${BASMALA} قُلْ هُوَ`, BASMALA)).toBe('قُلْ هُوَ');
  });

  it('removes it even when the basmala carries an extra mark', () => {
    // Inject a shadda (U+0651) after the first letter, like At-Tin/Al-Qadr do.
    const variant = BASMALA.slice(0, 1) + 'ّ' + BASMALA.slice(1);
    expect(removeBasmalaPrefix(`${variant} وَٱلتِّينِ`, BASMALA)).toBe('وَٱلتِّينِ');
  });

  it('leaves an already-clean ayah unchanged', () => {
    expect(removeBasmalaPrefix('قُلْ هُوَ ٱللَّهُ أَحَدٌ', BASMALA)).toBe(
      'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
    );
  });
});
