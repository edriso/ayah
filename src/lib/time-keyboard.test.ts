import { describe, it, expect } from 'vitest';
import { buildTimeKeyboard, TIME_PICK_PREFIX } from './time-keyboard';

describe('time presets', () => {
  it('every button has callback data ayah:time:HHMM with a valid hour and minute', () => {
    const buttons = buildTimeKeyboard().inline_keyboard.flat();
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      const data = (btn as { callback_data?: string }).callback_data ?? '';
      expect(data.startsWith(TIME_PICK_PREFIX)).toBe(true);
      const hhmm = data.slice(TIME_PICK_PREFIX.length);
      expect(hhmm).toMatch(/^\d{4}$/);
      const hour = Number(hhmm.slice(0, 2));
      const minute = Number(hhmm.slice(2));
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);
      expect(minute).toBeGreaterThanOrEqual(0);
      expect(minute).toBeLessThanOrEqual(59);
    }
  });
});
