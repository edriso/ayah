import { describe, it, expect } from 'vitest';
import { toArabicDigits, toAsciiDigits } from './arabic';

describe('toArabicDigits', () => {
  it('converts to Arabic-Indic digits', () => {
    expect(toArabicDigits(0)).toBe('٠');
    expect(toArabicDigits(25)).toBe('٢٥');
    expect(toArabicDigits(114)).toBe('١١٤');
  });
});

describe('toAsciiDigits', () => {
  it('converts Arabic-Indic digits to ASCII', () => {
    expect(toAsciiDigits('٠٧:٠٠')).toBe('07:00');
    expect(toAsciiDigits('٢٣:٥٩')).toBe('23:59');
    expect(toAsciiDigits('٥')).toBe('5');
    expect(toAsciiDigits('٢٠')).toBe('20');
  });

  it('converts Persian digits to ASCII', () => {
    expect(toAsciiDigits('۰۷:۳۰')).toBe('07:30');
  });

  it('leaves ASCII and other characters untouched', () => {
    expect(toAsciiDigits('07:00')).toBe('07:00');
    expect(toAsciiDigits('abc')).toBe('abc');
    expect(toAsciiDigits('Africa/Cairo')).toBe('Africa/Cairo');
  });
});
