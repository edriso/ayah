import { describe, it, expect, beforeEach, vi } from 'vitest';

// Only the Prisma client is stubbed; the functions under test are pure logic
// around a conditional updateMany (the idempotency guard) plus a boolean read.
const h = vi.hoisted(() => ({ updateMany: vi.fn() }));
vi.mock('../client', () => ({ prisma: { subscriber: { updateMany: h.updateMany } } }));

import { isPaused, pauseSubscriber, resumeSubscriber } from './pause.service';

beforeEach(() => vi.clearAllMocks());

describe('isPaused', () => {
  it('reflects the pausedAt timestamp', () => {
    expect(isPaused({ pausedAt: null })).toBe(false);
    expect(isPaused({ pausedAt: new Date() })).toBe(true);
  });
});

describe('pauseSubscriber (idempotent start of a break)', () => {
  it('starts a break only while active, keeping the original "since" time, and reports it started', async () => {
    h.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date('2026-06-01T00:00:00Z');
    expect(await pauseSubscriber(7, now)).toBe(true);
    // Compare-and-set: matches only a row that is NOT already paused, so a
    // second pause cannot overwrite the original pausedAt.
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 7, pausedAt: null },
      data: { pausedAt: now },
    });
  });

  it('is a no-op (returns false) when already paused', async () => {
    h.updateMany.mockResolvedValue({ count: 0 });
    expect(await pauseSubscriber(7)).toBe(false);
  });
});

describe('resumeSubscriber (idempotent end of a break)', () => {
  it('clears a break only when one is set, and reports it cleared', async () => {
    h.updateMany.mockResolvedValue({ count: 1 });
    expect(await resumeSubscriber(7)).toBe(true);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 7, pausedAt: { not: null } },
      data: { pausedAt: null },
    });
  });

  it('is a no-op (returns false) when not paused', async () => {
    h.updateMany.mockResolvedValue({ count: 0 });
    expect(await resumeSubscriber(7)).toBe(false);
  });
});
