import { describe, it, expect, beforeEach, vi } from 'vitest';

// Handler-level test for the reposition helper (the /surah, surah-pick, and
// onboarding auto-send). bot.ts builds a grammY Bot and wires every command at
// import, so we mock the modules that would touch the network, the database, or
// env at load time, then drive the exported helper directly.
const h = vi.hoisted(() => ({
  commitDelivery: vi.fn(),
  buildTodayView: vi.fn(),
}));

vi.mock('./config', () => ({
  config: { botToken: 'test-token', adminTelegramId: null, defaultTimezone: 'UTC' },
}));
vi.mock('./database', () => ({
  ensureSubscriber: vi.fn(),
  toggleActiveDay: vi.fn(),
  setDeliveryTime: vi.fn(),
  setTimezone: vi.fn(),
  setReviewCount: vi.fn(),
  pauseSubscriber: vi.fn(),
  resumeSubscriber: vi.fn(),
  setStartPosition: vi.fn(),
  setOrder: vi.fn(),
  commitDelivery: h.commitDelivery,
  getEntryForAyah: vi.fn(),
  getEntryAtPosition: vi.fn(),
  getProgressView: vi.fn(),
  getTrackByKey: vi.fn(),
  ORDERS: [],
  KIDS_TRACK: { key: 'kids-hifz' },
  MUSHAF_TRACK: { key: 'mushaf' },
  SURAHS: [],
  ayahCountFor: vi.fn(),
}));
vi.mock('./lib/deliver', () => ({ buildTodayView: h.buildTodayView, previewAyah: vi.fn() }));
vi.mock('./scheduler', () => ({ runDeliveryOnce: vi.fn() }));
vi.mock('./lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendAfterReposition } from './bot';

const ENTRY = {
  id: 7,
  trackId: 1,
  position: 3,
  ayah: { numberInSurah: 1, text: 'x', surah: { number: 114, nameAr: 'الناس' } },
} as never;

const SUB = {
  id: 1,
  startedAt: null,
  pausedAt: null,
  trackId: 1,
  currentEntryId: 50,
  reviewCount: 0,
  timezone: 'UTC',
  activeDays: 127,
} as never;

function fakeCtx() {
  return { reply: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.commitDelivery.mockResolvedValue('sent');
});

describe('sendAfterReposition', () => {
  it('builds the view for the NEW entry once and claims a free day', async () => {
    h.buildTodayView.mockResolvedValue({
      messages: ['the ayah'],
      claim: { scheduledFor: '2026-06-01', entry: ENTRY, totalEntries: 6236, loops: true },
      alreadyDelivered: false,
    });
    const ctx = fakeCtx();
    await sendAfterReposition(ctx as never, SUB, ENTRY);

    expect(h.buildTodayView).toHaveBeenCalledTimes(1);
    expect(h.buildTodayView).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: 1, currentEntryId: 7 }),
      expect.any(Date),
      { reposition: true },
    );
    expect(h.commitDelivery).toHaveBeenCalledTimes(1); // claimed
    expect(ctx.reply.mock.calls.length).toBeGreaterThanOrEqual(2); // confirmation + ayah
  });

  it('does NOT claim on a preview (no claim in the view)', async () => {
    h.buildTodayView.mockResolvedValue({
      messages: ['the ayah'],
      claim: null,
      alreadyDelivered: true,
    });
    const ctx = fakeCtx();
    await sendAfterReposition(ctx as never, SUB, ENTRY);

    expect(h.commitDelivery).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalled();
  });
});
