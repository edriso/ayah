import { describe, it, expect } from 'vitest';
import {
  formatDailyMessages,
  ayahMarker,
  formatAyahLine,
  reviewCountPhrase,
  TELEGRAM_MAX,
} from './format';
import { toArabicDigits } from './arabic';

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

describe('reviewCountPhrase (Arabic number-noun agreement)', () => {
  it('uses singular for 1, dual for 2, plural for 3-10, singular for 11+', () => {
    expect(reviewCountPhrase(1)).toBe('آخر آية');
    expect(reviewCountPhrase(2)).toBe('آخر آيتين');
    expect(reviewCountPhrase(3)).toBe('آخر ٣ آيات');
    expect(reviewCountPhrase(10)).toBe('آخر ١٠ آيات');
    expect(reviewCountPhrase(11)).toBe('آخر ١١ آية');
    expect(reviewCountPhrase(20)).toBe('آخر ٢٠ آية');
  });
});

describe('formatDailyMessages', () => {
  const today = { numberInSurah: 4, text: 'آية ٤' };
  const review = [
    { numberInSurah: 1, text: 'آية ١' },
    { numberInSurah: 2, text: 'آية ٢' },
    { numberInSurah: 3, text: 'آية ٣' },
  ];

  it('returns one message with today and the review when it fits', () => {
    const msgs = formatDailyMessages({ surah, today, review });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('آية اليوم');
    expect(msgs[0]).toContain('سورة الإخلاص');
    expect(msgs[0]).toContain('للمراجعة');
    expect(msgs[0]).toContain('﴿٤﴾'); // today
    expect(msgs[0]).toContain('آخر ٣ آيات'); // 3 previous ayat
  });

  it('returns just today when there is no review', () => {
    const msgs = formatDailyMessages({ surah, today, review: [] });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('آية اليوم');
    expect(msgs[0]).not.toContain('للمراجعة');
  });

  it('shows the basmala only when one is passed in', () => {
    const basmala = 'بِسْمِ ٱللَّهِ';
    expect(formatDailyMessages({ surah, today, review })[0]).not.toContain(basmala);
    expect(formatDailyMessages({ surah, today, review, basmala })[0]).toContain(basmala);
  });

  it('splits into several messages when the review is too long', () => {
    // 20 long review ayat that cannot fit in one Telegram message.
    const long = Array.from({ length: 20 }, (_, i) => ({
      numberInSurah: i + 1,
      text: 'آية طويلة '.repeat(40).trim(),
    }));
    const todayLong = { numberInSurah: 21, text: 'آية اليوم الطويلة' };
    const msgs = formatDailyMessages({ surah, today: todayLong, review: long });

    expect(msgs.length).toBeGreaterThan(1);
    // every message stays within Telegram's limit
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(TELEGRAM_MAX);
    // today's ayah is the first message on a split day
    expect(msgs[0]).toContain('آية اليوم');
    // continued review messages are marked
    expect(msgs.slice(1).some((m) => m.includes('تابع'))).toBe(true);
    // no review ayah is dropped: 20 markers across all messages
    const allText = msgs.join('\n');
    for (let i = 1; i <= 20; i++) expect(allText).toContain(ayahMarker(i));
  });
});
