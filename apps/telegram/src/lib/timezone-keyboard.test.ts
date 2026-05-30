import { describe, it, expect } from 'vitest';
import { COMMON_TIMEZONES, buildTimezoneKeyboard, TZ_PICK_PREFIX } from './timezone-keyboard';

describe('common timezones', () => {
  it('every IANA name is a real zone (catches a typo in the city list)', () => {
    for (const tz of COMMON_TIMEZONES) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: tz.iana })).not.toThrow();
      expect(tz.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('builds one button per zone with callback data ayah:tz:<index>', () => {
    const buttons = buildTimezoneKeyboard().inline_keyboard.flat();
    expect(buttons).toHaveLength(COMMON_TIMEZONES.length);
    buttons.forEach((btn, i) => {
      expect((btn as { callback_data?: string }).callback_data).toBe(`${TZ_PICK_PREFIX}${i}`);
    });
  });
});
