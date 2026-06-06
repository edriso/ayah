import { describe, it, expect } from 'vitest';
import { formatDailyMessages, ayahMarker, formatAyahLine, TELEGRAM_MAX } from './format';
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

describe('formatDailyMessages', () => {
  const today = { numberInSurah: 4, text: 'آية ٤' };
  const review = [
    { numberInSurah: 1, text: 'آية ١' },
    { numberInSurah: 2, text: 'آية ٢' },
    { numberInSurah: 3, text: 'آية ٣' },
  ];

  it('returns one ascending passage ending with today, when it fits', () => {
    const msgs = formatDailyMessages({ surah, today, review });
    expect(msgs).toHaveLength(1);
    const m = msgs[0];
    // Title names today's new ayah up front (good notification preview).
    expect(m).toContain('🌿 آية اليوم — سورة الإخلاص، آية ٤');
    // Reading instruction is present when there are previous ayat.
    expect(m).toContain('راجع واحفظ بالترتيب حتى آية اليوم');
    // The passage reads ascending: ﴿١﴾ before ﴿٢﴾ before … before today ﴿٤﴾.
    const order = ['﴿١﴾', '﴿٢﴾', '﴿٣﴾', '﴿٤﴾'].map((mk) => m.indexOf(mk));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Today (last) carries the marker; an earlier ayah does not.
    expect(m).toContain('﴿٤﴾ 👉');
    expect(m).not.toContain('﴿٣﴾ 👉');
  });

  it('returns just today, unmarked and without the instruction, when no review', () => {
    const msgs = formatDailyMessages({ surah, today, review: [] });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('🌿 آية اليوم — سورة الإخلاص، آية ٤');
    expect(msgs[0]).not.toContain('راجع واحفظ بالترتيب');
    expect(msgs[0]).not.toContain('👉');
  });

  it('shows the basmala (passed in) as the first line, above ayah 1', () => {
    const basmala = 'بِسْمِ ٱللَّهِ';
    expect(formatDailyMessages({ surah, today, review })[0]).not.toContain(basmala);
    const m = formatDailyMessages({ surah, today, review, basmala })[0];
    expect(m).toContain(basmala);
    // The basmala sits above the first ayah, not below it.
    expect(m.indexOf(basmala)).toBeLessThan(m.indexOf('﴿١﴾'));
  });

  it('splits at ayah boundaries when too long, keeping every ayah intact', () => {
    // 20 long review ayat plus today: cannot fit in one Telegram message.
    const long = Array.from({ length: 20 }, (_, i) => ({
      numberInSurah: i + 1,
      text: 'آية طويلة '.repeat(40).trim(),
    }));
    const todayLong = { numberInSurah: 21, text: 'آية اليوم الطويلة' };
    const msgs = formatDailyMessages({ surah, today: todayLong, review: long });

    expect(msgs.length).toBeGreaterThan(1);
    // No message is ever cut off past Telegram's limit.
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(TELEGRAM_MAX);
    // The title (naming today) leads the first message, so the notification
    // preview still shows what is new even though today's text comes last.
    expect(msgs[0]).toContain('🌿 آية اليوم');
    // Continuation messages are marked.
    expect(msgs.slice(1).some((m) => m.includes('تابع'))).toBe(true);
    // Today's ayah lands in the LAST message, marked.
    expect(msgs[msgs.length - 1]).toContain('﴿٢١﴾ 👉');
    // No ayah is dropped: all 21 markers appear across the messages, each once.
    const allText = msgs.join('\n');
    for (let i = 1; i <= 21; i++) {
      expect(allText.split(ayahMarker(i)).length - 1).toBe(1);
    }
  });

  it('defensively hard-splits a single line longer than the limit', () => {
    // No real ayah is this long, but a line that alone exceeds the limit must
    // not produce a message Telegram would reject (which would fail the whole
    // delivery forever). The guard splits it so every message stays in bounds.
    const huge = 'كلمة '.repeat(2000).trim(); // ~10k chars, far over the limit
    const msgs = formatDailyMessages({
      surah,
      today: { numberInSurah: 1, text: huge },
      review: [],
    });
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(TELEGRAM_MAX);
    // Nothing is dropped: every word survives across the messages.
    const wordCount = msgs.join(' ').split('كلمة').length - 1;
    expect(wordCount).toBe(2000);
  });
});
