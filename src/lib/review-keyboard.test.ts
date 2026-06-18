import { describe, it, expect } from 'vitest';
import { buildReviewKeyboard, REVIEW_RECENT_PREFIX, REVIEW_OLD_PREFIX } from './review-keyboard';

function rows(kb: ReturnType<typeof buildReviewKeyboard>) {
  return kb.inline_keyboard;
}

describe('buildReviewKeyboard', () => {
  it('has two rows: recent picks (first) and تثبيت picks (second), each prefixed', () => {
    const kb = buildReviewKeyboard(10, 3);
    expect(rows(kb)).toHaveLength(2);
    for (const b of rows(kb)[0]) {
      expect('callback_data' in b && b.callback_data.startsWith(REVIEW_RECENT_PREFIX)).toBe(true);
    }
    for (const b of rows(kb)[1]) {
      expect('callback_data' in b && b.callback_data.startsWith(REVIEW_OLD_PREFIX)).toBe(true);
    }
  });

  it('marks the current value in each row with a check', () => {
    const kb = buildReviewKeyboard(10, 3);
    const recent = rows(kb)[0].find((b) => 'callback_data' in b && b.callback_data.endsWith(':10'));
    const old = rows(kb)[1].find((b) => 'callback_data' in b && b.callback_data.endsWith(':3'));
    expect(recent!.text).toContain('✓');
    expect(old!.text).toContain('✓');
    // A non-current option is unmarked.
    const other = rows(kb)[0].find((b) => 'callback_data' in b && b.callback_data.endsWith(':0'));
    expect(other!.text).not.toContain('✓');
  });

  it('keeps every callback_data within Telegram’s 64-byte limit', () => {
    for (const b of rows(buildReviewKeyboard(20, 10)).flat()) {
      if ('callback_data' in b) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
    }
  });
});
