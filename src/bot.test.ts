import { describe, it, expect, beforeEach, vi } from 'vitest';

// Handler-level test for the reposition helper (the /surah, surah-pick, and
// onboarding auto-send). bot.ts builds a grammY Bot and wires every command at
// import, so we mock the modules that would touch the network, the database, or
// env at load time, then drive the exported helper directly.
const h = vi.hoisted(() => ({
  commitDelivery: vi.fn(),
  buildTodayView: vi.fn(),
  buildCompletionMessage: vi.fn(),
  deliverAyahAudio: vi.fn(),
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
  setTafseerEnabled: vi.fn(),
  setTafseerEdition: vi.fn(),
  setTafseerFormat: vi.fn(),
  setReciter: vi.fn(),
  pauseSubscriber: vi.fn(),
  resumeSubscriber: vi.fn(),
  setStartPosition: vi.fn(),
  setOrder: vi.fn(),
  commitDelivery: h.commitDelivery,
  getEntryForAyah: vi.fn(),
  getEntryAtPosition: vi.fn(),
  getProgressView: vi.fn(),
  countDeliveries: vi.fn(),
  getTrackByKey: vi.fn(),
  ORDERS: [],
  KIDS_TRACK: { key: 'kids-hifz' },
  MUSHAF_TRACK: { key: 'mushaf' },
  SURAHS: [],
  RECITERS: [],
  RECITER_NONE: 'none',
  reciterByKey: vi.fn(),
  isReciterChoice: vi.fn(),
  TAFSEERS: [],
  tafseerOrDefault: () => ({ key: 'muyassar', nameAr: 'التفسير الميسر', kind: 'inline' }),
  isTafseerEdition: vi.fn(),
  ayahCountFor: vi.fn(),
}));
vi.mock('./lib/deliver', () => ({
  buildTodayView: h.buildTodayView,
  buildCompletionMessage: h.buildCompletionMessage,
  deliverAyahAudio: h.deliverAyahAudio,
  previewAyah: vi.fn(),
  tafseerMessagesFor: vi.fn(),
  sampleEntryFor: vi.fn(),
  // No read-more button for a plain inline-text tafseer message.
  tafseerReplyMarkup: () => undefined,
}));
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
  telegramId: 123n,
  startedAt: null,
  pausedAt: null,
  trackId: 1,
  currentEntryId: 50,
  reviewCount: 0,
  tafseerEnabled: true,
  tafseerEdition: 'muyassar',
  tafseerFormat: 'text',
  reciter: 'husary-muallim',
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
  it('claims a free day, then sends the audio and the (silent) tafseer', async () => {
    h.buildTodayView.mockResolvedValue({
      messages: ['the ayah'],
      tafseer: [{ text: '📖 تفسير الآية ﴿١﴾ — التفسير الميسر\n\nالمعنى' }],
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
    // Audio goes out for the claimed entry, in the subscriber's reciter voice.
    expect(h.deliverAyahAudio).toHaveBeenCalledTimes(1);
    expect(h.deliverAyahAudio).toHaveBeenCalledWith(
      expect.anything(),
      123n,
      ENTRY,
      'husary-muallim',
    );
    // The tafseer is replied silently.
    const tafseerReply = ctx.reply.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('التفسير الميسر'),
    );
    expect(tafseerReply).toBeTruthy();
    expect(tafseerReply![1]).toMatchObject({ disable_notification: true });
  });

  it('does NOT claim, send audio, or send tafseer on a preview (no claim)', async () => {
    h.buildTodayView.mockResolvedValue({
      messages: ['the ayah'],
      tafseer: [], // a preview carries no tafseer
      claim: null,
      alreadyDelivered: true,
    });
    const ctx = fakeCtx();
    await sendAfterReposition(ctx as never, SUB, ENTRY);

    expect(h.commitDelivery).not.toHaveBeenCalled();
    expect(h.deliverAyahAudio).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalled(); // the ayah preview is still shown
  });

  it('does NOT celebrate, send audio, or tafseer when the claim lost the race', async () => {
    // The scheduler delivered the same day first: commitDelivery reports
    // 'duplicate' and the position did not advance here, so nothing extra fires.
    h.commitDelivery.mockResolvedValue('duplicate');
    h.buildTodayView.mockResolvedValue({
      messages: ['the ayah'],
      tafseer: [{ text: '📖 ...' }],
      claim: { scheduledFor: '2026-06-01', entry: ENTRY, totalEntries: 6236, loops: true },
      alreadyDelivered: false,
    });
    await sendAfterReposition(fakeCtx() as never, SUB, ENTRY);
    expect(h.deliverAyahAudio).not.toHaveBeenCalled();
    expect(h.buildCompletionMessage).not.toHaveBeenCalled();
  });
});
