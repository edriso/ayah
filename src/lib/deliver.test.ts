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
  // Audio path.
  getCachedAyahAudioId: vi.fn(),
  cacheAyahAudioId: vi.fn(),
  sendAudio: vi.fn(),
  // Tafseer path: the text now comes from the Tafseer table, not the ayah row.
  getTafseerText: vi.fn(),
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
  getCachedAyahAudioId: h.getCachedAyahAudioId,
  cacheAyahAudioId: h.cacheAyahAudioId,
  // Faithful-enough reciter lookup: a real reciter for any key, undefined for
  // the "none" sentinel (so deliverAyahAudio sends nothing).
  reciterByKey: (key: string) =>
    key === 'none'
      ? undefined
      : { key, nameAr: 'الحصري (المعلِّم)', folder: 'Husary_Muallim_128kbps' },
  // Tafseer: the text service, plus a faithful-enough edition lookup. The
  // default/Al-Muyassar is inline (quranenc link); "ibnkathir" is the long
  // preview edition (quran.com link), so tests can exercise both shapes.
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
} from './deliver';

// 2026-06-01 (UTC) is a Monday, ISO weekday 1.
const NOW = new Date('2026-06-01T12:00:00Z');
const CONTENT = {
  surah: { number: 112, nameAr: 'الإخلاص' },
  today: { numberInSurah: 1, text: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ' },
  review: [],
};
// A resolved entry (shape only matters by reference for the claim). The
// tafseer text now comes from getTafseerText(edition, surah, ayah), not the
// ayah row, so the entry just needs its (surah, ayah) coordinates.
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
    currentEntryId: 50, // already advanced past the delivered entry
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
  h.countTrackEntries.mockResolvedValue(6236);
  h.getTrackById.mockResolvedValue({ id: 1, loops: true });
  h.getEntryById.mockResolvedValue(ENTRY);
  h.getTafseerText.mockResolvedValue('إخلاص العبادة لله وحده.');
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

describe('buildTodayView tafseer (sent once, with the delivery)', () => {
  it('includes the tafseer when the view claims a delivery (enabled + has one)', async () => {
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.claim).not.toBeNull();
    expect(view.tafseer.length).toBeGreaterThan(0);
    expect(view.tafseer[0].text).toContain('التفسير الميسر');
    expect(view.tafseer[0].text).toContain('إخلاص العبادة');
    expect(view.tafseer[0].readMoreUrl).toBeUndefined(); // inline text, no button
  });

  it('omits the tafseer when the subscriber turned it off', async () => {
    const view = await buildTodayView(todaySub({ tafseerEnabled: false }), NOW);
    expect(view.tafseer).toEqual([]);
    expect(view.messages.length).toBeGreaterThan(0); // the ayah is unaffected
  });

  it('omits the tafseer when the chosen edition has no seeded text', async () => {
    h.getTafseerText.mockResolvedValue(null);
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.tafseer).toEqual([]);
  });

  it('sends a link (no stored text) in link format, as a read-more button', async () => {
    h.getTafseerText.mockResolvedValue(null); // link mode must not need text
    const view = await buildTodayView(todaySub({ tafseerFormat: 'link' }), NOW);
    expect(view.claim).not.toBeNull();
    expect(view.tafseer.length).toBeGreaterThan(0);
    expect(view.tafseer[0].readMoreUrl).toBe(
      'https://quranenc.com/ar/browse/arabic_moyassar/112/1',
    );
    expect(view.tafseer[0].text).not.toContain('https://'); // URL is the button, not in text
    expect(h.getTafseerText).not.toHaveBeenCalled();
  });

  it('uses the chosen edition (label, link, and its stored rows)', async () => {
    h.getTafseerText.mockResolvedValue('بداية تفسير ابن كثير.');
    const view = await buildTodayView(todaySub({ tafseerEdition: 'ibnkathir' }), NOW);
    expect(h.getTafseerText).toHaveBeenCalledWith('ibnkathir', 112, 1);
    expect(view.tafseer[0].text).toContain('تفسير ابن كثير'); // the edition header
  });

  it('a preview edition in text format sends the opening plus a read-in-full button', async () => {
    h.getTafseerText.mockResolvedValue('بداية تفسير ابن كثير لهذه الآية.');
    const view = await buildTodayView(todaySub({ tafseerEdition: 'ibnkathir' }), NOW);
    expect(view.tafseer).toHaveLength(1);
    expect(view.tafseer[0].text).toContain('بداية تفسير ابن كثير');
    expect(view.tafseer[0].text).toContain('بداية التفسير'); // the "this is the beginning" note
    expect(view.tafseer[0].readMoreUrl).toBe(
      'https://quran.com/112:1/tafsirs/ar-tafsir-ibn-kathir',
    );
  });

  it('falls back to text format for an unrecognised tafseerFormat value', async () => {
    h.getTafseerText.mockResolvedValue('نص التفسير.');
    const view = await buildTodayView(todaySub({ tafseerFormat: 'garbage' }), NOW);
    expect(h.getTafseerText).toHaveBeenCalled(); // text path, not link
    expect(view.tafseer[0].text).toContain('نص التفسير');
  });

  it('does NOT re-send the tafseer on an already-delivered re-show', async () => {
    h.getDeliveryFor.mockResolvedValue({ trackEntryId: 7 });
    const view = await buildTodayView(todaySub(), NOW);
    expect(view.alreadyDelivered).toBe(true);
    expect(view.messages.length).toBeGreaterThan(0); // the ayah is still shown
    expect(view.tafseer).toEqual([]); // but not the tafseer again
  });

  it('does NOT send the tafseer on an off-day peek (no claim)', async () => {
    // activeDays = 2 is Tuesday only, so Monday (NOW) is off.
    const view = await buildTodayView(todaySub({ activeDays: 2 }), NOW);
    expect(view.claim).toBeNull();
    expect(view.tafseer).toEqual([]);
  });

  it('does NOT send the tafseer on a peek while paused (no claim)', async () => {
    const view = await buildTodayView(todaySub({ pausedAt: new Date() }), NOW);
    expect(view.claim).toBeNull();
    expect(view.tafseer).toEqual([]);
  });

  it('sends the tafseer for a NEW ayah when a reposition claims a free day', async () => {
    const view = await buildTodayView(todaySub(), NOW, { reposition: true });
    expect(view.claim).not.toBeNull();
    expect(view.tafseer.length).toBeGreaterThan(0);
  });

  it('does NOT send the tafseer for a reposition PREVIEW on an already-delivered day', async () => {
    h.getDeliveryFor.mockResolvedValue({ trackEntryId: 7 });
    const view = await buildTodayView(todaySub(), NOW, { reposition: true });
    expect(view.claim).toBeNull(); // a preview, not a delivery
    expect(view.messages.length).toBeGreaterThan(0); // the new ayah is previewed
    expect(view.tafseer).toEqual([]); // tafseer waits for the real send
  });
});

describe('deliverDueSubscribers (scheduler sends audio + tafseer silently)', () => {
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
      tafseerEdition: 'muyassar',
      tafseerFormat: 'text',
      reciter: 'husary-muallim',
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
    h.getCachedAyahAudioId.mockResolvedValue(null);
    h.cacheAyahAudioId.mockResolvedValue(undefined);
    h.sendAudio.mockResolvedValue({ result: 'ok', fileId: 'AUDIO_FILE_ID' });
    // No surah completion, so no milestone message muddies the assertions.
    h.surahCompletionFor.mockResolvedValue(null);
  });

  it('sends the recitation audio silently, by URL, before the tafseer', async () => {
    await deliverDueSubscribers(bot, NOW);
    expect(h.sendAudio).toHaveBeenCalledTimes(1);
    const [, chatId, audio, opts] = h.sendAudio.mock.calls[0];
    expect(chatId).toBe(123n);
    expect(audio).toBe('https://everyayah.com/data/Husary_Muallim_128kbps/112001.mp3');
    expect(opts).toMatchObject({ silent: true });
    // Audio goes out before the tafseer (reading order: read, hear, understand).
    const tafseerOrder = api.sendMessage.mock.invocationCallOrder[0];
    expect(h.sendAudio.mock.invocationCallOrder[0]).toBeLessThan(tafseerOrder);
  });

  it('caches the file_id on the first send', async () => {
    await deliverDueSubscribers(bot, NOW);
    expect(h.cacheAyahAudioId).toHaveBeenCalledWith(112, 1, 'husary-muallim', 'AUDIO_FILE_ID');
  });

  it('reuses the cached file_id and does not re-cache it', async () => {
    h.getCachedAyahAudioId.mockResolvedValue('CACHED_ID');
    h.sendAudio.mockResolvedValue({ result: 'ok', fileId: 'CACHED_ID' });
    await deliverDueSubscribers(bot, NOW);
    expect(h.sendAudio.mock.calls[0][2]).toBe('CACHED_ID'); // sent by file_id, not URL
    expect(h.cacheAyahAudioId).not.toHaveBeenCalled();
  });

  it('sends no audio when the subscriber chose "none"', async () => {
    h.listDeliverableSubscribers.mockResolvedValue([deliverableSub({ reciter: 'none' })]);
    const stats = await deliverDueSubscribers(bot, NOW);
    expect(stats.sent).toBe(1); // the ayah still goes out
    expect(h.sendAudio).not.toHaveBeenCalled();
  });

  it('does not cache a file_id when the audio send did not succeed', async () => {
    h.sendAudio.mockResolvedValue({ result: 'failed' }); // e.g. CDN hiccup
    const stats = await deliverDueSubscribers(bot, NOW);
    expect(stats.sent).toBe(1); // the ayah was still delivered
    expect(h.cacheAyahAudioId).not.toHaveBeenCalled();
  });

  it('does not let an audio failure block the delivery', async () => {
    h.sendAudio.mockRejectedValue(new Error('cdn down'));
    const stats = await deliverDueSubscribers(bot, NOW);
    expect(h.commitDelivery).toHaveBeenCalledTimes(1);
    expect(stats.sent).toBe(1);
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

  it('does not let a tafseer send failure block the delivery', async () => {
    api.sendMessage.mockRejectedValue(new Error('boom'));
    const stats = await deliverDueSubscribers(bot, NOW);
    // The ayah (via sendMessages) succeeded and was committed BEFORE the tafseer
    // send, so a tafseer failure cannot undo the delivery.
    expect(h.commitDelivery).toHaveBeenCalledTimes(1);
    expect(stats.sent).toBe(1);
  });

  it('sends neither audio nor tafseer when the commit loses a race (duplicate)', async () => {
    h.commitDelivery.mockResolvedValue('duplicate');
    const stats = await deliverDueSubscribers(bot, NOW);
    expect(stats.sent).toBe(0);
    expect(stats.skipped).toBe(1);
    // The other path (e.g. /today) already delivered this day with its audio +
    // tafseer, so this run must not send a second copy of either.
    expect(h.sendAudio).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});

describe('sampleEntryFor (the "try it on today\'s ayah" preview)', () => {
  it("uses today's DELIVERED ayah when there is one (not the advanced pointer)", async () => {
    h.getDeliveryFor.mockResolvedValue({ trackEntryId: 7 });
    const entry = await sampleEntryFor(todaySub(), NOW);
    expect(entry).toBe(ENTRY);
    expect(h.getEntryById).toHaveBeenCalledWith(7);
    expect(h.resolveTargetEntry).not.toHaveBeenCalled(); // delivered wins
  });

  it('falls back to the current ayah when today is not delivered', async () => {
    h.getDeliveryFor.mockResolvedValue(null);
    const entry = await sampleEntryFor(todaySub(), NOW);
    expect(entry).toBe(ENTRY);
    expect(h.resolveTargetEntry).toHaveBeenCalled();
  });

  it('falls back to the current ayah when the delivered entry is missing', async () => {
    h.getDeliveryFor.mockResolvedValue({ trackEntryId: 99 });
    h.getEntryById.mockResolvedValue(null);
    const entry = await sampleEntryFor(todaySub(), NOW);
    expect(entry).toBe(ENTRY); // from resolveTargetEntry
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
    expect(msg!.text).toContain('الناس'); // a looping track restarts here
  });
});
