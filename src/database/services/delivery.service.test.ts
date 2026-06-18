import { describe, it, expect, beforeEach, vi } from 'vitest';

// The read-gated rules touch the database here (record without advancing, the
// done compare-and-set, the missed-day count). Mock the Prisma client so the
// SQL-shaped logic can be asserted without a real database. advancePosition is
// the real core math (via getEntryAtPosition in quran.service).
const h = vi.hoisted(() => ({
  subUpdate: vi.fn(),
  subUpdateMany: vi.fn(),
  logCreate: vi.fn(),
  logUpdateMany: vi.fn(),
  logFindFirst: vi.fn(),
  logCount: vi.fn(),
  entryFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../client', () => ({
  prisma: {
    subscriber: { update: h.subUpdate, updateMany: h.subUpdateMany },
    deliveryLog: {
      create: h.logCreate,
      updateMany: h.logUpdateMany,
      findFirst: h.logFindFirst,
      count: h.logCount,
    },
    trackEntry: { findUnique: h.entryFindUnique },
    $transaction: h.transaction,
  },
}));

import {
  commitDelivery,
  confirmRead,
  getLatestUnconfirmedDelivery,
  countUnreadDeliveriesBefore,
} from './delivery.service';

const NOW = new Date('2026-06-18T06:00:00Z');
const TOTAL = 6236;
// confirmRead/commitDelivery only read id, position, trackId off the entry.
const ENTRY = { id: 7, position: 3, trackId: 1 } as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.subUpdate.mockResolvedValue({});
  h.logCreate.mockResolvedValue({});
  h.logUpdateMany.mockResolvedValue({ count: 1 });
  h.entryFindUnique.mockResolvedValue({ id: 8 });
  h.transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('commitDelivery (records, no advance)', () => {
  it('records the day and sets currentEntryId to the delivered entry (no advance)', async () => {
    const res = await commitDelivery({
      subscriberId: 1,
      entry: ENTRY,
      scheduledFor: '2026-06-18',
      startedAt: new Date(),
      now: NOW,
    });
    expect(res).toBe('sent');
    expect(h.logCreate.mock.calls[0][0].data).toMatchObject({ trackEntryId: 7, status: 'sent' });
    // The pointer is set to the delivered entry — NOT advanced to a next entry.
    expect(h.subUpdate.mock.calls[0][0].data).toMatchObject({ currentEntryId: 7 });
    expect(h.entryFindUnique).not.toHaveBeenCalled(); // no next-entry lookup on send
  });

  it('stamps startedAt only on the first delivery', async () => {
    await commitDelivery({
      subscriberId: 1,
      entry: ENTRY,
      scheduledFor: '2026-06-18',
      startedAt: null,
      now: NOW,
    });
    expect(h.subUpdate.mock.calls[0][0].data).toMatchObject({ startedAt: NOW });
  });

  it('reports a duplicate (the per-day unique lock) instead of throwing', async () => {
    h.transaction.mockRejectedValueOnce({ code: 'P2002' });
    const res = await commitDelivery({
      subscriberId: 1,
      entry: ENTRY,
      scheduledFor: '2026-06-18',
      startedAt: new Date(),
      now: NOW,
    });
    expect(res).toBe('duplicate');
  });
});

describe('confirmRead (the done compare-and-set)', () => {
  it('advances to the next entry and marks unread days done when still on the entry', async () => {
    h.subUpdateMany.mockResolvedValue({ count: 1 }); // matched: still on entry 7
    const res = await confirmRead({
      subscriberId: 1,
      entry: ENTRY,
      totalEntries: TOTAL,
      loops: true,
      now: NOW,
    });
    expect(res).toBe('advanced');
    // Next entry is position 4 (advancePosition(3, ...)); compare-and-set guards
    // on currentEntryId still being the confirmed entry.
    expect(h.entryFindUnique.mock.calls[0][0].where).toMatchObject({
      trackId_position: { trackId: 1, position: 4 },
    });
    expect(h.subUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 1, currentEntryId: 7 },
      data: { currentEntryId: 8 },
    });
    expect(h.logUpdateMany).toHaveBeenCalledWith({
      where: { subscriberId: 1, status: 'sent', confirmedAt: null },
      data: { confirmedAt: NOW },
    });
  });

  it('is a no-op ("already") when the position already moved (stale/double tap)', async () => {
    h.subUpdateMany.mockResolvedValue({ count: 0 });
    const res = await confirmRead({
      subscriberId: 1,
      entry: ENTRY,
      totalEntries: TOTAL,
      loops: true,
      now: NOW,
    });
    expect(res).toBe('already');
    expect(h.logUpdateMany).not.toHaveBeenCalled(); // nothing marked, no double-advance
  });

  it('clears the pointer at the end of a non-looping track', async () => {
    h.subUpdateMany.mockResolvedValue({ count: 1 });
    const lastEntry = { id: 9, position: TOTAL - 1, trackId: 1 } as never;
    await confirmRead({
      subscriberId: 1,
      entry: lastEntry,
      totalEntries: TOTAL,
      loops: false,
      now: NOW,
    });
    expect(h.entryFindUnique).not.toHaveBeenCalled(); // nextPosition is null
    expect(h.subUpdateMany.mock.calls[0][0].data).toMatchObject({ currentEntryId: null });
  });
});

describe('getLatestUnconfirmedDelivery / countUnreadDeliveriesBefore', () => {
  it('reads the most recent unconfirmed sent delivery', async () => {
    h.logFindFirst.mockResolvedValue({ trackEntryId: 7 });
    expect(await getLatestUnconfirmedDelivery(1)).toEqual({ trackEntryId: 7 });
    expect(h.logFindFirst.mock.calls[0][0]).toMatchObject({
      where: { subscriberId: 1, status: 'sent', confirmedAt: null },
      orderBy: { scheduledFor: 'desc' },
    });
  });

  it('counts unconfirmed sent days strictly before today', async () => {
    h.logCount.mockResolvedValue(3);
    expect(await countUnreadDeliveriesBefore(1, '2026-06-18')).toBe(3);
    expect(h.logCount.mock.calls[0][0]).toMatchObject({
      where: {
        subscriberId: 1,
        status: 'sent',
        confirmedAt: null,
        scheduledFor: { lt: '2026-06-18' },
      },
    });
  });
});
