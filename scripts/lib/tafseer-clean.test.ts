import { describe, it, expect } from 'vitest';
import { htmlToText, previewOpening, fillSurah } from './tafseer-clean';

describe('htmlToText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(htmlToText('<p>الحمد   لله</p>\n<div>رب العالمين</div>')).toBe('الحمد لله رب العالمين');
  });

  it('drops footnote <sup> markers entirely (content and all)', () => {
    expect(htmlToText('قوله تعالى<sup foot_note="123">1</sup> كذا')).toBe('قوله تعالى كذا');
  });

  it('turns <br> into a space', () => {
    expect(htmlToText('سطر<br>سطر')).toBe('سطر سطر');
  });

  it('decodes the HTML entities that appear in the source', () => {
    expect(htmlToText('&quot;نص&quot; &amp; &lt;شيء&gt; &#39;كذا&#39;')).toBe('"نص" & <شيء> ’كذا’');
  });

  it('keeps the { } braces that mark a quoted Quran fragment', () => {
    const out = htmlToText('<span class="arabic">{ بِسْمِ اللَّهِ }</span> أي: أبتدئ');
    expect(out).toBe('{ بِسْمِ اللَّهِ } أي: أبتدئ');
  });

  it('leaves no leftover tags or entities', () => {
    const out = htmlToText('<i>x</i> &nbsp; <b>y</b><br/><sup>z</sup>');
    expect(out).not.toMatch(/<[a-z/]|&[a-z]+;|&#/i);
  });
});

describe('previewOpening', () => {
  it('returns the whole text unchanged when it is already short', () => {
    expect(previewOpening('نص قصير.', 700)).toBe('نص قصير.');
  });

  it('cuts at the last sentence end before the limit (keeps whole sentences)', () => {
    const text = 'الجملة الأولى. الجملة الثانية. ' + 'x'.repeat(50);
    const out = previewOpening(text, 32);
    expect(out.endsWith('.')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(32);
    expect(out).toContain('الجملة الأولى.');
  });

  it('falls back to the last space when there is no early sentence end', () => {
    const text = 'كلمةطويلة بلا نقاط ' + 'ز'.repeat(40);
    const out = previewOpening(text, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).not.toContain(' ز'); // not cut mid-word at the padding run
  });

  it('appends no ellipsis (the formatter adds the read-in-full link)', () => {
    expect(previewOpening('a. ' + 'b'.repeat(100), 10)).not.toContain('…');
  });
});

describe('fillSurah', () => {
  it('keeps every own entry and orders them 1..count', () => {
    const m = new Map([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    expect(fillSurah(m, 3, 'x')).toEqual(['a', 'b', 'c']);
  });

  it('forward-fills a gap from the most recent earlier entry (range commentary)', () => {
    // 2 and 4 are missing: they belong to the groups anchored at 1 and 3.
    const m = new Map([
      [1, 'g1'],
      [3, 'g3'],
      [5, 'g5'],
    ]);
    expect(fillSurah(m, 5, 'x')).toEqual(['g1', 'g1', 'g3', 'g3', 'g5']);
  });

  it('trims entries and treats whitespace-only as missing', () => {
    const m = new Map([
      [1, '  a  '],
      [2, '   '],
    ]);
    expect(fillSurah(m, 2, 'x')).toEqual(['a', 'a']);
  });

  it('throws when ayah 1 has no entry (cannot forward-fill the start)', () => {
    expect(() => fillSurah(new Map([[2, 'b']]), 3, 'edition surah 2')).toThrow(/ayah 1/);
  });
});
