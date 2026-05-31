import { describe, it, expect } from 'vitest';
import { surahUsesBasmala, stripArabicMarks, removeBasmalaPrefix } from './basmala';

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
