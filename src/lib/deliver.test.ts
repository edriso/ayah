import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub the database and send layers so the read-gated decision logic can be
// tested with no real database. The scheduling math (getLocalContext,
// isDayActive) and message formatting are the real implementations.
const h = vi.hoisted(() => ({
  getDeliveryFor: vi.fn(),
  getEntryById: vi.fn(),
  resolveTargetEntry: vi.fn(),
  buildDailyContent: vi.fn(),
  surahCompletionFor: vi.fn(),
  // Scheduler path.
  listDeliverableSubscribers: vi.fn(),
  hasDeliveryFor: vi.fn(),
  commitDelivery: vi.fn(),
  countUnreadDeliveriesBefore: vi.fn(),
  countConfirmedAyat: vi.fn(),
  getRevisionAyat: vi.fn(),
  getAyahText: vi.fn(),
  markBlocked: vi.fn(),
  sendMessages: vi.fn(),
  // Audio path.
  getCachedAyahAudioId: vi.fn(),
  cacheAyahAudioId: vi.fn(),
  sendAudio: vi.fn(),
  // Tafseer path.
  getTafseerText: vi.fn(),
}));

vi.mock('../database', () => ({
  getDeliveryFor: h.getDeliveryFor,
  getEntryById: h.getEntryById,
  resolveTargetEntry: h.resolveTargetEntry,
  buildDailyContent: h.buildDailyContent,
  surahCompletionFor: h.surahCompletionFor,
  listDeliverableSubscribers: h.listDeliverableSubscribers,
  hasDeliveryFor: h.hasDeliveryFor,
  commitDelivery: h.commitDelivery,
  countUnreadDeliveriesBefore: h.countUnreadDeliveriesBefore,
  countConfirmedAyat: h.countConfirmedAyat,
  getRevisionAyat: h.getRevisionAyat,
  getAyahText: h.getAyahText,
  markBlocked: h.markBlocked,
  getCachedAyahAudioId: h.getCachedAyahAudioId,
  cacheAyahAudioId: h.cacheAyahAudioId,
  reciterByKey: (key: string) =>
    key === 'none'
      ? undefined
      : { key, nameAr: 'الحصري (المعلِّم)', folder: 'Husary_Muallim_128kbps' },
  getTafseerText: h.getTafseerText,
  tafseerOrDefault: (key: string) =>
    key === 'ibnkathir'
      ? {
          key: 'ibnkathir',
          nameAr: 'تفسير ابن كثير',
          kind: 'preview',
          linkHost: 'quran.com',
          linkRef: 'ar-tafsir-ibn-kathir',
        }
      : {
          key: key || 'muyassar',
          nameAr: 'التفسير الميسر',
          kind: 'inline',
          linkHost: 'quranenc',
          linkRef: 'arabic_moyassar',
        },
  // A fixed encouragement reference; getAyahText (mocked) resolves its text.
  pickQuranVirtue: () => ({ surah: 54, ayah: 17 }),
  DEFAULT_TAFSEER: 'muyassar',
  getTrackByKey: vi.fn(),
  getEntryForAyah: vi.fn(),
  KIDS_TRACK: { key: 'kids-hifz' },
}));
vi.mock('./send', () => ({ sendMessages: h.sendMessages }));
vi.mock('./send-audio', () => ({ sendAudio: h.sendAudio }));
vi.mock('../config', () => ({ config: { audioBaseUrl: 'https://everyayah.com/data' } }));
vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  buildTodayView,
  buildCompletionMessage,
  deliverDueSubscribers,
  sampleEntryFor,
  revisionMessagesFor,
} from './deliver';
import { COPY } from './copy';

// 2026-06-01 (UTC) is a Monday, ISO weekday 1.
const NOW = new Date('2026-06-01T12:00:00Z');
const CONTENT = {
  surah: { number: 112, nameAr: 'الإخلاص' },
  today: { numberInSurah: 1, text: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ' },
  review: [],
};
const ENTRY = {
  id: 7,
  position: 3,
  trackId: 1,
  ayah: {
    surahNumber: 112,
    numberInSurah: 1,
    text: 'قُلْ',
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
    currentEntryId: 7,
    startedAt: null,
    reviewCount: 0,
    tafseerEnabled: true,
    tafseerEdition: 'muyassar',
    tafseerFormat: 'text',
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getDeliveryFor.mockResolvedValue(null);
  h.resolveTargetEntry.mockResolvedValue(ENTRY);
  h.buildDailyContent.mockResolvedValue(CONTENT);
  h.getEntryById.mockResolvedValue(ENTRY);
  h.getTafseerText.mockResolvedValue('إخلاص العبادة لله وحده.');
  h.countUnreadDeliveriesBefore.mockResolvedValue(0); // not behind by default
  h.countConfirmedAyat.mockResolvedValue(0); // nothing memorized yet -> no review
  h.getRevisionAyat.mockResolvedValue([]);
  h.getAyahText.mockResolvedValue({
    text: 'نص آية الفضل',
    surahNameAr: 'القمر',
    numberInSurah: 17,
  });
});

describe('buildTodayView (read-gated: shows the live ayah, never advances)', () => {
  it('records today on an active, unpaused, not-yet-delivered day (no advance)', async () => {
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.alreadyDelivered).toBe(false);
    expect(view.messages.length).toBeGreaterThan(0);
    expect(view.record).toEqual({ scheduledFor: '2026-06-01', entry: ENTRY });
  });

  it('re-shows the LIVE current ayah and does NOT record again', async () => {
    h.getDeliveryFor.mockResolvedValue({ trackEntryId: 7 });
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.alreadyDelivered).toBe(true);
    expect(view.record).toBeNull();
    // The position never moved, so the live ayah IS the one delivered; we show
    // it via resolveTargetEntry (no frozen "delivered" lookup).
    expect(h.resolveTargetEntry).toHaveBeenCalled();
  });

  it('is a pure peek on an off day (no record)', async () => {
    const view = await buildTodayView(todaySub({ activeDays: 2 }), NOW); // Tuesday only
    expect(view.messages.length).toBeGreaterThan(0);
    expect(view.record).toBeNull();
    expect(view.alreadyDelivered).toBe(false);
  });

  it('is a pure peek while paused (no record)', async () => {
    const view = await buildTodayView(todaySub({ pausedAt: new Date() }), NOW);
    expect(view.messages.length).toBeGreaterThan(0);
    expect(view.record).toBeNull();
  });

  it('returns no messages (and no record) on a finished non-looping track', async () => {
    h.resolveTargetEntry.mockResolvedValue(null);
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.messages).toEqual([]);
    expect(view.record).toBeNull();
  });
});

describe('buildTodayView tafseer (sent once, with the delivery; always linkable)', () => {
  it('includes the tafseer with a "read in full" link when the view records a delivery', async () => {
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.record).not.toBeNull();
    expect(view.tafseer.length).toBeGreaterThan(0);
    expect(view.tafseer[0].text).toContain('التفسير الميسر');
    expect(view.tafseer[0].text).toContain('إخلاص العبادة');
    // Inline text now ALWAYS carries the link, so a cross-reference is one tap
    // from the full text on the trusted source.
    expect(view.tafseer[0].readMoreUrl).toBe(
      'https://quranenc.com/ar/browse/arabic_moyassar/112/1',
    );
  });

  it('omits the tafseer when the subscriber turned it off', async () => {
    const view = await buildTodayView(todaySub({ tafseerEnabled: false }), NOW);
    expect(view.tafseer).toEqual([]);
    expect(view.messages.length).toBeGreaterThan(0);
  });

  it('omits the tafseer when the chosen edition has no seeded text', async () => {
    h.getTafseerText.mockResolvedValue(null);
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.tafseer).toEqual([]);
  });

  it('sends a link (no stored text) in link format, as a read-more button', async () => {
    h.getTafseerText.mockResolvedValue(null);
    const view = await buildTodayView(todaySub({ tafseerFormat: 'link' }), NOW);
    expect(view.record).not.toBeNull();
    expect(view.tafseer[0].readMoreUrl).toBe(
      'https://quranenc.com/ar/browse/arabic_moyassar/112/1',
    );
    expect(view.tafseer[0].text).not.toContain('https://');
    expect(h.getTafseerText).not.toHaveBeenCalled();
  });

  it('a preview edition in text format sends the opening plus a read-in-full button', async () => {
    h.getTafseerText.mockResolvedValue('بداية تفسير ابن كثير لهذه الآية.');
    const view = await buildTodayView(todaySub({ tafseerEdition: 'ibnkathir' }), NOW);
    expect(view.tafseer).toHaveLength(1);
    expect(view.tafseer[0].text).toContain('بداية تفسير ابن كثير');
    expect(view.tafseer[0].readMoreUrl).toBe(
      'https://quran.com/112:1/tafsirs/ar-tafsir-ibn-kathir',
    );
  });

  it('does NOT re-send the tafseer on an already-delivered re-show', async () => {
    h.getDeliveryFor.mockResolvedValue({ trackEntryId: 7 });
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.alreadyDelivered).toBe(true);
    expect(view.messages.length).toBeGreaterThan(0);
    expect(view.tafseer).toEqual([]);
  });

  it('does NOT send the tafseer on an off-day peek (no record)', async () => {
    const view = await buildTodayView(todaySub({ activeDays: 2 }), NOW);
    expect(view.record).toBeNull();
    expect(view.tafseer).toEqual([]);
  });
});

describe('deliverDueSubscribers (read-gated scheduler)', () => {
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
      tafseerEdition: 'muyassar',
      tafseerFormat: 'text',
      reciter: 'husary-muallim',
      oldReviewCount: 3,
      reviewCursor: 0,
      trackId: 1,
      startedAt: null,
      currentEntryId: 7,
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
    h.getCachedAyahAudioId.mockResolvedValue(null);
    h.cacheAyahAudioId.mockResolvedValue(undefined);
    h.sendAudio.mockResolvedValue({ result: 'ok', fileId: 'AUDIO_FILE_ID' });
    h.surahCompletionFor.mockResolvedValue(null);
  });

  it('records the day WITHOUT advancing (no totalEntries/loops/nextEntry)', async () => {
    await deliverDueSubscribers(bot, NOW);
    expect(h.commitDelivery).toHaveBeenCalledTimes(1);
    const arg = h.commitDelivery.mock.calls[0][0];
    expect(arg).toMatchObject({ subscriberId: 1, entry: ENTRY, scheduledFor: '2026-06-01' });
    expect(arg.totalEntries).toBeUndefined(); // read-gated: the send never advances
    expect(arg.loops).toBeUndefined();
  });

  it('sends the "done" confirm prompt after the ayah (silent)', async () => {
    await deliverDueSubscribers(bot, NOW);
    const promptCall = api.sendMessage.mock.calls.find((c) => c[1] === COPY.confirmPrompt);
    expect(promptCall).toBeTruthy();
    expect(promptCall![2]).toMatchObject({ disable_notification: true });
  });

  it('leads a repeating unread ayah with the missed-days nudge (encouragement ayah from the DB)', async () => {
    h.countUnreadDeliveriesBefore.mockResolvedValue(2);
    await deliverDueSubscribers(bot, NOW);
    expect(h.getAyahText).toHaveBeenCalledWith(54, 17); // the picked virtue's text
    const nudgeCall = api.sendMessage.mock.calls.find((c) => String(c[1]).includes('نص آية الفضل'));
    expect(nudgeCall).toBeTruthy();
    expect(nudgeCall![2]).toMatchObject({ disable_notification: true }); // silent
  });

  it('sends no nudge when the reader is not behind', async () => {
    h.countUnreadDeliveriesBefore.mockResolvedValue(0);
    await deliverDueSubscribers(bot, NOW);
    expect(h.getAyahText).not.toHaveBeenCalled();
  });

  it('sends the recitation audio silently, by URL, before the tafseer', async () => {
    await deliverDueSubscribers(bot, NOW);
    expect(h.sendAudio).toHaveBeenCalledTimes(1);
    const [, chatId, audio, opts] = h.sendAudio.mock.calls[0];
    expect(chatId).toBe(123n);
    expect(audio).toBe('https://everyayah.com/data/Husary_Muallim_128kbps/112001.mp3');
    expect(opts).toMatchObject({ silent: true });
  });

  it('caches the file_id on the first send and reuses it after', async () => {
    await deliverDueSubscribers(bot, NOW);
    expect(h.cacheAyahAudioId).toHaveBeenCalledWith(112, 1, 'husary-muallim', 'AUDIO_FILE_ID');
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

  it('does not let an audio failure block the delivery', async () => {
    h.sendAudio.mockRejectedValue(new Error('cdn down'));
    const stats = await deliverDueSubscribers(bot, NOW);
    expect(h.commitDelivery).toHaveBeenCalledTimes(1);
    expect(stats.sent).toBe(1);
  });

  it('marks a blocked user and does not commit', async () => {
    h.sendMessages.mockResolvedValue('blocked');
    const stats = await deliverDueSubscribers(bot, NOW);
    expect(h.markBlocked).toHaveBeenCalledWith(1);
    expect(h.commitDelivery).not.toHaveBeenCalled();
    expect(stats.failed).toBe(1);
  });

  it('sends neither audio, tafseer, nor the prompt when the commit loses a race (duplicate)', async () => {
    h.commitDelivery.mockResolvedValue('duplicate');
    const stats = await deliverDueSubscribers(bot, NOW);
    expect(stats.sent).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(h.sendAudio).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled(); // no tafseer, no confirm prompt
  });

  it('sends the distant review and advances the cursor when the reader has confirmed ayat', async () => {
    // oldReviewCount is 3 (deliverableSub), total confirmed is 5, so the window
    // is 3 ayat and the cursor advances by 3, in the same commit.
    h.countConfirmedAyat.mockResolvedValue(5);
    h.getRevisionAyat.mockResolvedValue([
      { surahNameAr: 'الناس', numberInSurah: 1, text: 'قُلْ أَعُوذُ' },
      { surahNameAr: 'الفلق', numberInSurah: 1, text: 'قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ' },
      { surahNameAr: 'الإخلاص', numberInSurah: 1, text: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ' },
    ]);
    await deliverDueSubscribers(bot, NOW);
    // Excludes the current surah (ENTRY is surah 112).
    expect(h.getRevisionAyat).toHaveBeenCalledWith(1, 0, 3, 112);
    expect(h.countConfirmedAyat).toHaveBeenCalledWith(1, 112);
    expect(h.commitDelivery.mock.calls[0][0]).toMatchObject({ nextReviewCursor: 3 });
    const reviewCall = api.sendMessage.mock.calls.find((c) =>
      String(c[1]).includes('مراجعة للتثبيت'),
    );
    expect(reviewCall).toBeTruthy();
    expect(reviewCall![2]).toMatchObject({ disable_notification: true }); // silent
  });

  it('sends no review (and does not advance the cursor) when nothing is confirmed yet', async () => {
    h.countConfirmedAyat.mockResolvedValue(0);
    await deliverDueSubscribers(bot, NOW);
    expect(h.commitDelivery.mock.calls[0][0].nextReviewCursor).toBeUndefined();
    expect(
      api.sendMessage.mock.calls.find((c) => String(c[1]).includes('مراجعة للتثبيت')),
    ).toBeUndefined();
  });
});

describe('sampleEntryFor (the "try it on today\'s ayah" preview)', () => {
  it("uses today's DELIVERED ayah when there is one", async () => {
    h.getDeliveryFor.mockResolvedValue({ trackEntryId: 7 });
    const entry = await sampleEntryFor(todaySub(), NOW);
    expect(entry).toBe(ENTRY);
    expect(h.getEntryById).toHaveBeenCalledWith(7);
  });

  it('falls back to the current ayah when today is not delivered', async () => {
    h.getDeliveryFor.mockResolvedValue(null);
    const entry = await sampleEntryFor(todaySub(), NOW);
    expect(entry).toBe(ENTRY);
    expect(h.resolveTargetEntry).toHaveBeenCalled();
  });

  it('returns null when the subscriber has not started', async () => {
    h.getDeliveryFor.mockResolvedValue(null);
    h.resolveTargetEntry.mockResolvedValue(null);
    expect(await sampleEntryFor(todaySub(), NOW)).toBeNull();
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
    expect(msg!.text).toContain('الناس');
  });
});

describe('revisionMessagesFor (distant review window + cursor)', () => {
  const sub = (over: Record<string, unknown> = {}) => ({
    id: 1,
    oldReviewCount: 3,
    reviewCursor: 0,
    ...over,
  });

  it('is empty (cursor unchanged) when oldReviewCount is 0', async () => {
    const out = await revisionMessagesFor(sub({ oldReviewCount: 0, reviewCursor: 4 }), 112);
    expect(out).toEqual({ messages: [], nextCursor: 4 });
    expect(h.countConfirmedAyat).not.toHaveBeenCalled();
  });

  it('is empty when nothing OLD has been confirmed yet (e.g. still in the first surah)', async () => {
    h.countConfirmedAyat.mockResolvedValue(0);
    const out = await revisionMessagesFor(sub({ reviewCursor: 9 }), 112);
    expect(out).toEqual({ messages: [], nextCursor: 9 });
    expect(h.countConfirmedAyat).toHaveBeenCalledWith(1, 112); // excludes the current surah
    expect(h.getRevisionAyat).not.toHaveBeenCalled();
  });

  it('reads the window at cursor%total (excluding the current surah) and advances by the count', async () => {
    h.countConfirmedAyat.mockResolvedValue(10);
    h.getRevisionAyat.mockResolvedValue([
      { surahNameAr: 'الفلق', numberInSurah: 1, text: 'قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ' },
    ]);
    const out = await revisionMessagesFor(sub({ oldReviewCount: 3, reviewCursor: 12 }), 112);
    expect(h.getRevisionAyat).toHaveBeenCalledWith(1, 2, 3, 112); // 12 % 10 = 2, want 3
    expect(out.nextCursor).toBe(15); // 12 + 3
    expect(out.messages[0]).toContain('مراجعة للتثبيت');
  });

  it('caps the window to the corpus size when fewer ayat are confirmed than wanted', async () => {
    h.countConfirmedAyat.mockResolvedValue(2);
    h.getRevisionAyat.mockResolvedValue([
      { surahNameAr: 'الناس', numberInSurah: 1, text: 'a' },
      { surahNameAr: 'الفلق', numberInSurah: 1, text: 'b' },
    ]);
    const out = await revisionMessagesFor(sub({ oldReviewCount: 5, reviewCursor: 0 }), 112);
    expect(h.getRevisionAyat).toHaveBeenCalledWith(1, 0, 2, 112); // min(5, total=2)
    expect(out.nextCursor).toBe(2);
  });
});
