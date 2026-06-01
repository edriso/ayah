import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub the database and send layers so the /today decision logic can be tested
// with no real database. The scheduling math (getLocalContext, isDayActive) and
// message formatting are the real implementations.
const h = vi.hoisted(() => ({
  getDeliveryFor: vi.fn(),
  getEntryById: vi.fn(),
  resolveTargetEntry: vi.fn(),
  buildDailyContent: vi.fn(),
  countTrackEntries: vi.fn(),
  getTrackById: vi.fn(),
}));

vi.mock('../database', () => ({
  getDeliveryFor: h.getDeliveryFor,
  getEntryById: h.getEntryById,
  resolveTargetEntry: h.resolveTargetEntry,
  buildDailyContent: h.buildDailyContent,
  countTrackEntries: h.countTrackEntries,
  getTrackById: h.getTrackById,
  // Imported by deliver.ts but unused by buildTodayView:
  listDeliverableSubscribers: vi.fn(),
  hasDeliveryFor: vi.fn(),
  commitDelivery: vi.fn(),
  markBlocked: vi.fn(),
  getTrackByKey: vi.fn(),
  getEntryForAyah: vi.fn(),
  KIDS_TRACK: { key: 'kids-hifz' },
}));
vi.mock('./send', () => ({ sendMessages: vi.fn() }));
vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildTodayView } from './deliver';

// 2026-06-01 (UTC) is a Monday, ISO weekday 1.
const NOW = new Date('2026-06-01T12:00:00Z');
const CONTENT = {
  surah: { number: 112, nameAr: 'الإخلاص' },
  today: { numberInSurah: 1, text: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ' },
  review: [],
};
// A resolved entry (shape only matters by reference for the claim).
const ENTRY = {
  id: 7,
  position: 3,
  trackId: 1,
  ayah: { numberInSurah: 1, text: 'قُلْ', surah: { number: 112, nameAr: 'الإخلاص' } },
};

function todaySub(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    timezone: 'UTC',
    activeDays: 127,
    pausedAt: null,
    trackId: 1,
    currentEntryId: 50, // already advanced past the delivered entry
    startedAt: null,
    reviewCount: 0,
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getDeliveryFor.mockResolvedValue(null);
  h.resolveTargetEntry.mockResolvedValue(ENTRY);
  h.buildDailyContent.mockResolvedValue(CONTENT);
  h.countTrackEntries.mockResolvedValue(6236);
  h.getTrackById.mockResolvedValue({ id: 1, loops: true });
  h.getEntryById.mockResolvedValue(ENTRY);
});

describe('buildTodayView (/today claims today)', () => {
  it('claims today on an active, unpaused, not-yet-delivered day', async () => {
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.alreadyDelivered).toBe(false);
    expect(view.messages.length).toBeGreaterThan(0);
    expect(view.claim).toEqual({
      scheduledFor: '2026-06-01',
      entry: ENTRY,
      totalEntries: 6236,
      loops: true,
    });
  });

  it('re-shows the DELIVERED entry (not the advanced pointer) and does NOT claim', async () => {
    h.getDeliveryFor.mockResolvedValue({ trackEntryId: 7 });
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.alreadyDelivered).toBe(true);
    expect(view.claim).toBeNull();
    expect(h.getEntryById).toHaveBeenCalledWith(7);
    // The re-show must NOT consult resolveTargetEntry (which points at the
    // already-advanced next ayah).
    expect(h.resolveTargetEntry).not.toHaveBeenCalled();
  });

  it('is a pure peek on an off day (no claim)', async () => {
    // activeDays = 2 is Tuesday only, so Monday (NOW) is off.
    const view = await buildTodayView(todaySub({ activeDays: 2 }), NOW);
    expect(view.messages.length).toBeGreaterThan(0);
    expect(view.claim).toBeNull();
    expect(view.alreadyDelivered).toBe(false);
  });

  it('is a pure peek while paused (no claim)', async () => {
    const view = await buildTodayView(todaySub({ pausedAt: new Date() }), NOW);
    expect(view.messages.length).toBeGreaterThan(0);
    expect(view.claim).toBeNull();
  });

  it('returns no messages (and no claim) on a finished non-looping track', async () => {
    h.resolveTargetEntry.mockResolvedValue(null);
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.messages).toEqual([]);
    expect(view.claim).toBeNull();
  });
});
