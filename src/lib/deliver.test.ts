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
  surahCompletionFor: vi.fn(),
  // Used by the scheduler path (deliverDueSubscribers).
  listDeliverableSubscribers: vi.fn(),
  hasDeliveryFor: vi.fn(),
  commitDelivery: vi.fn(),
  markBlocked: vi.fn(),
  sendMessages: vi.fn(),
}));

vi.mock('../database', () => ({
  getDeliveryFor: h.getDeliveryFor,
  getEntryById: h.getEntryById,
  resolveTargetEntry: h.resolveTargetEntry,
  buildDailyContent: h.buildDailyContent,
  countTrackEntries: h.countTrackEntries,
  getTrackById: h.getTrackById,
  surahCompletionFor: h.surahCompletionFor,
  listDeliverableSubscribers: h.listDeliverableSubscribers,
  hasDeliveryFor: h.hasDeliveryFor,
  commitDelivery: h.commitDelivery,
  markBlocked: h.markBlocked,
  getTrackByKey: vi.fn(),
  getEntryForAyah: vi.fn(),
  KIDS_TRACK: { key: 'kids-hifz' },
}));
vi.mock('./send', () => ({ sendMessages: h.sendMessages }));
vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildTodayView, buildCompletionMessage, deliverDueSubscribers } from './deliver';

// 2026-06-01 (UTC) is a Monday, ISO weekday 1.
const NOW = new Date('2026-06-01T12:00:00Z');
const CONTENT = {
  surah: { number: 112, nameAr: 'الإخلاص' },
  today: { numberInSurah: 1, text: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ' },
  review: [],
};
// A resolved entry (shape only matters by reference for the claim). The ayah
// carries a tafseer so the tafseer message can be built from the entry.
const ENTRY = {
  id: 7,
  position: 3,
  trackId: 1,
  ayah: {
    numberInSurah: 1,
    text: 'قُلْ',
    tafseer: 'إخلاص العبادة لله وحده.',
    surah: { number: 112, nameAr: 'الإخلاص' },
  },
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
    tafseerEnabled: true,
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

  it('reposition shows the current entry and claims when today is still free', async () => {
    const view = await buildTodayView(todaySub(), NOW, { reposition: true });
    expect(view.messages.length).toBeGreaterThan(0);
    expect(view.claim).toEqual({
      scheduledFor: '2026-06-01',
      entry: ENTRY,
      totalEntries: 6236,
      loops: true,
    });
    expect(h.resolveTargetEntry).toHaveBeenCalled();
  });

  it('reposition on an already-delivered day shows the new entry (preview), no claim', async () => {
    h.getDeliveryFor.mockResolvedValue({ trackEntryId: 7 });
    const view = await buildTodayView(todaySub(), NOW, { reposition: true });
    expect(view.claim).toBeNull();
    expect(view.messages.length).toBeGreaterThan(0);
    // Shows the just-set position, not the earlier delivered re-show.
    expect(h.resolveTargetEntry).toHaveBeenCalled();
    expect(h.getEntryById).not.toHaveBeenCalled();
  });
});

describe('buildTodayView tafseer (silent companion)', () => {
  it('includes the tafseer when enabled and the ayah has one', async () => {
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.tafseer.length).toBeGreaterThan(0);
    expect(view.tafseer[0]).toContain('التفسير الميسر');
    expect(view.tafseer[0]).toContain('إخلاص العبادة');
  });

  it('omits the tafseer when the subscriber turned it off', async () => {
    const view = await buildTodayView(todaySub({ tafseerEnabled: false }), NOW);
    expect(view.tafseer).toEqual([]);
    expect(view.messages.length).toBeGreaterThan(0); // the ayah is unaffected
  });

  it('omits the tafseer when the ayah has none seeded', async () => {
    h.resolveTargetEntry.mockResolvedValue({ ...ENTRY, ayah: { ...ENTRY.ayah, tafseer: null } });
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.tafseer).toEqual([]);
  });

  it('re-shows the tafseer alongside an already-delivered ayah', async () => {
    h.getDeliveryFor.mockResolvedValue({ trackEntryId: 7 });
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.alreadyDelivered).toBe(true);
    expect(view.tafseer.length).toBeGreaterThan(0);
  });
});

describe('deliverDueSubscribers (scheduler sends tafseer silently)', () => {
  // A minimal bot whose only job here is to record sendMessage calls.
  const bot = { api: { sendMessage: vi.fn() } } as never;
  const api = (bot as { api: { sendMessage: ReturnType<typeof vi.fn> } }).api;

  function deliverableSub(over: Record<string, unknown> = {}) {
    return {
      id: 1,
      telegramId: 123n,
      timezone: 'UTC',
      deliveryHour: 6, // before NOW (12:00Z) so the ayah is due
      deliveryMinute: 0,
      activeDays: 127,
      reviewCount: 0,
      tafseerEnabled: true,
      trackId: 1,
      startedAt: null,
      currentEntryId: 50,
      track: { loops: true },
      ...over,
    };
  }

  beforeEach(() => {
    api.sendMessage.mockReset();
    h.listDeliverableSubscribers.mockResolvedValue([deliverableSub()]);
    h.hasDeliveryFor.mockResolvedValue(false);
    h.commitDelivery.mockResolvedValue('sent');
    h.sendMessages.mockResolvedValue('ok');
    // No surah completion, so no milestone message muddies the assertions.
    h.surahCompletionFor.mockResolvedValue(null);
  });

  it('sends the tafseer with disable_notification after a delivered ayah', async () => {
    const stats = await deliverDueSubscribers(bot, NOW);
    expect(stats.sent).toBe(1);
    const tafseerCall = api.sendMessage.mock.calls.find((c) =>
      String(c[1]).includes('التفسير الميسر'),
    );
    expect(tafseerCall).toBeTruthy();
    expect(tafseerCall![2]).toMatchObject({ disable_notification: true });
  });

  it('does not send any tafseer when the subscriber turned it off', async () => {
    h.listDeliverableSubscribers.mockResolvedValue([deliverableSub({ tafseerEnabled: false })]);
    const stats = await deliverDueSubscribers(bot, NOW);
    expect(stats.sent).toBe(1); // the ayah still goes out
    const tafseerCall = api.sendMessage.mock.calls.find((c) =>
      String(c[1]).includes('التفسير الميسر'),
    );
    expect(tafseerCall).toBeUndefined();
  });

  it('does not let a tafseer send failure block the delivery commit', async () => {
    api.sendMessage.mockRejectedValue(new Error('boom'));
    const stats = await deliverDueSubscribers(bot, NOW);
    // The ayah (via sendMessages) succeeded, so the delivery is still committed.
    expect(h.commitDelivery).toHaveBeenCalledTimes(1);
    expect(stats.sent).toBe(1);
  });
});

describe('buildCompletionMessage', () => {
  it('returns null when the ayah did not finish a surah', async () => {
    h.surahCompletionFor.mockResolvedValue(null);
    expect(await buildCompletionMessage(ENTRY as never, 6236, true, 1)).toBeNull();
  });

  it('builds the surah milestone naming the completed and next surah', async () => {
    h.surahCompletionFor.mockResolvedValue({
      completedSurahNumber: 67,
      completedSurahNameAr: 'الملك',
      nextSurahNameAr: 'التحريم',
      isQuranComplete: false,
    });
    const msg = await buildCompletionMessage(ENTRY as never, 6236, true, 1);
    expect(msg).not.toBeNull();
    expect(msg!.text).toContain('أتممت سورة الملك');
    expect(msg!.text).toContain('التحريم');
    expect(msg!.keyboard).toBeDefined();
  });

  it('uses the whole-Quran wording on the final entry', async () => {
    h.surahCompletionFor.mockResolvedValue({
      completedSurahNumber: 1,
      completedSurahNameAr: 'الفاتحة',
      nextSurahNameAr: 'الناس',
      isQuranComplete: true,
    });
    const msg = await buildCompletionMessage(ENTRY as never, 6236, true, 1);
    expect(msg!.text).toContain('أتممت القرآن كاملًا');
    expect(msg!.text).toContain('الناس'); // a looping track restarts here
  });
});
