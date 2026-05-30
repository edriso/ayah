import { describe, it, expect } from 'vitest';
import { formatDailyMessage, ayahMarker, formatAyahLine } from './format';
import { toArabicDigits } from './arabic';
import { surahUsesBasmala } from './basmala';

const surah = { number: 112, nameAr: 'الإخلاص' };

describe('arabic helpers', () => {
  it('converts numbers to Arabic-Indic digits', () => {
    expect(toArabicDigits(0)).toBe('٠');
    expect(toArabicDigits(25)).toBe('٢٥');
    expect(toArabicDigits(114)).toBe('١١٤');
  });

  it('wraps an ayah number in the ornamented marker', () => {
    expect(ayahMarker(3)).toBe('﴿٣﴾');
  });

  it('builds an ayah line as text then marker', () => {
    expect(formatAyahLine({ numberInSurah: 1, text: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ' })).toBe(
      'قُلْ هُوَ ٱللَّهُ أَحَدٌ ﴿١﴾',
    );
  });
});

describe('formatDailyMessage', () => {
  const review = [
    { numberInSurah: 1, text: 'آية ١' },
    { numberInSurah: 2, text: 'آية ٢' },
    { numberInSurah: 3, text: 'آية ٣' },
  ];

  it('shows the surah name, today block, and review block', () => {
    const msg = formatDailyMessage({ surah, today: review[2], review });
    expect(msg).toContain('آية اليوم');
    expect(msg).toContain('سورة الإخلاص');
    expect(msg).toContain('للمراجعة');
    // Today's ayah marker appears.
    expect(msg).toContain('﴿٣﴾');
    // The review count is the window length in Arabic digits.
    expect(msg).toContain('آخر ٣ آيات');
  });

  it('omits the review block when it would only repeat today (ayah 1)', () => {
    const single = [{ numberInSurah: 1, text: 'آية ١' }];
    const msg = formatDailyMessage({ surah, today: single[0], review: single });
    expect(msg).toContain('آية اليوم');
    expect(msg).not.toContain('للمراجعة');
  });

  it('shows the basmala header only when one is passed in', () => {
    const basmalaText = 'بِسْمِ ٱللَّهِ';
    const without = formatDailyMessage({ surah, today: review[2], review });
    expect(without).not.toContain(basmalaText);

    const withBasmala = formatDailyMessage({
      surah,
      today: review[2],
      review,
      basmala: basmalaText,
    });
    expect(withBasmala).toContain(basmalaText);
  });
});

describe('surahUsesBasmala', () => {
  it('is false for Al-Fatihah (basmala is ayah 1) and At-Tawbah (none)', () => {
    expect(surahUsesBasmala(1)).toBe(false);
    expect(surahUsesBasmala(9)).toBe(false);
  });

  it('is true for every other surah', () => {
    expect(surahUsesBasmala(2)).toBe(true);
    expect(surahUsesBasmala(112)).toBe(true);
    expect(surahUsesBasmala(114)).toBe(true);
  });
});
