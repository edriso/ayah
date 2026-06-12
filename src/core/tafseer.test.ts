import { describe, it, expect } from 'vitest';
import { formatTafseerMessages, tafseerLink, isTafseerFormat } from './tafseer';
import { SAFE_LIMIT } from './format';

// The common shape for an inline edition shown as text (the default path).
function inlineText(numberInSurah: number, text: string) {
  return formatTafseerMessages({
    numberInSurah,
    editionLabel: 'التفسير الميسر',
    kind: 'inline',
    format: 'text',
    text,
  });
}

describe('formatTafseerMessages — inline edition, text format', () => {
  it('returns a single message for a normal-length tafseer', () => {
    const msgs = inlineText(1, 'الثناء على الله بصفاته التي كلُّها أوصاف كمال.');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toContain('التفسير الميسر');
    expect(msgs[0].text).toContain('الثناء على الله');
    expect(msgs[0].readMoreUrl).toBeUndefined(); // inline text needs no link
  });

  it('names the ayah number with the ornamented marker and the edition in the header', () => {
    const [msg] = inlineText(5, 'تفسير قصير.');
    expect(msg.text).toContain('﴿٥﴾'); // Arabic-Indic 5 inside the ﴿﴾ brackets
    expect(msg.text.startsWith('📖 تفسير الآية ﴿٥﴾ — التفسير الميسر')).toBe(true);
  });

  it('shows whichever edition label it is given', () => {
    const [msg] = formatTafseerMessages({
      numberInSurah: 1,
      editionLabel: 'تفسير السعدي',
      kind: 'inline',
      format: 'text',
      text: 'المعنى.',
    });
    expect(msg.text.startsWith('📖 تفسير الآية ﴿١﴾ — تفسير السعدي')).toBe(true);
  });

  it('puts the tafseer text below the header, separated by a blank line', () => {
    const [msg] = inlineText(2, 'المعنى هنا.');
    expect(msg.text).toBe('📖 تفسير الآية ﴿٢﴾ — التفسير الميسر\n\nالمعنى هنا.');
  });

  it('trims surrounding whitespace from the tafseer text', () => {
    const [msg] = inlineText(1, '  نص  ');
    expect(msg.text.endsWith('نص')).toBe(true);
  });

  it('returns nothing when there is no seeded text', () => {
    expect(inlineText(1, '   ')).toEqual([]);
    expect(
      formatTafseerMessages({
        numberInSurah: 1,
        editionLabel: 'التفسير الميسر',
        kind: 'inline',
        format: 'text',
        text: null,
      }),
    ).toEqual([]);
  });

  it('splits an over-long tafseer across messages, each within the limit', () => {
    const text = Array.from({ length: 2000 }, (_, i) => `كلمة${i}`).join(' ');
    const msgs = inlineText(1, text);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.text.length).toBeLessThanOrEqual(SAFE_LIMIT);
    expect(msgs[0].text).toContain('التفسير الميسر');
    expect(msgs[1].text).toContain('تتمة التفسير');
  });

  it('reassembles to the original words when split (no text lost)', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `كلمة${i}`);
    const msgs = inlineText(1, words.join(' '));
    const bodies = msgs.map((m) => m.text.split('\n\n').slice(1).join('\n\n'));
    expect(bodies.join(' ').split(/\s+/)).toEqual(words);
  });
});

describe('formatTafseerMessages — link format', () => {
  it('sends one short message with a read-more URL, ignoring any text', () => {
    const msgs = formatTafseerMessages({
      numberInSurah: 3,
      editionLabel: 'تفسير ابن كثير',
      kind: 'preview',
      format: 'link',
      text: 'this should be ignored in link mode',
      link: 'https://quran.com/112:3/tafsirs/ar-tafsir-ibn-kathir',
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toContain('📖 تفسير الآية ﴿٣﴾ — تفسير ابن كثير');
    expect(msgs[0].readMoreUrl).toBe('https://quran.com/112:3/tafsirs/ar-tafsir-ibn-kathir');
    // The raw URL is NOT baked into the text (it becomes a button).
    expect(msgs[0].text).not.toContain('https://');
    expect(msgs[0].text).not.toContain('this should be ignored');
  });

  it('returns nothing in link mode when no link is supplied', () => {
    const msgs = formatTafseerMessages({
      numberInSurah: 1,
      editionLabel: 'التفسير الميسر',
      kind: 'inline',
      format: 'link',
    });
    expect(msgs).toEqual([]);
  });
});

describe('formatTafseerMessages — preview edition, text format', () => {
  const link = 'https://quran.com/112:1/tafsirs/ar-tafsir-ibn-kathir';

  it('sends one message: the opening, plus a read-more URL for the rest', () => {
    const msgs = formatTafseerMessages({
      numberInSurah: 1,
      editionLabel: 'تفسير ابن كثير',
      kind: 'preview',
      format: 'text',
      text: 'بداية تفسير ابن كثير لهذه الآية.',
      link,
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toContain('تفسير ابن كثير');
    expect(msgs[0].text).toContain('بداية تفسير ابن كثير');
    expect(msgs[0].text).toContain('بداية التفسير'); // the "this is the beginning" note
    expect(msgs[0].text).not.toContain('https://'); // URL is a button, not in text
    expect(msgs[0].readMoreUrl).toBe(link);
  });

  it('sends just the opening (no note, no URL) when no link is supplied', () => {
    const msgs = formatTafseerMessages({
      numberInSurah: 1,
      editionLabel: 'تفسير ابن كثير',
      kind: 'preview',
      format: 'text',
      text: 'بداية التفسير هنا.',
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toContain('بداية التفسير هنا.');
    expect(msgs[0].readMoreUrl).toBeUndefined();
    expect(msgs[0].text).not.toContain('البقية'); // no "rest is on the site" note without a link
  });

  it('keeps the whole message within the limit even for a long stored opening', () => {
    const long = 'كلمة '.repeat(2000); // far longer than one message
    const [msg] = formatTafseerMessages({
      numberInSurah: 1,
      editionLabel: 'تفسير ابن كثير',
      kind: 'preview',
      format: 'text',
      text: long,
      link,
    });
    expect(msg.text.length).toBeLessThanOrEqual(SAFE_LIMIT);
    expect(msg.readMoreUrl).toBe(link); // the link still rides along as a button
  });
});

describe('tafseerLink', () => {
  it('builds a quranenc browse URL', () => {
    expect(tafseerLink('quranenc', 'arabic_mokhtasar', 2, 255)).toBe(
      'https://quranenc.com/ar/browse/arabic_mokhtasar/2/255',
    );
  });

  it('builds a quran.com tafsir URL', () => {
    expect(tafseerLink('quran.com', 'ar-tafseer-al-saddi', 2, 255)).toBe(
      'https://quran.com/2:255/tafsirs/ar-tafseer-al-saddi',
    );
  });
});

describe('isTafseerFormat', () => {
  it('accepts the two formats and rejects anything else', () => {
    expect(isTafseerFormat('text')).toBe(true);
    expect(isTafseerFormat('link')).toBe(true);
    expect(isTafseerFormat('audio')).toBe(false);
    expect(isTafseerFormat('')).toBe(false);
  });
});
