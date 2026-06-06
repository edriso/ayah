import { describe, it, expect } from 'vitest';
import { formatTafseerMessages } from './tafseer';
import { SAFE_LIMIT } from './format';

const SURAH = { number: 112, nameAr: 'الإخلاص' };

describe('formatTafseerMessages', () => {
  it('returns a single message for a normal-length tafseer', () => {
    const msgs = formatTafseerMessages({
      surah: SURAH,
      numberInSurah: 1,
      text: 'الثناء على الله بصفاته التي كلُّها أوصاف كمال.',
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('التفسير الميسر');
    expect(msgs[0]).toContain('الثناء على الله');
  });

  it('names the ayah number with the ornamented marker in the header', () => {
    const [msg] = formatTafseerMessages({ surah: SURAH, numberInSurah: 5, text: 'تفسير قصير.' });
    // Arabic-Indic 5 inside the ﴿﴾ brackets.
    expect(msg).toContain('﴿٥﴾');
    expect(msg.startsWith('📖 تفسير الآية ﴿٥﴾ — التفسير الميسر')).toBe(true);
  });

  it('puts the tafseer text below the header, separated by a blank line', () => {
    const [msg] = formatTafseerMessages({ surah: SURAH, numberInSurah: 2, text: 'المعنى هنا.' });
    expect(msg).toBe('📖 تفسير الآية ﴿٢﴾ — التفسير الميسر\n\nالمعنى هنا.');
  });

  it('trims surrounding whitespace from the tafseer text', () => {
    const [msg] = formatTafseerMessages({ surah: SURAH, numberInSurah: 1, text: '  نص  ' });
    expect(msg.endsWith('نص')).toBe(true);
  });

  it('splits an over-long tafseer across messages, each within the limit', () => {
    // Build a tafseer well beyond a single message out of whole words.
    const text = Array.from({ length: 2000 }, (_, i) => `كلمة${i}`).join(' ');
    const msgs = formatTafseerMessages({ surah: SURAH, numberInSurah: 1, text });
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(SAFE_LIMIT);
    // First message keeps the full header; later ones carry the continuation.
    expect(msgs[0]).toContain('التفسير الميسر');
    expect(msgs[1]).toContain('تتمة التفسير');
  });

  it('reassembles to the original words when split (no text lost)', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `كلمة${i}`);
    const msgs = formatTafseerMessages({ surah: SURAH, numberInSurah: 1, text: words.join(' ') });
    const bodies = msgs.map((m) => m.split('\n\n').slice(1).join('\n\n'));
    expect(bodies.join(' ').split(/\s+/)).toEqual(words);
  });
});
