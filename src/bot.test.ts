import { describe, it, expect, beforeEach, vi } from 'vitest';

// Handler-level tests for the read-gated flow: the reposition auto-send
// (sendAfterReposition), the "done" button (handleDone), and /next
// (advanceAndShowNext). bot.ts builds a grammY Bot and wires every command at
// import, so we mock the modules that touch the network/database/env at load
// time, then drive the exported helpers directly.
const h = vi.hoisted(() => ({
  commitDelivery: vi.fn(),
  confirmRead: vi.fn(),
  getLatestUnconfirmedDelivery: vi.fn(),
  resolveTargetEntry: vi.fn(),
  getEntryById: vi.fn(),
  getEntryAtPosition: vi.fn(),
  countTrackEntries: vi.fn(),
  getTrackById: vi.fn(),
  setStartPosition: vi.fn(),
  buildTodayView: vi.fn(),
  buildCompletionMessage: vi.fn(),
  deliverAyahAudio: vi.fn(),
  sendConfirmPrompt: vi.fn(),
  sendMissedDaysNudge: vi.fn(),
  sendAyahNow: vi.fn(),
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
  setStartPosition: h.setStartPosition,
  setOrder: vi.fn(),
  commitDelivery: h.commitDelivery,
  confirmRead: h.confirmRead,
  getLatestUnconfirmedDelivery: h.getLatestUnconfirmedDelivery,
  resolveTargetEntry: h.resolveTargetEntry,
  getEntryForAyah: vi.fn(),
  getEntryAtPosition: h.getEntryAtPosition,
  getEntryById: h.getEntryById,
  countTrackEntries: h.countTrackEntries,
  getTrackById: h.getTrackById,
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
  sendConfirmPrompt: h.sendConfirmPrompt,
  sendMissedDaysNudge: h.sendMissedDaysNudge,
  sendAyahNow: h.sendAyahNow,
  previewAyah: vi.fn(),
  tafseerMessagesFor: vi.fn(),
  sampleEntryFor: vi.fn(),
  tafseerReplyMarkup: () => undefined,
  READ_CONFIRM: 'ayah:done',
}));
vi.mock('./scheduler', () => ({ runDeliveryOnce: vi.fn() }));
vi.mock('./lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendAfterReposition, handleDone, advanceAndShowNext } from './bot';

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
  currentEntryId: 7,
  reviewCount: 0,
  tafseerEnabled: true,
  tafseerEdition: 'muyassar',
  tafseerFormat: 'text',
  reciter: 'husary-muallim',
  timezone: 'UTC',
  activeDays: 127,
} as never;

function fakeCtx() {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.commitDelivery.mockResolvedValue('sent');
  h.confirmRead.mockResolvedValue('advanced');
  h.getLatestUnconfirmedDelivery.mockResolvedValue({ trackEntryId: 7 });
  h.getEntryById.mockResolvedValue(ENTRY);
  h.resolveTargetEntry.mockResolvedValue(ENTRY);
  h.getEntryAtPosition.mockResolvedValue({ ...(ENTRY as object), id: 8, position: 4 });
  h.countTrackEntries.mockResolvedValue(6236);
  h.getTrackById.mockResolvedValue({ id: 1, loops: true });
  h.buildCompletionMessage.mockResolvedValue(null);
  h.sendAyahNow.mockResolvedValue(true);
});

describe('sendAfterReposition (read-gated: records, no advance)', () => {
  it('records a free day (no advance) and sends audio + silent tafseer + the done prompt', async () => {
    h.buildTodayView.mockResolvedValue({
      messages: ['the ayah'],
      tafseer: [{ text: '📖 تفسير الآية ﴿١﴾ — التفسير الميسر\n\nالمعنى' }],
      record: { scheduledFor: '2026-06-01', entry: ENTRY },
      alreadyDelivered: false,
    });
    const ctx = fakeCtx();
    await sendAfterReposition(ctx as never, SUB, ENTRY);

    // buildTodayView is now called with NO third (reposition) argument.
    expect(h.buildTodayView).toHaveBeenCalledTimes(1);
    expect(h.buildTodayView).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: 1, currentEntryId: 7 }),
      expect.any(Date),
    );
    // Recorded with no advance (no totalEntries/loops in the call).
    expect(h.commitDelivery).toHaveBeenCalledTimes(1);
    expect(h.commitDelivery.mock.calls[0][0].totalEntries).toBeUndefined();
    expect(h.deliverAyahAudio).toHaveBeenCalledTimes(1);
    const tafseerReply = ctx.reply.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('التفسير الميسر'),
    );
    expect(tafseerReply![1]).toMatchObject({ disable_notification: true });
    expect(h.sendConfirmPrompt).toHaveBeenCalledTimes(1); // the "done" button
  });

  it('does NOT record or send audio on a preview, but still offers the done button', async () => {
    h.buildTodayView.mockResolvedValue({
      messages: ['the ayah'],
      tafseer: [],
      record: null,
      alreadyDelivered: true,
    });
    const ctx = fakeCtx();
    await sendAfterReposition(ctx as never, SUB, ENTRY);

    expect(h.commitDelivery).not.toHaveBeenCalled();
    expect(h.deliverAyahAudio).not.toHaveBeenCalled();
    expect(h.sendConfirmPrompt).toHaveBeenCalledTimes(1); // can still mark done
  });

  it('does NOT send audio when the record loses the race (duplicate)', async () => {
    h.commitDelivery.mockResolvedValue('duplicate');
    h.buildTodayView.mockResolvedValue({
      messages: ['the ayah'],
      tafseer: [{ text: '📖 ...' }],
      record: { scheduledFor: '2026-06-01', entry: ENTRY },
      alreadyDelivered: false,
    });
    await sendAfterReposition(fakeCtx() as never, SUB, ENTRY);
    expect(h.deliverAyahAudio).not.toHaveBeenCalled();
  });
});

describe('handleDone (the "أتممتُها" button)', () => {
  it('advances one ayah and acknowledges; fires the milestone when a surah is finished', async () => {
    h.buildCompletionMessage.mockResolvedValue({ text: 'أتممت سورة الناس 🌿', keyboard: {} });
    const ctx = fakeCtx();
    await handleDone(ctx as never, SUB);

    expect(h.confirmRead).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: 1, entry: ENTRY, totalEntries: 6236, loops: true }),
    );
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled(); // button removed
    expect(ctx.reply).toHaveBeenCalled(); // doneConfirmed + the milestone
    expect(h.buildCompletionMessage).toHaveBeenCalled();
  });

  it('is a gentle no-op on a stale/double tap (confirmRead reports "already")', async () => {
    h.confirmRead.mockResolvedValue('already');
    const ctx = fakeCtx();
    await handleDone(ctx as never, SUB);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.any(String) }),
    );
    // No "advanced" confirmation reply, and no milestone.
    expect(h.buildCompletionMessage).not.toHaveBeenCalled();
  });

  it('does nothing to advance when there is no unconfirmed delivery', async () => {
    h.getLatestUnconfirmedDelivery.mockResolvedValue(null);
    const ctx = fakeCtx();
    await handleDone(ctx as never, SUB);
    expect(h.confirmRead).not.toHaveBeenCalled();
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled(); // stale button removed
  });

  it('advances the CURRENT (visible) ayah, not the stale delivered one (after a /surah jump)', async () => {
    // A jump on an already-delivered day: the latest unconfirmed delivery still
    // points to the morning ayah, but currentEntryId is the just-set one. The
    // button must advance what the reader is looking at (resolveTargetEntry).
    const CURRENT = { ...(ENTRY as object), id: 42, position: 9 } as never;
    h.getLatestUnconfirmedDelivery.mockResolvedValue({ trackEntryId: 7 }); // the stale morning one
    h.resolveTargetEntry.mockResolvedValue(CURRENT); // what they are viewing now
    await handleDone(fakeCtx() as never, SUB);
    expect(h.confirmRead).toHaveBeenCalledWith(expect.objectContaining({ entry: CURRENT }));
  });
});

describe('advanceAndShowNext (/next)', () => {
  it('confirms the current ayah and shows the next one', async () => {
    const ctx = fakeCtx();
    await advanceAndShowNext(ctx as never, SUB, new Date());
    expect(h.confirmRead).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: 1, entry: ENTRY }),
    );
    // The next entry (position 4) is shown via sendAyahNow.
    expect(h.getEntryAtPosition).toHaveBeenCalledWith(1, 4);
    expect(h.sendAyahNow).toHaveBeenCalledTimes(1);
  });

  it('just starts (no advance) when the subscriber has not started yet', async () => {
    const notStarted = { ...(SUB as object), currentEntryId: null } as never;
    const ctx = fakeCtx();
    await advanceAndShowNext(ctx as never, notStarted, new Date());
    expect(h.setStartPosition).toHaveBeenCalledWith(1, 7); // begins at the current entry
    expect(h.confirmRead).not.toHaveBeenCalled(); // nothing to advance past
    expect(h.sendAyahNow).toHaveBeenCalledTimes(1);
  });
});
