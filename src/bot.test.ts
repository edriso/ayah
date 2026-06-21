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
  revisionMessagesFor: vi.fn(() => Promise.resolve({ messages: [], nextCursor: 0 })),
  previewAyah: vi.fn(),
  tafseerMessagesFor: vi.fn(),
  sampleEntryFor: vi.fn(),
  tafseerReplyMarkup: () => undefined,
  READ_CONFIRM: 'ayah:done',
  AYAH_TAFSEER_NOW: 'ayah:taf:now',
  AYAH_AUDIO_NOW: 'ayah:rec:now',
}));
vi.mock('./scheduler', () => ({ runDeliveryOnce: vi.fn() }));
vi.mock('./lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendAfterReposition, handleDone, advanceAndShowNext } from './bot';
import { COPY } from './lib/copy';

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
      entry: ENTRY,
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
    // The missed-days nudge leads the SCHEDULED push only; a manual reposition
    // (reader already engaged) is never interrupted by it.
    expect(h.sendMissedDaysNudge).not.toHaveBeenCalled();
  });

  it('does NOT record or send audio on a preview, but still offers the done button', async () => {
    h.buildTodayView.mockResolvedValue({
      messages: ['the ayah'],
      tafseer: [],
      record: null,
      alreadyDelivered: true,
      entry: ENTRY,
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
      entry: ENTRY,
    });
    await sendAfterReposition(fakeCtx() as never, SUB, ENTRY);
    expect(h.deliverAyahAudio).not.toHaveBeenCalled();
  });
});

describe('handleDone (the "أتممتُها" button)', () => {
  it('confirms the current ayah, reveals the next, and fires the milestone when a surah is finished', async () => {
    h.buildCompletionMessage.mockResolvedValue({ text: 'أتممت سورة الناس 🌿', keyboard: {} });
    const ctx = fakeCtx();
    // The button carries the current ayah's id, so it is not stale.
    await handleDone(ctx as never, SUB, 7);

    expect(h.confirmRead).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: 1, entry: ENTRY, totalEntries: 6236, loops: true }),
    );
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled(); // tapped button removed
    expect(h.buildCompletionMessage).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalled(); // the milestone
    expect(h.sendAyahNow).toHaveBeenCalledTimes(1); // the next ayah is revealed
  });

  it('is a gentle no-op on a STALE button (its id is no longer the current ayah)', async () => {
    // current is entry 7; the tapped button was for entry 3 (an ayah passed).
    const ctx = fakeCtx();
    await handleDone(ctx as never, SUB, 3);
    expect(h.confirmRead).not.toHaveBeenCalled(); // nothing advanced
    expect(h.sendAyahNow).not.toHaveBeenCalled(); // nothing revealed
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled(); // stale button removed
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.any(String) }),
    );
  });

  it('does nothing to advance when there is no unconfirmed delivery', async () => {
    h.getLatestUnconfirmedDelivery.mockResolvedValue(null);
    const ctx = fakeCtx();
    await handleDone(ctx as never, SUB, 7);
    expect(h.confirmRead).not.toHaveBeenCalled();
    expect(h.sendAyahNow).not.toHaveBeenCalled();
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled(); // stale button removed
  });

  it('a legacy bare button (no id) acts on the CURRENT visible ayah, not the stale delivered one', async () => {
    // A jump on an already-delivered day: the latest unconfirmed delivery still
    // points to the morning ayah, but currentEntryId is the just-set one. A
    // legacy button (no id) must advance what the reader is looking at.
    const CURRENT = { ...(ENTRY as object), id: 42, position: 9 } as never;
    h.getLatestUnconfirmedDelivery.mockResolvedValue({ trackEntryId: 7 }); // the stale morning one
    h.resolveTargetEntry.mockResolvedValue(CURRENT); // what they are viewing now
    await handleDone(fakeCtx() as never, SUB); // no buttonEntryId (legacy)
    expect(h.confirmRead).toHaveBeenCalledWith(expect.objectContaining({ entry: CURRENT }));
  });
});

describe('advanceAndShowNext (/next)', () => {
  it('confirms the current ayah and reveals the next one (labeled, with its own button)', async () => {
    const ctx = fakeCtx();
    await advanceAndShowNext(ctx as never, SUB, new Date());
    expect(h.confirmRead).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: 1, entry: ENTRY }),
    );
    // The next entry (position 4, id 8) is revealed via sendAyahNow, titled with
    // the forward-looking label so it is not mistaken for today's scheduled ayah.
    expect(h.getEntryAtPosition).toHaveBeenCalledWith(1, 4);
    expect(h.sendAyahNow).toHaveBeenCalledWith(
      expect.anything(),
      SUB,
      expect.objectContaining({ id: 8 }),
      COPY.nextAyahLabel,
    );
    // Its "done" button carries the NEXT entry's id (8), so the chain never
    // skips, plus the on-demand action buttons (the reveal did not auto-send the
    // tafseer/audio, so they are one tap away).
    expect(h.sendConfirmPrompt).toHaveBeenCalledWith(
      expect.anything(),
      123n,
      8,
      expect.objectContaining({ tafseer: expect.any(Boolean), audio: expect.any(Boolean) }),
    );
    // A non-milestone advance leads with the short acknowledgement.
    expect(ctx.reply).toHaveBeenCalledWith(COPY.doneAck);
  });

  it('does NOT skip: the revealed ayah is the immediate next, not the one after', async () => {
    // The reported bug: done advanced silently to N+1, then /next skipped to N+2.
    // Now the reveal is always the immediate next (position 4 from position 3).
    const ctx = fakeCtx();
    await advanceAndShowNext(ctx as never, SUB, new Date());
    expect(h.getEntryAtPosition).toHaveBeenCalledTimes(1);
    expect(h.getEntryAtPosition).toHaveBeenCalledWith(1, 4); // 3 -> 4, never 3 -> 5
  });

  it('just starts (no advance) when the subscriber has not started yet', async () => {
    const notStarted = { ...(SUB as object), currentEntryId: null } as never;
    const ctx = fakeCtx();
    await advanceAndShowNext(ctx as never, notStarted, new Date());
    expect(h.setStartPosition).toHaveBeenCalledWith(1, 7); // begins at the current entry
    expect(h.confirmRead).not.toHaveBeenCalled(); // nothing to advance past
    expect(h.sendAyahNow).toHaveBeenCalledTimes(1);
    expect(ctx.reply).not.toHaveBeenCalledWith(COPY.doneAck); // no "advanced" ack on a fresh start
  });
});
