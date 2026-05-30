import { describe, it, expect } from 'vitest';
import { parseTime, isValidTimezone } from './parse';

describe('parseTime', () => {
  it('parses a normal 24-hour time', () => {
    expect(parseTime('07:00')).toEqual({ hour: 7, minute: 0 });
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('accepts a single-digit hour', () => {
    expect(parseTime('7:05')).toEqual({ hour: 7, minute: 5 });
  });

  it('rejects out-of-range and malformed input', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('07:60')).toBeNull();
    expect(parseTime('7')).toBeNull();
    expect(parseTime('07-00')).toBeNull();
    expect(parseTime('abc')).toBeNull();
  });
});

describe('isValidTimezone', () => {
  it('accepts real IANA names', () => {
    expect(isValidTimezone('Africa/Cairo')).toBe(true);
    expect(isValidTimezone('Europe/London')).toBe(true);
  });

  it('rejects nonsense', () => {
    expect(isValidTimezone('Africa/Carro')).toBe(false);
    expect(isValidTimezone('not-a-zone')).toBe(false);
  });
});
